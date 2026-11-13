import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { AgentAutomationQueryInput } from '@colanode/client/queries/workspaces/agent-automation';
import { AppService } from '@colanode/client/services/app-service';
import { AgentAutomation } from '@colanode/client/types/agent-automation';
import { Event } from '@colanode/client/types/events';

export class AgentAutomationQueryHandler extends WorkspaceQueryHandlerBase implements QueryHandler<AgentAutomationQueryInput> {
  constructor(app: AppService) { super(app); }
  public async handleQuery(input: AgentAutomationQueryInput): Promise<AgentAutomation> {
    const workspace = this.getWorkspace(input.userId);
    try {
      const base = 'v1/workspaces/' + workspace.workspaceId;
      const [triggers, delegations, approvals, pilots] = await Promise.all([
        workspace.account.client.get(base + '/agent-triggers').json<{ triggers: AgentAutomation['triggers'] }>(),
        workspace.account.client.get(base + '/agent-delegations').json<{ delegations: AgentAutomation['delegations'] }>(),
        workspace.account.client.get(base + '/agent-approvals').json<{ approvals: AgentAutomation['approvals'] }>(),
        workspace.account.client.get(base + '/agent-blog-pilots').json<{ pilots: AgentAutomation['pilots'] }>(),
      ]);
      return { triggers: triggers.triggers, delegations: delegations.delegations, approvals: approvals.approvals, pilots: pilots.pilots };
    } catch (error) { const apiError = await parseApiError(error); throw new Error(apiError.message); }
  }
  public async checkForChanges(_event: Event, _input: AgentAutomationQueryInput): Promise<ChangeCheckResult<AgentAutomationQueryInput>> { return { hasChanges: false }; }
}
