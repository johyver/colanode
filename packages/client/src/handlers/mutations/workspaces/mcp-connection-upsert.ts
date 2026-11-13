import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  McpConnectionUpsertMutationInput,
  McpConnectionUpsertMutationOutput,
} from '@colanode/client/mutations/workspaces/mcp-connection-upsert';

export class McpConnectionUpsertMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<McpConnectionUpsertMutationInput>
{
  public async handleMutation(
    input: McpConnectionUpsertMutationInput
  ): Promise<McpConnectionUpsertMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/mcp-connections`, {
          json: {
            ...(input.id ? { id: input.id } : {}),
            name: input.name,
            url: input.url,
            kind: input.kind,
            enabled: input.enabled ?? true,
            ...(input.authMode ? { authMode: input.authMode } : {}),
            ...(input.authToken !== undefined ? { authToken: input.authToken } : {}),
            ...(input.oauthScope !== undefined ? { oauthScope: input.oauthScope } : {}),
          },
        })
        .json<McpConnectionUpsertMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
