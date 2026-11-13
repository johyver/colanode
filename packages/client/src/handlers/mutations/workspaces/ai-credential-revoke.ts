import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { AiCredentialRevokeMutationInput, AiCredentialRevokeMutationOutput } from '@colanode/client/mutations/workspaces/ai-credential-revoke';

export class AiCredentialRevokeMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiCredentialRevokeMutationInput>
{
  public async handleMutation(
    input: AiCredentialRevokeMutationInput
  ): Promise<AiCredentialRevokeMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/ai/credentials/${input.provider}/revoke`)
        .json<AiCredentialRevokeMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
