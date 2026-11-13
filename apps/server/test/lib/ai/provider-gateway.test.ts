import { describe, expect, it, vi } from 'vitest';

import { AiProviderGateway } from '@colanode/server/lib/ai/provider-gateway';
import { aiConfigSchema } from '@colanode/server/lib/config/ai';

const config = aiConfigSchema.parse({
  enabled: true,
  providers: {
    openai: { enabled: true, apiKey: 'openai-test' },
    anthropic: { enabled: true },
    google: { enabled: true, apiKey: 'google-test' },
    ollama: { enabled: true },
    lmstudio: { enabled: true },
  },
  models: {
    response: { provider: 'openai', modelName: 'gpt-test' },
    queryRewrite: { provider: 'openai', modelName: 'gpt-query' },
    rerank: { provider: 'openai', modelName: 'gpt-rerank' },
    summarization: { provider: 'openai', modelName: 'gpt-summary' },
    contextEnhancer: { provider: 'openai', modelName: 'gpt-context' },
    noContext: { provider: 'openai', modelName: 'gpt-no-context' },
    intentRecognition: { provider: 'openai', modelName: 'gpt-intent' },
    databaseFilter: { provider: 'openai', modelName: 'gpt-filter' },
  },
  langfuse: {},
  embedding: { provider: 'openai' },
  chunking: {},
  retrieval: { hybridSearch: {} },
});

const request = {
  task: 'response',
  messages: [{ role: 'user' as const, content: 'Hello' }],
  stream: false,
  timeoutMs: 5000,
  maxRetries: 2,
};

describe('AI provider gateway', () => {
  it('routes agent settings over user settings and normalizes usage metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'google-response',
          candidates: [{ content: { parts: [{ text: 'Hi there' }] } }],
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 2,
            totalTokenCount: 6,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const gateway = new AiProviderGateway({
      config,
      fetchImpl,
      sleep: async () => undefined,
    });
    const result = await gateway.chat({
      ...request,
      userSettings: { provider: 'openai', model: 'user-model' },
      agentSettings: { provider: 'google', model: 'agent-model' },
      serverCredentials: { google: 'google-byok' },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/v1beta/models/agent-model:generateContent?key=google-byok'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.message.content).toBe('Hi there');
    expect(result.usage).toMatchObject({
      provider: 'google',
      model: 'agent-model',
      promptTokens: 4,
      completionTokens: 2,
      totalTokens: 6,
    });
  });

  it('retries transient provider failures and preserves tool calls', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'openai-response',
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call-1',
                      function: { name: 'search', arguments: '{"q":"test"}' },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
          }),
          { status: 200 }
        )
      );

    const gateway = new AiProviderGateway({
      config,
      fetchImpl,
      sleep: async () => undefined,
    });
    const result = await gateway.chat({
      ...request,
      tools: [
        {
          type: 'function',
          function: { name: 'search', parameters: { type: 'object' } },
        },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.message.toolCalls).toEqual([
      { id: 'call-1', name: 'search', arguments: '{"q":"test"}' },
    ]);
  });

  it('routes Anthropic with an independent server credential and normalizes tool use', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'anthropic-response',
          content: [
            { type: 'text', text: 'Anthropic response' },
            { type: 'tool_use', id: 'tool-1', name: 'search', input: { q: 'test' } },
          ],
          usage: { input_tokens: 7, output_tokens: 4 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const gateway = new AiProviderGateway({
      config,
      fetchImpl,
      sleep: async () => undefined,
    });
    const result = await gateway.chat({
      ...request,
      agentSettings: { provider: 'anthropic', model: 'claude-test' },
      serverCredentials: { anthropic: 'anthropic-secret' },
      tools: [
        {
          type: 'function',
          function: { name: 'search', parameters: { type: 'object' } },
        },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'anthropic-secret',
          'anthropic-version': '2023-06-01',
        }),
      })
    );
    expect(result.message).toMatchObject({ content: 'Anthropic response' });
    expect(result.message.toolCalls).toEqual([
      { id: 'tool-1', name: 'search', arguments: '{"q":"test"}' },
    ]);
    expect(result.usage).toMatchObject({
      provider: 'anthropic',
      promptTokens: 7,
      completionTokens: 4,
      totalTokens: 11,
    });
  });

  it('normalizes Anthropic streaming text and tool deltas', async () => {
    const stream = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"anthropic-stream","usage":{"input_tokens":3}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"tool_use","id":"tool-2","name":"search"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"q\\":\\"test\\"}"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
    ].join('');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    );
    const gateway = new AiProviderGateway({
      config,
      fetchImpl,
      sleep: async () => undefined,
    });

    const chunks = [];
    for await (const chunk of gateway.stream({
      ...request,
      stream: true,
      agentSettings: { provider: 'anthropic', model: 'claude-test' },
      serverCredentials: { anthropic: 'anthropic-secret' },
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((chunk) => chunk.delta === 'Hello')).toBe(true);
    expect(chunks.some((chunk) => chunk.toolCall?.name === 'search')).toBe(true);
    expect(chunks.at(-1)?.usage).toMatchObject({
      provider: 'anthropic',
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
    });
  });

  it('discovers local models and routes Ollama without a paid fallback', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }] }),
          { status: 200 }
        );
      }

      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'local-model' }] }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          id: 'ollama-response',
          choices: [{ message: { content: 'local response' } }],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        }),
        { status: 200 }
      );
    });

    const gateway = new AiProviderGateway({
      config,
      fetchImpl,
      sleep: async () => undefined,
    });
    const providers = await gateway.discoverLocalModels();
    const result = await gateway.chat({
      ...request,
      agentSettings: { provider: 'ollama', model: 'qwen2.5:0.5b' },
    });

    expect(providers).toEqual([
      expect.objectContaining({
        provider: 'ollama',
        available: true,
        models: ['qwen2.5:0.5b'],
      }),
      expect.objectContaining({
        provider: 'lmstudio',
        available: true,
        models: ['local-model'],
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.usage.provider).toBe('ollama');
  });

  it('rejects cloud routing when local-only mode is enabled', async () => {
    const localOnlyConfig = aiConfigSchema.parse({
      ...config,
      localOnly: true,
    });
    const gateway = new AiProviderGateway({ config: localOnlyConfig });

    await expect(gateway.chat(request)).rejects.toThrow(
      'Local-only mode is enabled'
    );
  });

  it('keeps cloud fallback opt-in and uses it only when explicitly allowed', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('ollama unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'fallback-response',
            candidates: [{ content: { parts: [{ text: 'cloud fallback' }] } }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
          }),
          { status: 200 }
        )
      );
    const gateway = new AiProviderGateway({
      config,
      fetchImpl,
      sleep: async () => undefined,
    });

    const result = await gateway.chat({
      ...request,
      maxRetries: 0,
      agentSettings: { provider: 'ollama', model: 'qwen3:4b' },
      policy: {
        localOnly: false,
        allowCloudFallback: true,
        fallbackProvider: 'google',
        fallbackModel: 'gemini-test',
        monthlySpendUsd: null,
        monthlyTokens: null,
      },
      serverCredentials: { google: 'google-test' },
    });

    expect(result.message.content).toBe('cloud fallback');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/v1beta/models/gemini-test:generateContent'),
      expect.anything()
    );
  });

  it('does not fall back when local-only policy is enabled', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = new AiProviderGateway({ config, fetchImpl });

    await expect(
      gateway.chat({
        ...request,
        agentSettings: { provider: 'openai', model: 'gpt-test' },
        policy: {
          localOnly: true,
          allowCloudFallback: true,
          fallbackProvider: 'google',
          fallbackModel: 'gemini-test',
          monthlySpendUsd: null,
          monthlyTokens: null,
        },
      })
    ).rejects.toThrow('Local-only mode is enabled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
