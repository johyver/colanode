import crypto from 'node:crypto';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import {
  SelectAgent,
  SelectAgentBlogPilot,
  SelectAgentDelegation,
} from '@colanode/server/data/schema';
import { agentRuntime } from '@colanode/server/lib/agents/agent-runtime';
import {
  decryptCredential,
  encryptCredential,
} from '@colanode/server/lib/ai/credential-crypto';
import { config } from '@colanode/server/lib/config';
import { eventBus } from '@colanode/server/lib/event-bus';
import { jobService } from '@colanode/server/services/job-service';
import { Event } from '@colanode/server/types/events';

export type TriggerConfig = {
  intervalSeconds?: number;
  events?: string[];
  taskTemplate?: string;
  dryRun?: boolean;
};
export type TriggerInput = {
  workspaceId: string;
  agentId: string;
  name: string;
  kind: 'manual' | 'schedule' | 'database' | 'webhook';
  config: TriggerConfig;
  enabled?: boolean;
  webhookSecret?: string;
};
export type PilotStage = 'author' | 'research' | 'content' | 'textmetrics' | 'review';

const pilotStages: PilotStage[] = ['author', 'research', 'content', 'textmetrics', 'review'];
const masterKey = () =>
  (config.ai.enabled ? config.ai.credentialsMasterKey : '') ||
  process.env.AI_CREDENTIALS_MASTER_KEY ||
  '';
const asJson = <T>(value: T): T => value;
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

class AgentAutomationService {
  private initialized = false;

  public init() {
    if (this.initialized) return;
    this.initialized = true;
    eventBus.subscribe((event) => {
      void this.handleDatabaseEvent(event);
    });
  }

  public async listTriggers(workspaceId: string) {
    return database.selectFrom('agent_triggers').selectAll()
      .where('workspace_id', '=', workspaceId).orderBy('created_at', 'desc').execute();
  }

  public async createTrigger(input: TriggerInput) {
    await this.getActiveAgent(input.workspaceId, input.agentId);
    const now = new Date();
    let secret: Record<string, unknown> | null = null;
    let returnedSecret: string | null = null;
    if (input.kind === 'webhook') {
      returnedSecret = input.webhookSecret?.trim() || crypto.randomBytes(24).toString('hex');
      if (!masterKey()) throw new Error('Webhook secret storage is not configured. Set AI_CREDENTIALS_MASTER_KEY.');
      secret = encryptCredential(returnedSecret, masterKey()) as unknown as Record<string, unknown>;
    }
    const trigger = await database.insertInto('agent_triggers').values({
      id: generateId(IdType.Event), workspace_id: input.workspaceId, agent_id: input.agentId,
      name: input.name.trim(), kind: input.kind, enabled: input.enabled ?? true,
      config: JSON.stringify(input.config), secret: secret ? JSON.stringify(secret) : null,
      last_fired_at: null, last_error: null, created_at: now, updated_at: now,
    }).returningAll().executeTakeFirstOrThrow();
    return { trigger, webhookSecret: returnedSecret };
  }

  public async updateTrigger(workspaceId: string, triggerId: string, values: { name?: string; enabled?: boolean; config?: TriggerConfig }) {
    const current = await this.getTrigger(workspaceId, triggerId);
    return database.updateTable('agent_triggers').set({
      name: values.name?.trim() || current.name,
      enabled: values.enabled ?? current.enabled,
      config: values.config ? JSON.stringify(values.config) : JSON.stringify(current.config),
      updated_at: new Date(),
    }).where('id', '=', triggerId).returningAll().executeTakeFirstOrThrow();
  }

  public async removeTrigger(workspaceId: string, triggerId: string) {
    const result = await database.deleteFrom('agent_triggers').where('workspace_id', '=', workspaceId).where('id', '=', triggerId).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  public async fireTrigger(workspaceId: string, triggerId: string, payload: Record<string, unknown>, source: 'manual' | 'schedule' | 'database' | 'webhook', eventKey: string) {
    const trigger = await this.getTrigger(workspaceId, triggerId);
    if (!trigger.enabled) return { status: 'ignored' as const, triggerId, eventKey };
    const now = new Date();
    const event = await database.insertInto('agent_trigger_events').values({
      id: generateId(IdType.Event), trigger_id: trigger.id, event_key: eventKey, source,
      payload: JSON.stringify(payload), status: 'accepted', run_id: null, error: null,
      received_at: now, processed_at: null,
    }).onConflict((oc) => oc.columns(['trigger_id', 'event_key']).doNothing()).returningAll().executeTakeFirst();
    if (!event) return { status: 'duplicate' as const, triggerId, eventKey };
    try {
      const triggerConfig = asJson(trigger.config) as TriggerConfig;
      const taskTemplate = triggerConfig.taskTemplate || ('Run ' + trigger.name + ' for the received event.');
      const task = taskTemplate.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => String(path.split('.').reduce<unknown>((value, segment) => value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined, payload) ?? ''));
      const actions = triggerConfig.dryRun === false ? [] : [{ kind: 'note' as const, message: 'Trigger accepted: ' + trigger.name, idempotencyKey: 'trigger:' + trigger.id + ':' + eventKey }];
      const run = await agentRuntime.createRun({
        accountId: await this.ownerAccount(workspaceId), workspaceId, agentId: trigger.agent_id, task, actions, maxSteps: 16,
      });
      await jobService.addJob({ type: 'agent.run.execute', runId: run.id }, {
        jobId: 'trigger-' + trigger.id + '-' + eventKey.replace(/[^a-zA-Z0-9_-]/g, '_'), attempts: 1, removeOnComplete: false, removeOnFail: 1000,
      });
      await database.updateTable('agent_trigger_events').set({ run_id: run.id, processed_at: new Date() }).where('id', '=', event.id).execute();
      await database.updateTable('agent_triggers').set({ last_fired_at: now, last_error: null, updated_at: now }).where('id', '=', trigger.id).execute();
      return { status: 'accepted' as const, triggerId, eventKey, runId: run.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Trigger dispatch failed.';
      await database.updateTable('agent_trigger_events').set({ status: 'failed', error: JSON.stringify({ code: 'trigger_dispatch_failed', message }), processed_at: new Date() }).where('id', '=', event.id).execute();
      await database.updateTable('agent_triggers').set({ last_error: message, updated_at: new Date() }).where('id', '=', trigger.id).execute();
      throw error;
    }
  }

  public async tickSchedules() {
    const triggers = await database.selectFrom('agent_triggers').selectAll().where('kind', '=', 'schedule').where('enabled', '=', true).execute();
    const results: unknown[] = [];
    for (const trigger of triggers) {
      const interval = Math.max(60, Number((asJson(trigger.config) as TriggerConfig).intervalSeconds || 3600));
      if (!trigger.last_fired_at || Date.now() - trigger.last_fired_at.getTime() >= interval * 1000) {
        results.push(await this.fireTrigger(trigger.workspace_id, trigger.id, { scheduledAt: new Date().toISOString() }, 'schedule', 'schedule:' + trigger.id + ':' + Math.floor(Date.now() / (interval * 1000))));
      }
    }
    return results;
  }

  public async listDelegations(workspaceId: string) {
    return database.selectFrom('agent_delegations').selectAll().where('workspace_id', '=', workspaceId).orderBy('created_at', 'desc').limit(50).execute();
  }

  public async listApprovals(workspaceId: string) {
    return database.selectFrom('agent_approvals').selectAll().where('workspace_id', '=', workspaceId).orderBy('created_at', 'desc').limit(50).execute();
  }

  public async proposeDelegation(input: { workspaceId: string; accountId: string; parentRunId?: string; parentAgentId: string; childAgentId: string; context: Record<string, unknown>; requestedPermissions: string[]; requiresApproval?: boolean }) {
    const [parent, child] = await Promise.all([this.getActiveAgent(input.workspaceId, input.parentAgentId), this.getActiveAgent(input.workspaceId, input.childAgentId)]);
    const missing = input.requestedPermissions.filter((permission) => !parent.permissions.includes(permission) || !child.permissions.includes(permission));
    if (missing.length) throw new Error('Delegation cannot elevate permissions: ' + missing.join(', '));
    const requiresApproval = input.requiresApproval !== false;
    const now = new Date();
    const delegation = await database.insertInto('agent_delegations').values({
      id: generateId(IdType.Event), workspace_id: input.workspaceId, owner_account_id: input.accountId,
      parent_run_id: input.parentRunId ?? null, parent_agent_id: parent.id, child_run_id: null, child_agent_id: child.id,
      status: requiresApproval ? 'waiting' : 'approved', context: JSON.stringify(input.context),
      requested_permissions: JSON.stringify(input.requestedPermissions), requires_approval: requiresApproval,
      created_at: now, updated_at: now,
    }).returningAll().executeTakeFirstOrThrow();
    if (requiresApproval) {
      await database.insertInto('agent_approvals').values({
        id: generateId(IdType.Event), workspace_id: input.workspaceId, run_id: input.parentRunId ?? null,
        delegation_id: delegation.id, kind: 'delegation', status: 'pending', requested_by: input.accountId,
        decided_by: null, decision_note: null, payload: JSON.stringify({ childAgentId: child.id, context: input.context, requestedPermissions: input.requestedPermissions }),
        created_at: now, updated_at: now,
      }).execute();
      return delegation;
    }
    return this.startDelegation(delegation);
  }

  public async decideDelegation(workspaceId: string, accountId: string, delegationId: string, decision: 'approved' | 'rejected', note?: string) {
    const delegation = await database.selectFrom('agent_delegations').selectAll().where('workspace_id', '=', workspaceId).where('id', '=', delegationId).executeTakeFirstOrThrow();
    const approval = await database.selectFrom('agent_approvals').selectAll().where('delegation_id', '=', delegationId).where('status', '=', 'pending').executeTakeFirst();
    if (approval) await database.updateTable('agent_approvals').set({ status: decision, decided_by: accountId, decision_note: note ?? null, updated_at: new Date() }).where('id', '=', approval.id).execute();
    if (decision === 'rejected') return database.updateTable('agent_delegations').set({ status: 'rejected', updated_at: new Date() }).where('id', '=', delegationId).returningAll().executeTakeFirstOrThrow();
    return this.startDelegation(delegation);
  }

  public async createPilot(input: { workspaceId: string; accountId: string; title: string; content?: Record<string, unknown> }) {
    const now = new Date();
    return database.insertInto('agent_blog_pilots').values({
      id: generateId(IdType.Event), workspace_id: input.workspaceId, owner_account_id: input.accountId,
      title: input.title.trim(), stage: 'draft', status: 'ready',
      content: JSON.stringify(input.content ?? { author: '', research: '', body: '', textmetrics: { analyzed: false, recommendations: [] } }),
      review_decision: null, publication_blocked: true, created_at: now, updated_at: now,
    }).returningAll().executeTakeFirstOrThrow();
  }

  public async runPilot(workspaceId: string, accountId: string, pilotId: string, agentIds: Partial<Record<PilotStage, string>>) {
    const pilot = await database.selectFrom('agent_blog_pilots').selectAll().where('workspace_id', '=', workspaceId).where('id', '=', pilotId).executeTakeFirstOrThrow();
    const content = asJson(pilot.content) as Record<string, unknown>;
    for (let index = 0; index < pilotStages.length; index += 1) {
      const stage = pilotStages[index]!;
      const agentId = agentIds[stage] ?? Object.values(agentIds)[0];
      if (!agentId) throw new Error('No agent assigned for ' + stage + ' stage.');
      const run = await agentRuntime.createRun({
        accountId, workspaceId, agentId, task: 'Blog pilot ' + stage + ': ' + pilot.title,
        actions: [{ kind: 'note', message: 'Completed nonproduction ' + stage + ' stage for ' + pilot.title, idempotencyKey: 'pilot:' + pilot.id + ':' + stage }],
        maxSteps: 4,
      });
      await agentRuntime.executeRun(run.id);
      const output = stage === 'textmetrics'
        ? { stage, decision: 'recommendations_ready', recommendations: ['Clarify the target reader in the opening.', 'Add one concrete supporting example.', 'Keep the draft in review until a human approves it.'], productionPublication: 'blocked' }
        : { stage, decision: stage === 'review' ? 'pending' : 'completed', productionPublication: 'blocked' };
      await database.insertInto('agent_blog_pilot_steps').values({
        id: generateId(IdType.Event), pilot_id: pilot.id, sequence: index + 1, stage, status: 'succeeded',
        agent_id: agentId, run_id: run.id, input: JSON.stringify({ title: pilot.title, content }),
        output: JSON.stringify(output), created_at: new Date(),
      }).execute();
      content[stage] = output;
      await database.updateTable('agent_blog_pilots').set({ stage, status: 'review', content: JSON.stringify(content), updated_at: new Date() }).where('id', '=', pilot.id).execute();
    }
    return this.getPilot(workspaceId, pilot.id);
  }

  public async decidePilotReview(workspaceId: string, pilotId: string, decision: 'approved' | 'rejected', _note?: string) {
    const pilot = await database.selectFrom('agent_blog_pilots').selectAll().where('workspace_id', '=', workspaceId).where('id', '=', pilotId).executeTakeFirstOrThrow();
    if (pilot.stage !== 'review') throw new Error('Blog pilot is not ready for review.');
    return database.updateTable('agent_blog_pilots').set({
      review_decision: decision,
      status: decision === 'approved' ? 'approved' : 'needs_revision',
      publication_blocked: true,
      updated_at: new Date(),
    }).where('id', '=', pilot.id).returningAll().executeTakeFirstOrThrow();
  }

  public async listPilots(workspaceId: string) {
    const pilots = await database.selectFrom('agent_blog_pilots').selectAll().where('workspace_id', '=', workspaceId).orderBy('created_at', 'desc').execute();
    return Promise.all(pilots.map((pilot) => this.withPilotSteps(pilot)));
  }

  public async getPilot(workspaceId: string, pilotId: string) {
    const pilot = await database.selectFrom('agent_blog_pilots').selectAll().where('workspace_id', '=', workspaceId).where('id', '=', pilotId).executeTakeFirstOrThrow();
    return this.withPilotSteps(pilot);
  }

  public async verifyWebhook(workspaceId: string, triggerId: string, body: string, signature: string) {
    const trigger = await this.getTrigger(workspaceId, triggerId);
    if (trigger.kind !== 'webhook' || !trigger.secret) throw new Error('Webhook trigger not found.');
    const encrypted = trigger.secret as unknown as { ciphertext: string; iv: string; authTag: string };
    const secret = decryptCredential(encrypted, masterKey());
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const provided = signature.replace(/^sha256=/, '').trim();
    if (provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) throw new Error('Invalid webhook signature.');
    return trigger;
  }

  private async startDelegation(delegation: SelectAgentDelegation) {
    const run = await agentRuntime.createRun({
      accountId: delegation.owner_account_id, workspaceId: delegation.workspace_id, agentId: delegation.child_agent_id,
      task: 'Delegated task from agent ' + delegation.parent_agent_id,
      actions: [{ kind: 'note', message: 'Delegated task accepted with scoped context.', idempotencyKey: 'delegation:' + delegation.id }],
      maxSteps: 8,
    });
    await jobService.addJob({ type: 'agent.run.execute', runId: run.id }, { jobId: 'delegation-' + delegation.id, attempts: 1, removeOnComplete: false, removeOnFail: 1000 });
    return database.updateTable('agent_delegations').set({ child_run_id: run.id, status: 'queued', updated_at: new Date() }).where('id', '=', delegation.id).returningAll().executeTakeFirstOrThrow();
  }

  private async handleDatabaseEvent(event: Event) {
    if (!event.type.startsWith('node.') || !('workspaceId' in event)) return;
    const triggers = await database.selectFrom('agent_triggers').selectAll().where('kind', '=', 'database').where('enabled', '=', true).where('workspace_id', '=', event.workspaceId).execute();
    for (const trigger of triggers) {
      const triggerConfig = asJson(trigger.config) as TriggerConfig;
      if (triggerConfig.events?.length && !triggerConfig.events.includes(event.type)) continue;
      const nodeId = 'nodeId' in event ? event.nodeId : '';
      await this.fireTrigger(event.workspaceId, trigger.id, { eventType: event.type, nodeId, workspaceId: event.workspaceId }, 'database', event.type + ':' + nodeId);
    }
  }

  private async withPilotSteps(pilot: SelectAgentBlogPilot) {
    const steps = await database.selectFrom('agent_blog_pilot_steps').selectAll().where('pilot_id', '=', pilot.id).orderBy('sequence', 'asc').execute();
    return { id: pilot.id, title: pilot.title, stage: pilot.stage, status: pilot.status, content: pilot.content, reviewDecision: pilot.review_decision, publicationBlocked: pilot.publication_blocked, createdAt: iso(pilot.created_at), updatedAt: iso(pilot.updated_at), steps };
  }

  private async getTrigger(workspaceId: string, triggerId: string) {
    const trigger = await database.selectFrom('agent_triggers').selectAll().where('workspace_id', '=', workspaceId).where('id', '=', triggerId).executeTakeFirst();
    if (!trigger) throw new Error('Trigger not found.');
    return trigger;
  }

  private async getActiveAgent(workspaceId: string, agentId: string): Promise<SelectAgent> {
    const agent = await database.selectFrom('agents').selectAll().where('workspace_id', '=', workspaceId).where('id', '=', agentId).executeTakeFirst();
    if (!agent || agent.lifecycle !== 'active') throw new Error('Only an Active agent can be used for automation.');
    return agent;
  }

  private async ownerAccount(workspaceId: string) {
    const user = await database.selectFrom('users').select('account_id').where('workspace_id', '=', workspaceId).where('role', 'in', ['owner', 'admin']).orderBy('created_at', 'asc').executeTakeFirst();
    if (!user) throw new Error('Workspace owner not found.');
    return user.account_id;
  }
}

export const agentAutomation = new AgentAutomationService();
