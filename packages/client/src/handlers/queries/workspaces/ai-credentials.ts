import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { parseApiError } from '@colanode/client/lib/ky';
import { AiCredentialsQueryInput } from '@colanode/client/queries/workspaces/ai-credentials';
import { AppService } from '@colanode/client/services/app-service';
import { AiCredentials } from '@colanode/client/types/ai';
import { Event } from '@colanode/client/types/events';

export class AiCredentialsQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<AiCredentialsQueryInput>
{
  constructor(app: AppService) {
    super(app);
  }

  public async handleQuery(input: AiCredentialsQueryInput): Promise<AiCredentials> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .get(`v1/workspaces/${workspace.workspaceId}/ai/credentials`)
        .json<AiCredentials>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new Error(apiError.message);
    }
  }

  public async checkForChanges(
    _event: Event,
    _input: AiCredentialsQueryInput
  ): Promise<ChangeCheckResult<AiCredentialsQueryInput>> {
    return { hasChanges: false };
  }
}
