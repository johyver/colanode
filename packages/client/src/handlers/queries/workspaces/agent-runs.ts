import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { AgentRunHistoryQueryInput, AgentRunsQueryInput } from '@colanode/client/queries/workspaces/agent-runs';
import { AppService } from '@colanode/client/services/app-service';
import { AgentRunHistory, AgentRuns } from '@colanode/client/types/agent-runs';
import { Event } from '@colanode/client/types/events';

export class AgentRunsQueryHandler extends WorkspaceQueryHandlerBase implements QueryHandler<AgentRunsQueryInput> {
  constructor(app: AppService) { super(app); }
  public async handleQuery(input: AgentRunsQueryInput): Promise<AgentRuns> {
    const workspace = this.getWorkspace(input.userId);
    try { return await workspace.account.client.get(`v1/workspaces/${workspace.workspaceId}/agent-runs`).json<AgentRuns>(); }
    catch (error) { const apiError = await parseApiError(error); throw new Error(apiError.message); }
  }
  public async checkForChanges(_event: Event, _input: AgentRunsQueryInput): Promise<ChangeCheckResult<AgentRunsQueryInput>> { return { hasChanges: false }; }
}

export class AgentRunHistoryQueryHandler extends WorkspaceQueryHandlerBase implements QueryHandler<AgentRunHistoryQueryInput> {
  constructor(app: AppService) { super(app); }
  public async handleQuery(input: AgentRunHistoryQueryInput): Promise<AgentRunHistory> {
    const workspace = this.getWorkspace(input.userId);
    try { return await workspace.account.client.get(`v1/workspaces/${workspace.workspaceId}/agent-runs/${input.runId}`).json<AgentRunHistory>(); }
    catch (error) { const apiError = await parseApiError(error); throw new Error(apiError.message); }
  }
  public async checkForChanges(_event: Event, _input: AgentRunHistoryQueryInput): Promise<ChangeCheckResult<AgentRunHistoryQueryInput>> { return { hasChanges: false }; }
}
