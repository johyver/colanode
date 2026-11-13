import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { AiSettingsQueryInput } from '@colanode/client/queries/workspaces/ai-settings';
import { AppService } from '@colanode/client/services/app-service';
import { AiSettings } from '@colanode/client/types/ai';
import { Event } from '@colanode/client/types/events';

export class AiSettingsQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<AiSettingsQueryInput>
{
  constructor(app: AppService) {
    super(app);
  }

  public async handleQuery(input: AiSettingsQueryInput): Promise<AiSettings> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/ai/settings`)
        .json<AiSettings>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new Error(apiError.message);
    }
  }

  public async checkForChanges(
    _event: Event,
    _input: AiSettingsQueryInput
  ): Promise<ChangeCheckResult<AiSettingsQueryInput>> {
    return { hasChanges: false };
  }
}
