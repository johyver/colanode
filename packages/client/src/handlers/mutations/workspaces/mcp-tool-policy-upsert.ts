import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { McpToolPolicyUpsertMutationInput } from '@colanode/client/mutations/workspaces/mcp-tool-policy-upsert';
import { McpToolPolicy } from '@colanode/client/types/mcp';

export class McpToolPolicyUpsertMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<McpToolPolicyUpsertMutationInput> {
  public async handleMutation(input: McpToolPolicyUpsertMutationInput): Promise<McpToolPolicy> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client.post(`v1/workspaces/${workspace.workspaceId}/mcp-connections/${input.connectionId}/tool-policies`, { json: { agentId: input.agentId, toolName: input.toolName, allowed: input.allowed, requireApproval: input.requireApproval } }).json<McpToolPolicy>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
