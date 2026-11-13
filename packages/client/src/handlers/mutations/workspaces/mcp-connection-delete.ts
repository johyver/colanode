import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  McpConnectionDeleteMutationInput,
  McpConnectionDeleteMutationOutput,
} from '@colanode/client/mutations/workspaces/mcp-connection-delete';

export class McpConnectionDeleteMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<McpConnectionDeleteMutationInput>
{
  public async handleMutation(
    input: McpConnectionDeleteMutationInput
  ): Promise<McpConnectionDeleteMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .delete(`v1/workspaces/${workspace.workspaceId}/mcp-connections/${input.connectionId}`)
        .json<McpConnectionDeleteMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
