import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { McpToolPoliciesQueryInput, McpToolPoliciesQueryOutput } from '@colanode/client/queries/workspaces/mcp-tool-policies';
import { AppService } from '@colanode/client/services/app-service';
import { Event } from '@colanode/client/types/events';

export class McpToolPoliciesQueryHandler extends WorkspaceQueryHandlerBase implements QueryHandler<McpToolPoliciesQueryInput> {
  public constructor(app: AppService) { super(app); }

  public async handleQuery(input: McpToolPoliciesQueryInput): Promise<McpToolPoliciesQueryOutput> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/mcp-connections/${input.connectionId}/tool-policies`)
        .json<McpToolPoliciesQueryOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new Error(apiError.message);
    }
  }

  public async checkForChanges(_event: Event, _input: McpToolPoliciesQueryInput): Promise<ChangeCheckResult<McpToolPoliciesQueryInput>> {
    return { hasChanges: false };
  }
}
