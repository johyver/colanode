import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiSettingsUpdateMutationInput,
  AiSettingsUpdateMutationOutput,
} from '@colanode/client/mutations/workspaces/ai-settings-update';
import { AiSettings } from '@colanode/client/types/ai';

export class AiSettingsUpdateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiSettingsUpdateMutationInput>
{
  public async handleMutation(
    input: AiSettingsUpdateMutationInput
  ): Promise<AiSettingsUpdateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .patch(`v1/workspaces/${workspace.workspaceId}/ai/settings`, {
          json: {
            ...(input.user !== undefined ? { user: input.user } : {}),
            ...(input.agentId
              ? {
                  agentId: input.agentId,
                  agentSettings: input.agentSettings,
                }
              : {}),
            ...(input.policy ? { policy: input.policy } : {}),
          },
        })
        .json<AiSettings>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
