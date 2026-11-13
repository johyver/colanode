import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { AgentsQueryInput } from '@colanode/client/queries/workspaces/agents';
import { AppService } from '@colanode/client/services/app-service';
import { Agents } from '@colanode/client/types/agents';
import { Event } from '@colanode/client/types/events';

export class AgentsQueryHandler extends WorkspaceQueryHandlerBase implements QueryHandler<AgentsQueryInput> {
  constructor(app: AppService) { super(app); }

  public async handleQuery(input: AgentsQueryInput): Promise<Agents> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/agents`)
        .json<Agents>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new Error(apiError.message);
    }
  }

  public async checkForChanges(_event: Event, _input: AgentsQueryInput): Promise<ChangeCheckResult<AgentsQueryInput>> {
    return { hasChanges: false };
  }
}
