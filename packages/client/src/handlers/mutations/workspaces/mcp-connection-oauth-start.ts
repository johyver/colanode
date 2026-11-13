import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  McpConnectionOAuthStartMutationInput,
  McpConnectionOAuthStartMutationOutput,
} from '@colanode/client/mutations/workspaces/mcp-connection-oauth-start';

export class McpConnectionOAuthStartMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<McpConnectionOAuthStartMutationInput>
{
  public async handleMutation(
    input: McpConnectionOAuthStartMutationInput
  ): Promise<McpConnectionOAuthStartMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .post(
          `v1/workspaces/${workspace.workspaceId}/mcp-connections/${input.connectionId}/oauth/start`
        )
        .json<McpConnectionOAuthStartMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
