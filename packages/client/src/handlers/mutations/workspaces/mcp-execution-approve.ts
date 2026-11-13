import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { McpExecutionApproveMutationInput } from '@colanode/client/mutations/workspaces/mcp-execution-approve';
import { McpExecutionAudit } from '@colanode/client/types/mcp';

export class McpExecutionApproveMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<McpExecutionApproveMutationInput> {
  public async handleMutation(input: McpExecutionApproveMutationInput): Promise<McpExecutionAudit> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client.post(`v1/workspaces/${workspace.workspaceId}/mcp-execution-audit/${input.auditId}/approve`).json<McpExecutionAudit>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
