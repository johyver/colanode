import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { AgentDeleteMutationInput } from '@colanode/client/mutations/workspaces/agent-delete';

export class AgentDeleteMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<AgentDeleteMutationInput> {
  public async handleMutation(input: AgentDeleteMutationInput): Promise<{ deleted: boolean }> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .delete(`v1/workspaces/${workspace.workspaceId}/agents/${input.agentId}`)
        .json<{ deleted: boolean }>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
