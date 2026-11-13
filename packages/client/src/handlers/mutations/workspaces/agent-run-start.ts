import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { AgentRunStartMutationInput } from '@colanode/client/mutations/workspaces/agent-run-start';
import { AgentRun } from '@colanode/client/types/agent-runs';

export class AgentRunStartMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<AgentRunStartMutationInput> {
  public async handleMutation(input: AgentRunStartMutationInput): Promise<AgentRun> {
    const workspace = this.getWorkspace(input.userId);
    try { return await workspace.account.client.post(`v1/workspaces/${workspace.workspaceId}/agent-runs`, { json: { agentId: input.agentId, task: input.task, actions: input.actions ?? [], maxSteps: input.maxSteps ?? 16 } }).json<AgentRun>(); }
    catch (error) { const apiError = await parseApiError(error); throw new MutationError(MutationErrorCode.ApiError, apiError.message); }
  }
}
