import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { AiLocalModelsQueryInput } from '@colanode/client/queries/workspaces/ai-local-models';
import { AppService } from '@colanode/client/services/app-service';
import { AiLocalModels } from '@colanode/client/types/ai';
import { Event } from '@colanode/client/types/events';

export class AiLocalModelsQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<AiLocalModelsQueryInput>
{
  constructor(app: AppService) {
    super(app);
  }

  public async handleQuery(input: AiLocalModelsQueryInput): Promise<AiLocalModels> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/ai/local-models`)
        .json<AiLocalModels>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new Error(apiError.message);
    }
  }

  public async checkForChanges(
    _event: Event,
    _input: AiLocalModelsQueryInput
  ): Promise<ChangeCheckResult<AiLocalModelsQueryInput>> {
    return { hasChanges: false };
  }
}
