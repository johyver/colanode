import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  AiGatewayTestMutationInput,
  AiGatewayTestMutationOutput,
} from '@colanode/client/mutations/workspaces/ai-gateway-test';
import { AiSettings } from '@colanode/client/types/ai';

type ChatResult = {
  message: {
    content: string;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
  };
  usage: { provider: string; model: string; totalTokens: number };
};

export class AiGatewayTestMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<AiGatewayTestMutationInput>
{
  public async handleMutation(
    input: AiGatewayTestMutationInput
  ): Promise<AiGatewayTestMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const endpoint = `v1/workspaces/${workspace.workspaceId}/ai`;
    const agentId = 'p3-01-live-test-agent';
    let step = 'text';

    try {
      const persistedSettings = await workspace.account.client
        .get(`${endpoint}/settings`)
        .json<AiSettings>();
      const configuredSettings = persistedSettings.user ?? {
        provider: 'google' as const,
        model: 'gemini-2.5-flash',
      };
      const agentSettings = {
        ...configuredSettings,
        temperature: configuredSettings.temperature ?? 0,
      };

      const textResult = await workspace.account.client
        .post(`${endpoint}/chat`, {
          json: {
            agentId,
            agentSettings,
            task: 'response',
            messages: [
              {
                role: 'user',
                content: 'Reply with exactly: P3-01 live test passed.',
              },
            ],
          },
          timeout: 120000,
        })
        .json<ChatResult>();

      step = 'tool call';
      const toolResult = await workspace.account.client
        .post(`${endpoint}/chat`, {
          json: {
            agentId,
            agentSettings,
            task: 'response',
            messages: [
              {
                role: 'user',
                content: 'Call the lookup_preview tool with query equal to live-test.',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'lookup_preview',
                  description: 'Look up a preview test value.',
                  parameters: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                  },
                },
              },
            ],
          },
          timeout: 120000,
        })
        .json<ChatResult>();

      step = 'vision';
      const visionResult = await workspace.account.client
        .post(`${endpoint}/chat`, {
          json: {
            agentId,
            agentSettings,
            task: 'response',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Describe this image in one word.' },
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    },
                  },
                ],
              },
            ],
          },
          timeout: 120000,
        })
        .json<ChatResult>();

      step = 'streaming';
      const streamResponse = await workspace.account.client.post(`${endpoint}/chat`, {
        json: {
          agentId,
          agentSettings,
          task: 'response',
          stream: true,
          messages: [{ role: 'user', content: 'Reply with the word streamed.' }],
        },
        timeout: 120000,
      });
      const streamText = await streamResponse.text();
      const streamedChunks = streamText
        .split('\n')
        .filter((line) => line.startsWith('data:') && !line.includes('"done":true'))
        .length;

      return {
        provider: textResult.usage.provider,
        model: textResult.usage.model,
        textResponse: textResult.message.content,
        streamedChunks,
        toolCallCount: toolResult.message.toolCalls.length,
        visionResponse: visionResult.message.content,
        totalTokens:
          textResult.usage.totalTokens +
          toolResult.usage.totalTokens +
          visionResult.usage.totalTokens,
      };
    } catch (error) {
      const apiError = await parseApiError(error);
      const detail =
        apiError.message !== 'An unknown error occurred'
          ? apiError.message
          : error instanceof Error
            ? error.message
            : apiError.message;
      throw new MutationError(
        MutationErrorCode.ApiError,
        `Live provider check failed during ${step}: ${detail}`
      );
    }
  }
}
