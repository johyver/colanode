import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { AgentRunResumeMutationInput } from '@colanode/client/mutations/workspaces/agent-run-resume';
import { AgentRun } from '@colanode/client/types/agent-runs';

export class AgentRunResumeMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<AgentRunResumeMutationInput> {
  public async handleMutation(input: AgentRunResumeMutationInput): Promise<AgentRun> {
    const workspace = this.getWorkspace(input.userId);
    try { return await workspace.account.client.post(`v1/workspaces/${workspace.workspaceId}/agent-runs/${input.runId}/resume`, { json: input.approvalId ? { approvalId: input.approvalId } : {} }).json<AgentRun>(); }
    catch (error) { const apiError = await parseApiError(error); throw new MutationError(MutationErrorCode.ApiError, apiError.message); }
  }
}
