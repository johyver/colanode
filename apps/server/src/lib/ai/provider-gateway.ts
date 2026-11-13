import { z } from 'zod/v4';

import { AiConfig, AiProvider } from '@colanode/server/lib/config/ai';

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const imagePartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string().min(1),
    detail: z.enum(['auto', 'low', 'high']).optional(),
  }),
});

export const aiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(z.union([textPartSchema, imagePartSchema]))]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })
    )
    .optional(),
});

export const aiToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()),
  }),
});

export const aiModelSettingsSchema = z.object({
  provider: z
    .enum(['openai', 'anthropic', 'google', 'ollama', 'lmstudio'])
    .optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  budget: z
    .object({
      monthlySpendUsd: z.number().nonnegative().nullable().optional(),
      monthlyTokens: z.number().int().nonnegative().nullable().optional(),
    })
    .optional(),
});

export const aiPolicySchema = z.object({
  localOnly: z.boolean(),
  allowCloudFallback: z.boolean(),
  fallbackProvider: z.enum(['openai', 'google']).nullable(),
  fallbackModel: z.string().min(1).nullable(),
  monthlySpendUsd: z.number().nonnegative().nullable(),
  monthlyTokens: z.number().int().nonnegative().nullable(),
});

export const aiUsageSummarySchema = z.object({
  monthStart: z.string(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
});

export const aiSettingsOutputSchema = z.object({
  user: aiModelSettingsSchema.nullable(),
  agents: z.record(z.string(), aiModelSettingsSchema),
  policy: aiPolicySchema,
  usage: aiUsageSummarySchema,
});

export const aiSettingsUpdateSchema = z
  .object({
    user: aiModelSettingsSchema.nullable().optional(),
    agentId: z.string().min(1).optional(),
    agentSettings: aiModelSettingsSchema.nullable().optional(),
    policy: aiPolicySchema.partial().optional(),
  })
  .refine(
    (value) =>
      value.user !== undefined ||
      value.policy !== undefined ||
      (value.agentId !== undefined && value.agentSettings !== undefined),
    { message: 'User settings or agent settings are required.' }
  )
  .refine(
    (value) =>
      value.agentId === undefined || value.agentSettings !== undefined,
    { message: 'Agent settings are required when agentId is provided.' }
  );

export const aiChatRequestSchema = z.object({
  task: z.string().min(1).default('response'),
  messages: z.array(aiMessageSchema).min(1),
  tools: z.array(aiToolSchema).optional(),
  agentId: z.string().optional(),
  userSettings: aiModelSettingsSchema.optional(),
  agentSettings: aiModelSettingsSchema.optional(),
  stream: z.boolean().default(false),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  maxRetries: z.number().int().min(0).max(3).default(2),
});

export type AiMessage = z.infer<typeof aiMessageSchema>;
export type AiTool = z.infer<typeof aiToolSchema>;
export type AiModelSettings = z.infer<typeof aiModelSettingsSchema>;
export type AiPolicySettings = z.infer<typeof aiPolicySchema>;
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
export type AiServerCredentials = Partial<
  Record<Extract<AiProvider, 'openai' | 'anthropic' | 'google'>, string>
>;

export type AiGatewayRequest = AiChatRequest & {
  serverCredentials?: AiServerCredentials;
  policy?: AiPolicySettings;
};
export type AiSettingsOutput = z.infer<typeof aiSettingsOutputSchema>;
export type AiSettingsUpdate = z.infer<typeof aiSettingsUpdateSchema>;

export type AiUsageMetadata = {
  provider: AiProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  requestId?: string;
};

export type AiToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AiChatResult = {
  id: string;
  message: {
    role: 'assistant';
    content: string;
    toolCalls: AiToolCall[];
  };
  usage: AiUsageMetadata;
};

export type AiChatChunk = {
  id: string;
  delta: string;
  toolCall?: Partial<AiToolCall>;
  done: boolean;
  usage?: AiUsageMetadata;
};

export class AiGatewayError extends Error {
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly provider?: AiProvider;

  constructor(
    message: string,
    options: { retryable?: boolean; status?: number; provider?: AiProvider } = {}
  ) {
    super(message);
    this.name = 'AiGatewayError';
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.provider = options.provider;
  }
}

type FetchLike = typeof fetch;

type OpenAiResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type GoogleResponse = {
  responseId?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name: string; args?: Record<string, unknown> };
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

type AnthropicResponse = {
  id?: string;
  content?: Array<
    | { type: 'text'; text?: string }
    | { type: 'tool_use'; id?: string; name?: string; input?: Record<string, unknown> }
  >;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type GatewayOptions = {
  config: AiConfig;
  fetchImpl?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
};

const providerDefaults: Record<AiProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
};

const localProviders = new Set<AiProvider>(['ollama', 'lmstudio']);

export type AiLocalModelProvider = {
  provider: Extract<AiProvider, 'ollama' | 'lmstudio'>;
  available: boolean;
  baseUrl: string;
  models: string[];
  error?: string;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const asTextParts = (content: AiMessage['content']) => {
  if (typeof content === 'string') {
    return [{ type: 'text' as const, text: content }];
  }

  return content;
};

const toOpenAiMessages = (messages: AiMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.name ? { name: message.name } : {}),
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    ...(message.tool_calls
      ? {
          tool_calls: message.tool_calls.map((call) => ({
            id: call.id,
            type: call.type,
            function: call.function,
          })),
        }
      : {}),
  }));

const toGoogleParts = (content: AiMessage['content']) =>
  asTextParts(content).map((part) => {
    if (part.type === 'text') {
      return { text: part.text };
    }

    if (part.image_url.url.startsWith('data:')) {
      const [, encoded] = part.image_url.url.split(',', 2);
      const mimeType = part.image_url.url.slice(5, part.image_url.url.indexOf(';'));
      return { inlineData: { mimeType, data: encoded ?? '' } };
    }

    return { fileData: { fileUri: part.image_url.url } };
  });

const toGoogleRequest = (
  request: AiChatRequest,
  selection: ReturnType<AiProviderGateway['resolveModel']>
) => {
  const system = request.messages.find((message) => message.role === 'system');
  const contents = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: toGoogleParts(message.content),
    }));

  return {
    model: selection.model,
    ...(system ? { systemInstruction: { parts: toGoogleParts(system.content) } } : {}),
    contents,
    ...(request.tools
      ? {
          tools: [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
              })),
            },
          ],
        }
      : {}),
    generationConfig: {
      ...(selection.temperature !== undefined
        ? { temperature: selection.temperature }
        : {}),
      ...(selection.maxOutputTokens !== undefined
        ? { maxOutputTokens: selection.maxOutputTokens }
        : {}),
    },
  };
};

const toAnthropicContent = (content: AiMessage['content']) =>
  asTextParts(content).map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text };
    }

    if (part.image_url.url.startsWith('data:')) {
      const [, encoded] = part.image_url.url.split(',', 2);
      const mimeType = part.image_url.url.slice(5, part.image_url.url.indexOf(';'));
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: mimeType, data: encoded ?? '' },
      };
    }

    return {
      type: 'image' as const,
      source: { type: 'url' as const, url: part.image_url.url },
    };
  });

const toAnthropicMessages = (messages: AiMessage[]) =>
  messages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: message.tool_call_id ?? 'tool-call',
              content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            },
          ],
        };
      }

      if (message.role === 'assistant' && message.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: [
            ...(typeof message.content === 'string' && message.content
              ? [{ type: 'text' as const, text: message.content }]
              : []),
            ...message.tool_calls.map((call) => ({
              type: 'tool_use' as const,
              id: call.id,
              name: call.function.name,
              input: JSON.parse(call.function.arguments || '{}') as Record<string, unknown>,
            })),
          ],
        };
      }

      return {
        role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: toAnthropicContent(message.content),
      };
    });

const toAnthropicRequest = (
  request: AiChatRequest,
  selection: ReturnType<AiProviderGateway['resolveModel']>
) => {
  const system = request.messages.find((message) => message.role === 'system');
  return {
    model: selection.model,
    max_tokens: selection.maxOutputTokens ?? 1024,
    messages: toAnthropicMessages(request.messages),
    ...(system ? { system: typeof system.content === 'string' ? system.content : toAnthropicContent(system.content) } : {}),
    ...(selection.temperature !== undefined ? { temperature: selection.temperature } : {}),
    ...(request.tools
      ? {
          tools: request.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
          })),
        }
      : {}),
    stream: request.stream,
  };
};

export class AiProviderGateway {
  private readonly config: AiConfig;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: GatewayOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  public resolveModel(request: AiGatewayRequest): {
    provider: AiProvider;
    model: string;
    temperature?: number;
    maxOutputTokens?: number;
  } {
    const aiConfig = this.config;
    if (!aiConfig.enabled) {
      throw new AiGatewayError('AI providers are disabled.', { status: 503 });
    }

    const configured =
      aiConfig.models[request.task as keyof typeof aiConfig.models] ??
      aiConfig.models.response;
    const settings = {
      provider:
        request.agentSettings?.provider ??
        request.userSettings?.provider ??
        configured.provider,
      model:
        request.agentSettings?.model ??
        request.userSettings?.model ??
        configured.modelName,
      temperature:
        request.agentSettings?.temperature ??
        request.userSettings?.temperature ??
        configured.temperature,
      maxOutputTokens:
        request.agentSettings?.maxOutputTokens ??
        request.userSettings?.maxOutputTokens ??
        configured.maxOutputTokens,
    };

    if ((aiConfig.localOnly || request.policy?.localOnly) && !localProviders.has(settings.provider)) {
      throw new AiGatewayError(
        'Local-only mode is enabled; select an Ollama or LM Studio model.',
        { status: 409, provider: settings.provider }
      );
    }

    return {
      provider: settings.provider,
      model: settings.model,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
    };
  }

  public async discoverLocalModels(
    timeoutMs = 3000
  ): Promise<AiLocalModelProvider[]> {
    const providers: Array<Extract<AiProvider, 'ollama' | 'lmstudio'>> = [
      'ollama',
      'lmstudio',
    ];

    const aiConfig = this.config;
    if (!aiConfig.enabled) {
      return providers.map((provider) => ({
        provider,
        available: false,
        baseUrl: providerDefaults[provider],
        models: [],
        error: 'AI providers are disabled in server configuration.',
      }));
    }

    return Promise.all(
      providers.map(async (provider) => {
        const providerConfig = aiConfig.providers[provider];
        const baseUrl = providerConfig.baseUrl ?? providerDefaults[provider];

        if (!providerConfig.enabled) {
          return {
            provider,
            available: false,
            baseUrl,
            models: [],
            error: 'Provider is disabled in server configuration.',
          };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await this.fetchImpl(
            provider === 'ollama'
              ? `${baseUrl.replace(/\/v1\/?$/, '')}/api/tags`
              : `${baseUrl.replace(/\/$/, '')}/models`,
            {
              method: 'GET',
              signal: controller.signal,
              headers: providerConfig.apiKey
                ? { authorization: `Bearer ${providerConfig.apiKey}` }
                : undefined,
            }
          );

          if (!response.ok) {
            return {
              provider,
              available: false,
              baseUrl,
              models: [],
              error: `Endpoint returned HTTP ${response.status}.`,
            };
          }

          const payload = (await response.json()) as {
            models?: Array<{ name?: string; model?: string }>;
            data?: Array<{ id?: string }>;
          };
          const models =
            provider === 'ollama'
              ? (payload.models ?? [])
                  .map((model) => model.name ?? model.model ?? '')
                  .filter(Boolean)
              : (payload.data ?? [])
                  .map((model) => model.id ?? '')
                  .filter(Boolean);

          return { provider, available: true, baseUrl, models };
        } catch (error) {
          return {
            provider,
            available: false,
            baseUrl,
            models: [],
            error:
              error instanceof Error && error.name === 'AbortError'
                ? `Endpoint did not respond within ${timeoutMs}ms.`
                : 'Endpoint is unavailable; no paid provider fallback was attempted.',
          };
        } finally {
          clearTimeout(timer);
        }
      })
    );
  }

  public async chat(request: AiGatewayRequest): Promise<AiChatResult> {
    let selection = this.resolveModel(request);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.requestWithRetry(request, selection);
    } catch (error) {
      const fallback = this.resolveFallbackModel(request, selection);
      if (!fallback) {
        throw error;
      }
      selection = fallback;
      response = await this.requestWithRetry(request, selection);
    }
    const payload = (await response.json()) as OpenAiResponse | GoogleResponse | AnthropicResponse;
    const result = this.normalizeResponse(selection.provider, selection.model, payload);

    return {
      ...result,
      usage: {
        ...result.usage,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  public async *stream(request: AiGatewayRequest): AsyncGenerator<AiChatChunk> {
    let selection = this.resolveModel(request);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.requestWithRetry(request, selection, true);
    } catch (error) {
      const fallback = this.resolveFallbackModel(request, selection);
      if (!fallback) {
        throw error;
      }
      selection = fallback;
      response = await this.requestWithRetry(request, selection, true);
    }

    if (!response.body) {
      throw new AiGatewayError('Provider returned an empty stream.', {
        retryable: true,
        provider: selection.provider,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastId = `${selection.provider}:${selection.model}`;
    let usage: AiUsageMetadata = {
      provider: selection.provider,
      model: selection.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs: 0,
    };
    let anthropicTool: { id?: string; name?: string } = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
        if (!data || data === '[DONE]') {
          continue;
        }

        if (selection.provider === 'anthropic') {
          if (!line.startsWith('data:')) {
            continue;
          }

          const anthropic = JSON.parse(data) as {
            type?: string;
            message?: { id?: string; usage?: { input_tokens?: number } };
            content_block?: { type?: string; id?: string; name?: string };
            delta?: { type?: string; text?: string; partial_json?: string };
            usage?: { output_tokens?: number };
          };
          if (anthropic.type === 'message_start') {
            lastId = anthropic.message?.id ?? lastId;
            usage.promptTokens = anthropic.message?.usage?.input_tokens ?? 0;
          } else if (anthropic.type === 'content_block_start' && anthropic.content_block?.type === 'tool_use') {
            anthropicTool = {
              id: anthropic.content_block.id,
              name: anthropic.content_block.name,
            };
          } else if (anthropic.type === 'content_block_delta') {
            yield {
              id: lastId,
              delta: anthropic.delta?.text ?? '',
              ...(anthropic.delta?.partial_json
                ? {
                    toolCall: {
                      id: anthropicTool.id,
                      name: anthropicTool.name,
                      arguments: anthropic.delta.partial_json,
                    },
                  }
                : {}),
              done: false,
            };
          } else if (anthropic.type === 'message_delta') {
            usage.completionTokens = anthropic.usage?.output_tokens ?? usage.completionTokens;
            usage.totalTokens = usage.promptTokens + usage.completionTokens;
          }
          continue;
        }

        const parsed = JSON.parse(data) as OpenAiResponse & {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        } & GoogleResponse;

        if (selection.provider === 'google') {
          const google = parsed as GoogleResponse;
          lastId = google.responseId ?? lastId;
          const metadata = google.usageMetadata;
          usage = {
            ...usage,
            promptTokens: metadata?.promptTokenCount ?? usage.promptTokens,
            completionTokens: metadata?.candidatesTokenCount ?? usage.completionTokens,
            totalTokens: metadata?.totalTokenCount ?? usage.totalTokens,
          };

          for (const part of google.candidates?.[0]?.content?.parts ?? []) {
            const functionCall = part.functionCall;
            yield {
              id: lastId,
              delta: part.text ?? '',
              ...(functionCall
                ? {
                    toolCall: {
                      id: `${lastId}:tool`,
                      name: functionCall.name,
                      arguments: JSON.stringify(functionCall.args ?? {}),
                    },
                  }
                : {}),
              done: false,
            };
          }
        } else {
          const openAi = parsed as OpenAiResponse & {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };
          lastId = openAi.id ?? lastId;
          const delta = openAi.choices?.[0]?.delta;
          const toolCall = delta?.tool_calls?.[0];
          yield {
            id: lastId,
            delta: delta?.content ?? '',
            ...(toolCall
              ? {
                  toolCall: {
                    id: toolCall.id,
                    name: toolCall.function?.name,
                    arguments: toolCall.function?.arguments,
                  },
                }
              : {}),
            done: false,
          };
        }
      }
    }

    yield {
      id: lastId,
      delta: '',
      done: true,
      usage: {
        ...usage,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  private async requestWithRetry(
    request: AiGatewayRequest,
    selection: ReturnType<AiProviderGateway['resolveModel']>,
    stream = false
  ): Promise<Response> {
    const providerConfig = this.getProviderConfig(selection.provider, request);
    let lastError: unknown;

    for (let attempt = 0; attempt <= request.maxRetries; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), request.timeoutMs);
        try {
          const response = await this.fetchProvider(
            selection.provider,
            providerConfig.apiKey,
            providerConfig.baseUrl,
            request,
            selection,
            stream,
            controller.signal
          );

          if (!response.ok) {
            const message = await response.text();
            throw new AiGatewayError(
              `Provider request failed (${response.status}): ${message.slice(0, 500)}`,
              {
                retryable: response.status === 408 || response.status === 429 || response.status >= 500,
                status: response.status,
                provider: selection.provider,
              }
            );
          }

          return response;
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        lastError = error;
        const gatewayError =
          error instanceof AiGatewayError
            ? error
            : new AiGatewayError('Provider request timed out or failed.', {
                retryable: true,
                provider: selection.provider,
              });

        if (!gatewayError.retryable || attempt >= request.maxRetries) {
          throw gatewayError;
        }

        await this.sleep(100 * 2 ** attempt);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new AiGatewayError('Provider request failed.', { provider: selection.provider });
  }

  private resolveFallbackModel(
    request: AiGatewayRequest,
    primary: ReturnType<AiProviderGateway['resolveModel']>
  ) {
    const policy = request.policy;
    if (
      !policy?.allowCloudFallback ||
      policy.localOnly ||
      !localProviders.has(primary.provider) ||
      !policy.fallbackProvider
    ) {
      return undefined;
    }

    const fallbackModel =
      policy.fallbackModel ??
      (policy.fallbackProvider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash');

    return {
      provider: policy.fallbackProvider,
      model: fallbackModel,
      temperature: primary.temperature,
      maxOutputTokens: primary.maxOutputTokens,
    };
  }

  private getProviderConfig(provider: AiProvider, request?: AiGatewayRequest) {
    if (!this.config.enabled) {
      throw new AiGatewayError('AI providers are disabled.', { status: 503 });
    }

    const providerConfig = this.config.providers[provider];
    const requestApiKey =
      provider === 'openai' || provider === 'anthropic' || provider === 'google'
        ? request?.serverCredentials?.[provider]
        : undefined;
    if (
      !providerConfig.enabled ||
      (!localProviders.has(provider) && !providerConfig.apiKey && !requestApiKey)
    ) {
      throw new AiGatewayError(`${provider} provider is not configured.`, {
        status: 503,
        provider,
      });
    }

    return {
      apiKey:
        requestApiKey ?? providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl ?? providerDefaults[provider],
    };
  }

  private fetchProvider(
    provider: AiProvider,
    apiKey: string,
    baseUrl: string,
    request: AiChatRequest,
    selection: ReturnType<AiProviderGateway['resolveModel']>,
    stream: boolean,
    signal: AbortSignal
  ) {
    if (provider === 'openai' || localProviders.has(provider)) {
      return this.fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: selection.model,
          messages: toOpenAiMessages(request.messages),
          tools: request.tools,
          temperature: selection.temperature,
          max_tokens: selection.maxOutputTokens,
          stream,
          ...(provider === 'ollama' ? { think: false } : {}),
        }),
      });
    }

    if (provider === 'anthropic') {
      return this.fetchImpl(`${baseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(toAnthropicRequest(request, selection)),
      });
    }

    const method = stream ? 'streamGenerateContent' : 'generateContent';
    const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(selection.model)}:${method}?key=${encodeURIComponent(apiKey)}${stream ? '&alt=sse' : ''}`;
    return this.fetchImpl(url, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toGoogleRequest(request, selection)),
    });
  }

  private normalizeResponse(
    provider: AiProvider,
    model: string,
    payload: OpenAiResponse | GoogleResponse | AnthropicResponse
  ): Omit<AiChatResult, 'id'> & { id: string } {
    if (provider === 'openai' || localProviders.has(provider)) {
      const openAi = payload as OpenAiResponse;
      const usage = openAi.usage;
      const toolCalls =
        openAi.choices?.[0]?.message?.tool_calls?.map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        })) ?? [];
      return {
        id: openAi.id ?? `${provider}:${model}`,
        message: {
          role: 'assistant',
          content: openAi.choices?.[0]?.message?.content ?? '',
          toolCalls,
        },
        usage: {
          provider,
          model,
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0,
          durationMs: 0,
        },
      };
    }

    if (provider === 'anthropic') {
      const anthropic = payload as AnthropicResponse;
      const toolCalls = (anthropic.content ?? []).flatMap((part) =>
        part.type === 'tool_use'
          ? [
              {
                id: part.id ?? `${provider}:${model}:tool`,
                name: part.name ?? '',
                arguments: JSON.stringify(part.input ?? {}),
              },
            ]
          : []
      );
      const usage = anthropic.usage;
      return {
        id: anthropic.id ?? `${provider}:${model}`,
        message: {
          role: 'assistant',
          content: (anthropic.content ?? [])
            .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
            .join(''),
          toolCalls,
        },
        usage: {
          provider,
          model,
          promptTokens: usage?.input_tokens ?? 0,
          completionTokens: usage?.output_tokens ?? 0,
          totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
          durationMs: 0,
        },
      };
    }

    const google = payload as GoogleResponse;
    const parts = google.candidates?.[0]?.content?.parts ?? [];
    const toolCalls = parts.flatMap((part, index) =>
      part.functionCall
        ? [
            {
              id: `${google.responseId ?? `${provider}:${model}`}:tool:${index}`,
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          ]
        : []
    );
    const usage = google.usageMetadata;
    return {
      id: google.responseId ?? `${provider}:${model}`,
      message: {
        role: 'assistant',
        content: parts
          .flatMap((part) => (part.text ? [part.text] : []))
          .join(''),
        toolCalls,
      },
      usage: {
        provider,
        model,
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
        durationMs: 0,
      },
    };
  }
}
