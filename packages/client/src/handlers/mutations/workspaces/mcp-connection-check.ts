import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  McpConnectionCheckMutationInput,
  McpConnectionCheckMutationOutput,
} from '@colanode/client/mutations/workspaces/mcp-connection-check';

export class McpConnectionCheckMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<McpConnectionCheckMutationInput>
{
  public async handleMutation(
    input: McpConnectionCheckMutationInput
  ): Promise<McpConnectionCheckMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .post(
          `v1/workspaces/${workspace.workspaceId}/mcp-connections/${input.connectionId}/check`
        )
        .json<McpConnectionCheckMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
