import { FastifyReply } from 'fastify';
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode, apiErrorOutputSchema } from '@colanode/core';
import type { SelectAgentRun, SelectAgentRunStep, SelectAgentActionLedger } from '@colanode/server/data/schema';
import { AgentRuntimeError, agentRuntime } from '@colanode/server/lib/agents/agent-runtime';
import { jobService } from '@colanode/server/services/job-service';

const actionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('note'),
    message: z.string().trim().min(1).max(5000),
    idempotencyKey: z.string().trim().min(1).max(256).optional(),
  }),
  z.object({
    kind: z.literal('mcp'),
    connectionId: z.string().trim().min(1),
    toolName: z.string().trim().min(1).max(256),
    arguments: z.record(z.string(), z.unknown()).default({}),
    approvalId: z.string().trim().min(1).optional(),
    idempotencyKey: z.string().trim().min(1).max(256).optional(),
  }),
]);

const runStatusSchema = z.enum(['queued', 'running', 'waiting', 'paused', 'succeeded', 'failed', 'canceled']);
const runSchema = z.object({
  id: z.string(), workspaceId: z.string(), accountId: z.string(), agentId: z.string(), agentName: z.string().optional(),
  status: runStatusSchema, input: z.record(z.string(), z.unknown()), output: z.record(z.string(), z.unknown()).nullable(),
  error: z.record(z.string(), z.unknown()).nullable(), currentStep: z.number(), maxSteps: z.number(), retryCount: z.number(),
  nextRetryAt: z.string().nullable(), startedAt: z.string().nullable(), finishedAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});
const stepSchema = z.object({
  id: z.string(), runId: z.string(), sequence: z.number(), kind: z.string(), status: z.string(), actionKey: z.string().nullable(),
  input: z.record(z.string(), z.unknown()).nullable(), result: z.record(z.string(), z.unknown()).nullable(), error: z.record(z.string(), z.unknown()).nullable(),
  startedAt: z.string().nullable(), finishedAt: z.string().nullable(), createdAt: z.string(),
});
const actionLedgerSchema = z.object({
  id: z.string(), runId: z.string(), actionKey: z.string(), actionType: z.string(), status: z.string(),
  input: z.record(z.string(), z.unknown()).nullable(), result: z.record(z.string(), z.unknown()).nullable(), error: z.record(z.string(), z.unknown()).nullable(),
  attempts: z.number(), createdAt: z.string(), updatedAt: z.string(),
});
const errorResponse = { 400: apiErrorOutputSchema, 404: apiErrorOutputSchema, 409: apiErrorOutputSchema };

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
const toRun = (run: SelectAgentRun & { agent_name?: string }) => ({
  id: run.id, workspaceId: run.workspace_id, accountId: run.account_id, agentId: run.agent_id, ...(run.agent_name ? { agentName: run.agent_name } : {}),
  status: run.status, input: run.input, output: run.output, error: run.error, currentStep: run.current_step, maxSteps: run.max_steps,
  retryCount: run.retry_count, nextRetryAt: iso(run.next_retry_at), startedAt: iso(run.started_at), finishedAt: iso(run.finished_at),
  heartbeatAt: iso(run.heartbeat_at), createdAt: run.created_at.toISOString(), updatedAt: run.updated_at.toISOString(),
});
const toStep = (step: SelectAgentRunStep) => ({
  id: step.id, runId: step.run_id, sequence: step.sequence, kind: step.kind, status: step.status, actionKey: step.action_key,
  input: step.input, result: step.result, error: step.error, startedAt: iso(step.started_at), finishedAt: iso(step.finished_at), createdAt: step.created_at.toISOString(),
});
const toAction = (action: SelectAgentActionLedger) => ({
  id: action.id, runId: action.run_id, actionKey: action.action_key, actionType: action.action_type, status: action.status,
  input: action.input, result: action.result, error: action.error, attempts: action.attempts, createdAt: action.created_at.toISOString(), updatedAt: action.updated_at.toISOString(),
});
const sendError = (reply: FastifyReply, error: unknown) => {
  const runtimeError = error instanceof AgentRuntimeError;
  return reply.code(runtimeError && error.message.includes('finished') ? 409 : error instanceof AgentRuntimeError && error.message.includes('not found') ? 404 : 400).send({
    code: runtimeError && error.message.includes('not found') ? ApiErrorCode.NotFound : ApiErrorCode.BadRequest,
    message: error instanceof Error ? error.message : 'Agent run request failed.',
  });
};

const enqueueRun = async (runId: string) => {
  await jobService.addJob({ type: 'agent.run.execute', runId }, { jobId: `agent-run-${runId}-${Date.now()}`, attempts: 1, removeOnComplete: false, removeOnFail: 1000 });
};

export const agentRunRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'GET', url: '/agent-runs',
    schema: { params: z.object({ workspaceId: z.string() }), response: { 200: z.object({ runs: z.array(runSchema) }) } },
    handler: async (request) => ({ runs: (await agentRuntime.listRuns(request.account.id, request.params.workspaceId)).map((run) => toRun(run as SelectAgentRun & { agent_name?: string })) }),
  });

  instance.route({
    method: 'GET', url: '/agent-runs/:runId',
    schema: { params: z.object({ workspaceId: z.string(), runId: z.string() }), response: { 200: z.object({ run: runSchema, steps: z.array(stepSchema), actions: z.array(actionLedgerSchema) }), ...errorResponse } },
    handler: async (request, reply) => {
      try {
        const history = await agentRuntime.getHistory(request.account.id, request.params.workspaceId, request.params.runId);
        return { run: toRun(history.run), steps: history.steps.map(toStep), actions: history.actions.map(toAction) };
      } catch (error) { return sendError(reply, error); }
    },
  });

  instance.route({
    method: 'POST', url: '/agent-runs',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: z.object({ agentId: z.string().trim().min(1), task: z.string().trim().min(1).max(20000), actions: z.array(actionSchema).max(64).default([]), maxSteps: z.number().int().min(1).max(64).default(16) }),
      response: { 200: runSchema, ...errorResponse },
    },
    handler: async (request, reply) => {
      try {
        const run = await agentRuntime.createRun({ accountId: request.account.id, workspaceId: request.params.workspaceId, agentId: request.body.agentId, task: request.body.task, actions: request.body.actions, maxSteps: request.body.maxSteps });
        await enqueueRun(run.id);
        return toRun(run);
      } catch (error) { return sendError(reply, error); }
    },
  });

  instance.route({
    method: 'POST', url: '/agent-runs/:runId/resume',
    schema: { params: z.object({ workspaceId: z.string(), runId: z.string() }), body: z.object({ approvalId: z.string().trim().min(1).optional() }).default({}), response: { 200: runSchema, ...errorResponse } },
    handler: async (request, reply) => {
      try {
        const run = await agentRuntime.resumeRun({ accountId: request.account.id, workspaceId: request.params.workspaceId, runId: request.params.runId, approvalId: request.body.approvalId });
        await enqueueRun(run.id);
        return toRun(run);
      } catch (error) { return sendError(reply, error); }
    },
  });

  done();
};
