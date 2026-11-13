import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { McpExecutionAuditQueryInput, McpExecutionAuditQueryOutput } from '@colanode/client/queries/workspaces/mcp-execution-audit';
import { AppService } from '@colanode/client/services/app-service';
import { Event } from '@colanode/client/types/events';

export class McpExecutionAuditQueryHandler extends WorkspaceQueryHandlerBase implements QueryHandler<McpExecutionAuditQueryInput> {
  public constructor(app: AppService) { super(app); }

  public async handleQuery(input: McpExecutionAuditQueryInput): Promise<McpExecutionAuditQueryOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/mcp-connections/${input.connectionId}/execution-audit`)
        .json<McpExecutionAuditQueryOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new Error(apiError.message);
    }
  }

  public async checkForChanges(_event: Event, _input: McpExecutionAuditQueryInput): Promise<ChangeCheckResult<McpExecutionAuditQueryInput>> {
    return { hasChanges: false };
  }
}
