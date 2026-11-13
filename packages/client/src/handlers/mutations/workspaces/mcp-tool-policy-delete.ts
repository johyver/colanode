import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { McpToolPolicyDeleteMutationInput } from '@colanode/client/mutations/workspaces/mcp-tool-policy-delete';

export class McpToolPolicyDeleteMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<McpToolPolicyDeleteMutationInput> {
  public async handleMutation(input: McpToolPolicyDeleteMutationInput): Promise<{ deleted: boolean }> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client.delete(`v1/workspaces/${workspace.workspaceId}/mcp-tool-policies/${input.policyId}`).json<{ deleted: boolean }>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
