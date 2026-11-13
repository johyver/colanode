import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { AgentAutomationMutationInput } from '@colanode/client/mutations/workspaces/agent-automation';
import { AgentAutomation } from '@colanode/client/types/agent-automation';

export class AgentAutomationMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<AgentAutomationMutationInput> {
  public async handleMutation(input: AgentAutomationMutationInput): Promise<AgentAutomation | Record<string, unknown>> {
    const workspace = this.getWorkspace(input.userId);
    const base = 'v1/workspaces/' + workspace.workspaceId;
    try {
      const action = input.action;
      if (action.kind === 'trigger-toggle') return await workspace.account.client.patch(base + '/agent-triggers/' + action.triggerId, { json: { enabled: action.enabled } }).json<Record<string, unknown>>();
      if (action.kind === 'trigger-create') return await workspace.account.client.post(base + '/agent-triggers', { json: { agentId: action.agentId, name: action.name, kind: action.triggerKind, config: action.config, webhookSecret: action.webhookSecret } }).json<Record<string, unknown>>();
      if (action.kind === 'trigger-fire') return await workspace.account.client.post(base + '/agent-triggers/' + action.triggerId + '/fire', { json: { eventKey: action.eventKey, payload: action.payload ?? {} } }).json<Record<string, unknown>>();
      if (action.kind === 'delegation-propose') return await workspace.account.client.post(base + '/agent-delegations', { json: { parentAgentId: action.parentAgentId, childAgentId: action.childAgentId, context: action.context ?? {}, requestedPermissions: action.requestedPermissions ?? [], requiresApproval: action.requiresApproval ?? true } }).json<Record<string, unknown>>();
      if (action.kind === 'delegation-decide') return await workspace.account.client.post(base + '/agent-delegations/' + action.delegationId + '/decision', { json: { decision: action.decision, note: action.note } }).json<Record<string, unknown>>();
      if (action.kind === 'pilot-create') return await workspace.account.client.post(base + '/agent-blog-pilots', { json: { title: action.title } }).json<Record<string, unknown>>();
      if (action.kind === 'pilot-review') return await workspace.account.client.post(base + '/agent-blog-pilots/' + action.pilotId + '/review', { json: { decision: action.decision, note: action.note } }).json<Record<string, unknown>>();
      return await workspace.account.client.post(base + '/agent-blog-pilots/' + action.pilotId + '/run', { json: { agentIds: action.agentIds } }).json<Record<string, unknown>>();
    } catch (error) { const apiError = await parseApiError(error); throw new MutationError(MutationErrorCode.ApiError, apiError.message); }
  }
}
