import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import type {
  AgentRunStatus,
  AgentRunStepKind,
  AgentRunStepStatus,
  SelectAgent,
  SelectAgentRun,
} from '@colanode/server/data/schema';
import { AiCredentialVault } from '@colanode/server/lib/ai/credential-vault';
import {
  AiProviderGateway,
  aiPolicySchema,
} from '@colanode/server/lib/ai/provider-gateway';
import type { AiGatewayRequest } from '@colanode/server/lib/ai/provider-gateway';
import {
  completeUsageForLedger,
  enforceAiBudget,
  recordAiUsage,
} from '@colanode/server/lib/ai/usage-ledger';
import { config } from '@colanode/server/lib/config';
import {
  McpToolApprovalRequiredError,
  McpToolPermissionDeniedError,
  McpToolSecurityManager,
} from '@colanode/server/lib/mcp/tool-security';

export type AgentRunAction =
  | {
      kind: 'note';
      message: string;
      idempotencyKey?: string;
    }
  | {
      kind: 'mcp';
      connectionId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      approvalId?: string;
      idempotencyKey?: string;
    };

export type AgentRunInput = {
  task: string;
  actions: AgentRunAction[];
};

export type AgentRuntimeErrorDetails = {
  code: string;
  message: string;
  retryable: boolean;
  auditId?: string;
  correlationId?: string;
};

export class AgentRuntimeError extends Error {
  public readonly details: AgentRuntimeErrorDetails;

  public constructor(details: AgentRuntimeErrorDetails) {
    super(details.message);
    this.name = 'AgentRuntimeError';
    this.details = details;
  }
}

const terminalStatuses = new Set<AgentRunStatus>(['succeeded', 'failed', 'canceled']);

const parseJson = <T>(value: T): T => value;

const parseJsonRecord = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const defaultAiPolicy = aiPolicySchema.parse({
  localOnly: false,
  allowCloudFallback: false,
  fallbackProvider: null,
  fallbackModel: null,
  monthlySpendUsd: null,
  monthlyTokens: null,
});

const toErrorDetails = (error: unknown): AgentRuntimeErrorDetails => {
  if (error instanceof AgentRuntimeError) return error.details;
  if (error instanceof McpToolApprovalRequiredError) {
    return {
      code: 'approval_required',
      message: error.message,
      retryable: false,
      auditId: error.auditId,
      correlationId: error.correlationId,
    };
  }
  if (error instanceof McpToolPermissionDeniedError) {
    return {
      code: 'permission_denied',
      message: error.message,
      retryable: false,
      auditId: error.auditId,
      correlationId: error.correlationId,
    };
  }
  return {
    code: 'runtime_error',
    message: error instanceof Error ? error.message : 'Agent action failed.',
    retryable: false,
  };
};

export class AgentRuntime {
  private readonly gateway = new AiProviderGateway({ config: config.ai });
  private readonly credentialVault = new AiCredentialVault();
  private readonly security = new McpToolSecurityManager();

  public async createRun(input: {
    accountId: string;
    workspaceId: string;
    agentId: string;
    task: string;
    actions: AgentRunAction[];
    maxSteps: number;
  }): Promise<SelectAgentRun> {
    const agent = await this.getAgent(input.workspaceId, input.agentId);
    if (agent.lifecycle !== 'active') {
      throw new AgentRuntimeError({
        code: 'agent_not_active',
        message: 'Only Active agents can start a run.',
        retryable: false,
      });
    }
    const now = new Date();
    return database
      .insertInto('agent_runs')
      .values({
        id: generateId(IdType.Job),
        workspace_id: input.workspaceId,
        account_id: input.accountId,
        agent_id: input.agentId,
        status: 'queued',
        input: JSON.stringify({ task: input.task, actions: input.actions }),
        output: null,
        error: null,
        current_step: 0,
        max_steps: input.maxSteps,
        retry_count: 0,
        next_retry_at: null,
        started_at: null,
        finished_at: null,
        heartbeat_at: null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  public async resumeRun(input: {
    accountId: string;
    workspaceId: string;
    runId: string;
    approvalId?: string;
  }): Promise<SelectAgentRun> {
    const run = await this.getRun(input.accountId, input.workspaceId, input.runId);
    if (terminalStatuses.has(run.status)) {
      throw new AgentRuntimeError({ code: 'run_finished', message: 'This run is already finished.', retryable: false });
    }
    const runInput = parseJson(run.input) as AgentRunInput;
    const currentAction = runInput.actions[run.current_step];
    if (input.approvalId && currentAction?.kind === 'mcp') {
      runInput.actions[run.current_step] = { ...currentAction, approvalId: input.approvalId };
    }
    return database
      .updateTable('agent_runs')
      .set({
        status: 'queued',
        input: JSON.stringify(runInput),
        error: null,
        next_retry_at: null,
        updated_at: new Date(),
      })
      .where('id', '=', run.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  public async executeRun(runId: string): Promise<void> {
    const run = await database.selectFrom('agent_runs').selectAll().where('id', '=', runId).executeTakeFirst();
    if (!run || terminalStatuses.has(run.status) || run.status === 'waiting') return;
    const agent = await this.getAgent(run.workspace_id, run.agent_id);
    const runInput = parseJson(run.input) as AgentRunInput;
    await this.updateRun(run.id, { status: 'running', started_at: run.started_at ?? new Date(), heartbeat_at: new Date() });

    try {
      if (runInput.actions.length > 0) {
        for (let index = run.current_step; index < runInput.actions.length; index += 1) {
          if (index >= run.max_steps) {
            throw new AgentRuntimeError({ code: 'step_limit_reached', message: `Agent run exceeded its ${run.max_steps}-step limit.`, retryable: false });
          }
          const action = runInput.actions[index];
          if (!action) break;
          const actionKey = action.idempotencyKey?.trim() || `${run.id}:action:${index}`;
          const result = await this.executeAction(run, agent, action, actionKey, index);
          await this.updateRun(run.id, { current_step: index + 1, heartbeat_at: new Date() });
          if (result.waiting) return;
        }
        await this.succeedRun(run.id, { text: `Completed ${runInput.actions.length} durable action(s).`, actionCount: runInput.actions.length });
        return;
      }

      const modelKey = `${run.id}:model:response`;
      const modelResult = await this.executeLedger(run, modelKey, 'model', run.current_step, { task: runInput.task }, async () => {
        const policy = await this.loadPolicy(run.workspace_id);
        const request: AiGatewayRequest = {
          task: 'response',
          messages: [
            { role: 'system' as const, content: agent.instructions },
            { role: 'user' as const, content: runInput.task },
          ],
          agentId: agent.id,
          agentSettings: {
            provider: agent.model.provider,
            model: agent.model.model,
            temperature: agent.model.temperature,
            ...(agent.model.maxOutputTokens != null ? { maxOutputTokens: agent.model.maxOutputTokens } : {}),
          },
          stream: false,
          timeoutMs: 30000,
          maxRetries: 2,
        };
        const selectedModel = this.gateway.resolveModel({ ...request, policy });
        await enforceAiBudget({
          accountId: run.account_id,
          workspaceId: run.workspace_id,
          agentId: agent.id,
          request,
          selectedSettings: selectedModel,
          agentBudget: agent.budget,
          policy,
        });

        const providers = new Set([
          selectedModel.provider,
          policy.allowCloudFallback ? policy.fallbackProvider : null,
        ]);
        const serverCredentials: Record<string, string> = {};
        for (const provider of providers) {
          if (provider !== 'openai' && provider !== 'google') continue;
          const key = await this.credentialVault.resolve(run.account_id, run.workspace_id, provider);
          if (key) serverCredentials[provider] = key;
        }
        const response = await this.gateway.chat({
          ...request,
          policy,
          ...(Object.keys(serverCredentials).length ? { serverCredentials } : {}),
        });
        const usage = completeUsageForLedger(response.usage, request, response.message.content);
        await recordAiUsage({
          accountId: run.account_id,
          workspaceId: run.workspace_id,
          agentId: agent.id,
          usage,
        });
        return { text: response.message.content, usage };
      });
      if (modelResult.waiting) return;
      await this.succeedRun(run.id, modelResult.result ?? { text: '' });
    } catch (error) {
      const details = toErrorDetails(error);
      if (details.code === 'approval_required') {
        await this.updateRun(run.id, { status: 'waiting', error: JSON.stringify(details), heartbeat_at: new Date() });
        return;
      }
      await this.failRun(run.id, details);
    }
  }

  public async listRuns(accountId: string, workspaceId: string) {
    return database
      .selectFrom('agent_runs')
      .innerJoin('agents', 'agents.id', 'agent_runs.agent_id')
      .select([
        'agent_runs.id', 'agent_runs.workspace_id', 'agent_runs.account_id', 'agent_runs.agent_id',
        'agent_runs.status', 'agent_runs.input', 'agent_runs.output', 'agent_runs.error',
        'agent_runs.current_step', 'agent_runs.max_steps', 'agent_runs.retry_count',
        'agent_runs.next_retry_at', 'agent_runs.started_at', 'agent_runs.finished_at',
        'agent_runs.heartbeat_at', 'agent_runs.created_at', 'agent_runs.updated_at',
        'agents.name as agent_name',
      ])
      .where('agent_runs.account_id', '=', accountId)
      .where('agent_runs.workspace_id', '=', workspaceId)
      .orderBy('agent_runs.created_at', 'desc')
      .limit(50)
      .execute();
  }

  public async getHistory(accountId: string, workspaceId: string, runId: string) {
    const run = await this.getRun(accountId, workspaceId, runId);
    const steps = await database.selectFrom('agent_run_steps').selectAll().where('run_id', '=', runId).orderBy('sequence', 'asc').execute();
    const actions = await database.selectFrom('agent_action_ledger').selectAll().where('run_id', '=', runId).orderBy('created_at', 'asc').execute();
    return { run, steps, actions };
  }

  private async executeAction(run: SelectAgentRun, agent: SelectAgent, action: AgentRunAction, actionKey: string, sequence: number) {
    if (action.kind === 'note') {
      return this.executeLedger(run, actionKey, 'note', sequence, action, async () => ({ message: action.message }));
    }
    if (!agent.mcp_tool_allowlist.includes(action.toolName)) {
      throw new AgentRuntimeError({ code: 'tool_not_allowlisted', message: `Tool ${action.toolName} is not in this agent's MCP allowlist.`, retryable: false });
    }
    if (!agent.permissions.includes('mcp:execute')) {
      throw new AgentRuntimeError({ code: 'permission_denied', message: 'This agent does not have the mcp:execute permission.', retryable: false });
    }
    return this.executeLedger(run, actionKey, 'tool', sequence, action, async () => {
      const result = await this.security.callTool({
        accountId: run.account_id,
        workspaceId: run.workspace_id,
        connectionId: action.connectionId,
        agentId: run.agent_id,
        toolName: action.toolName,
        arguments: action.arguments,
        approvalId: action.approvalId,
      });
      return { status: result.status, auditId: result.auditId, correlationId: result.correlationId, result: result.result };
    });
  }

  private async executeLedger(
    run: SelectAgentRun,
    actionKey: string,
    actionType: string,
    sequence: number,
    input: Record<string, unknown>,
    execute: () => Promise<Record<string, unknown>>
  ) {
    const existing = await database.selectFrom('agent_action_ledger').selectAll().where('run_id', '=', run.id).where('action_key', '=', actionKey).executeTakeFirst();
    if (existing?.status === 'succeeded') return { waiting: false, result: existing.result ?? undefined };
    if (existing?.status === 'running') {
      throw new AgentRuntimeError({ code: 'in_flight_action', message: 'An action is still marked running. Resume manually after confirming the external side effect.', retryable: false });
    }
    if (existing?.status === 'failed' && actionType === 'tool') {
      throw new AgentRuntimeError({ code: 'tool_retry_boundary', message: 'A tool action failed. Start a new run or provide a new idempotency key before retrying an external action.', retryable: false });
    }
    const now = new Date();
    if (existing) {
      await database.updateTable('agent_action_ledger').set({ status: 'running', attempts: existing.attempts + 1, error: null, updated_at: now }).where('id', '=', existing.id).execute();
    } else {
      await database.insertInto('agent_action_ledger').values({ id: generateId(IdType.Event), run_id: run.id, action_key: actionKey, action_type: actionType, status: 'running', input: JSON.stringify(input), result: null, error: null, attempts: 1, created_at: now, updated_at: now }).execute();
    }
    await this.upsertStep(run.id, sequence, actionType === 'model' ? 'model' : actionType === 'tool' ? 'tool' : 'note', 'running', actionKey, input, null, null);
    try {
      const result = await execute();
      await database.updateTable('agent_action_ledger').set({ status: 'succeeded', result: JSON.stringify(result), error: null, updated_at: new Date() }).where('run_id', '=', run.id).where('action_key', '=', actionKey).execute();
      await this.upsertStep(run.id, sequence, actionType === 'model' ? 'model' : actionType === 'tool' ? 'tool' : 'note', 'succeeded', actionKey, input, result, null);
      return { waiting: false, result };
    } catch (error) {
      const details = toErrorDetails(error);
      const waiting = details.code === 'approval_required';
      await database.updateTable('agent_action_ledger').set({ status: waiting ? 'waiting' : 'failed', error: JSON.stringify(details), updated_at: new Date() }).where('run_id', '=', run.id).where('action_key', '=', actionKey).execute();
      await this.upsertStep(run.id, sequence, actionType === 'model' ? 'model' : actionType === 'tool' ? 'tool' : 'note', waiting ? 'waiting' : 'failed', actionKey, input, null, details);
      throw error;
    }
  }

  private async upsertStep(
    runId: string,
    sequence: number,
    kind: AgentRunStepKind,
    status: AgentRunStepStatus,
    actionKey: string,
    input: Record<string, unknown>,
    result: Record<string, unknown> | null,
    error: AgentRuntimeErrorDetails | null
  ) {
    const existing = await database.selectFrom('agent_run_steps').select('id').where('run_id', '=', runId).where('sequence', '=', sequence).executeTakeFirst();
    const now = new Date();
    if (existing) {
      await database.updateTable('agent_run_steps').set({ kind, status, action_key: actionKey, input: JSON.stringify(input), result: result ? JSON.stringify(result) : null, error: error ? JSON.stringify(error) : null, started_at: status === 'running' ? now : undefined, finished_at: ['succeeded', 'failed', 'waiting'].includes(status) ? now : undefined }).where('id', '=', existing.id).execute();
      return;
    }
    await database.insertInto('agent_run_steps').values({ id: generateId(IdType.Event), run_id: runId, sequence, kind, status, action_key: actionKey, input: JSON.stringify(input), result: result ? JSON.stringify(result) : null, error: error ? JSON.stringify(error) : null, started_at: status === 'running' ? now : null, finished_at: ['succeeded', 'failed', 'waiting'].includes(status) ? now : null, created_at: now }).execute();
  }

  private async succeedRun(runId: string, output: Record<string, unknown>) {
    const now = new Date();
    await this.updateRun(runId, { status: 'succeeded', output: JSON.stringify(output), error: null, finished_at: now, heartbeat_at: now });
  }

  private async failRun(runId: string, error: AgentRuntimeErrorDetails) {
    const now = new Date();
    await this.updateRun(runId, { status: 'failed', error: JSON.stringify(error), finished_at: now, heartbeat_at: now });
  }

  private async updateRun(runId: string, values: Record<string, unknown>) {
    await database.updateTable('agent_runs').set(values as never).where('id', '=', runId).execute();
  }

  private async getAgent(workspaceId: string, agentId: string): Promise<SelectAgent> {
    const agent = await database.selectFrom('agents').selectAll().where('id', '=', agentId).where('workspace_id', '=', workspaceId).executeTakeFirst();
    if (!agent) throw new AgentRuntimeError({ code: 'agent_not_found', message: 'Agent was not found in this workspace.', retryable: false });
    return agent;
  }

  private async loadPolicy(workspaceId: string) {
    const workspace = await database
      .selectFrom('workspaces')
      .select('attrs')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    const ai = parseJsonRecord(parseJsonRecord(workspace?.attrs).ai);
    const parsed = aiPolicySchema.safeParse(parseJsonRecord(ai.policy));
    return parsed.success ? parsed.data : defaultAiPolicy;
  }

  private async getRun(accountId: string, workspaceId: string, runId: string): Promise<SelectAgentRun> {
    const run = await database.selectFrom('agent_runs').selectAll().where('id', '=', runId).where('account_id', '=', accountId).where('workspace_id', '=', workspaceId).executeTakeFirst();
    if (!run) throw new AgentRuntimeError({ code: 'run_not_found', message: 'Agent run was not found.', retryable: false });
    return run;
  }
}

export const agentRuntime = new AgentRuntime();
