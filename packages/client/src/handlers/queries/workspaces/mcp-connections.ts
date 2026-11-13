import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { McpConnectionsQueryInput } from '@colanode/client/queries/workspaces/mcp-connections';
import { AppService } from '@colanode/client/services/app-service';
import { Event } from '@colanode/client/types/events';
import { McpConnections } from '@colanode/client/types/mcp';

export class McpConnectionsQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<McpConnectionsQueryInput>
{
  constructor(app: AppService) {
    super(app);
  }

  public async handleQuery(input: McpConnectionsQueryInput): Promise<McpConnections> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/mcp-connections`)
        .json<McpConnections>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new Error(apiError.message);
    }
  }

  public async checkForChanges(
    _event: Event,
    _input: McpConnectionsQueryInput
  ): Promise<ChangeCheckResult<McpConnectionsQueryInput>> {
    return { hasChanges: false };
  }
}
