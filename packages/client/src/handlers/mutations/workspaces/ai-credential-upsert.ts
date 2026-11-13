import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { AiCredentialUpsertMutationInput, AiCredentialUpsertMutationOutput } from '@colanode/client/mutations/workspaces/ai-credential-upsert';

export class AiCredentialUpsertMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiCredentialUpsertMutationInput>
{
  public async handleMutation(
    input: AiCredentialUpsertMutationInput
  ): Promise<AiCredentialUpsertMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .put(`v1/workspaces/${workspace.workspaceId}/ai/credentials/${input.provider}`, {
          json: { label: input.label, apiKey: input.apiKey },
        })
        .json<AiCredentialUpsertMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
