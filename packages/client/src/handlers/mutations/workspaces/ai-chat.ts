import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiChatMutationInput,
  AiChatMutationOutput,
} from '@colanode/client/mutations/workspaces/ai-chat';

export class AiChatMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiChatMutationInput>
{
  public async handleMutation(
    input: AiChatMutationInput
  ): Promise<AiChatMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      return await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/ai/chat`, {
          json: {
            task: input.task ?? 'response',
            agentId: input.agentId,
            messages: input.messages,
            stream: false,
            timeoutMs: input.timeoutMs ?? 120000,
            maxRetries: input.maxRetries ?? 1,
          },
          timeout: (input.timeoutMs ?? 120000) + 5000,
        })
        .json<AiChatMutationOutput>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
