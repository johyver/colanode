import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode, apiErrorOutputSchema } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { AiCredentialVault } from '@colanode/server/lib/ai/credential-vault';
import {
  AiGatewayError,
  aiChatRequestSchema,
  aiModelSettingsSchema,
  aiPolicySchema,
  aiSettingsOutputSchema,
  aiSettingsUpdateSchema,
  AiProviderGateway,
} from '@colanode/server/lib/ai/provider-gateway';
import type { AiSettingsOutput } from '@colanode/server/lib/ai/provider-gateway';
import {
  AiBudgetExceededError,
  completeUsageForLedger,
  enforceAiBudget,
  getAiUsageSummary,
  recordAiUsage,
} from '@colanode/server/lib/ai/usage-ledger';
import { config } from '@colanode/server/lib/config';
import { AccountAttributes } from '@colanode/server/types/accounts';

const defaultAiPolicy = aiPolicySchema.parse({
  localOnly: false,
  allowCloudFallback: false,
  fallbackProvider: null,
  fallbackModel: null,
  monthlySpendUsd: null,
  monthlyTokens: null,
});

const gateway = new AiProviderGateway({ config: config.ai });
const credentialVault = new AiCredentialVault();

const aiCredentialProviderSchema = z.enum(['openai', 'google', 'anthropic']);
const aiCredentialMetadataSchema = z.object({
  provider: aiCredentialProviderSchema,
  label: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
const aiCredentialListOutputSchema = z.object({
  credentials: z.array(aiCredentialMetadataSchema),
});
const aiCredentialInputSchema = z.object({
  label: z.string().trim().min(1).max(256).default('AI provider API key'),
  apiKey: z.string().min(1).max(4096),
});

const aiLocalModelsOutputSchema = z.object({
  providers: z.array(
    z.object({
      provider: z.enum(['ollama', 'lmstudio']),
      available: z.boolean(),
      baseUrl: z.string(),
      models: z.array(z.string()),
      error: z.string().optional(),
    })
  ),
});

export const aiRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'GET',
    url: '/credentials',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: aiCredentialListOutputSchema },
    },
    handler: async (request) => ({
      credentials: await credentialVault.list(
        request.account.id,
        request.params.workspaceId
      ),
    }),
  });

  instance.route({
    method: 'PUT',
    url: '/credentials/:provider',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        provider: aiCredentialProviderSchema,
      }),
      body: aiCredentialInputSchema,
      response: {
        200: aiCredentialMetadataSchema,
        503: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        return await credentialVault.upsert({
          accountId: request.account.id,
          workspaceId: request.params.workspaceId,
          provider: request.params.provider,
          label: request.body.label,
          apiKey: request.body.apiKey,
        });
      } catch (error) {
        return reply.code(503).send({
          code: ApiErrorCode.Unknown,
          message:
            error instanceof Error
              ? error.message
              : 'AI credential vault is unavailable.',
        });
      }
    },
  });

  instance.route({
    method: 'POST',
    url: '/credentials/:provider/revoke',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        provider: aiCredentialProviderSchema,
      }),
      response: { 200: z.object({ revoked: z.boolean() }), 503: apiErrorOutputSchema },
    },
    handler: async (request, reply) => {
      try {
        const credential = await credentialVault.revoke(
          request.account.id,
          request.params.workspaceId,
          request.params.provider
        );
        return { revoked: credential !== null };
      } catch (error) {
        return reply.code(503).send({
          code: ApiErrorCode.Unknown,
          message:
            error instanceof Error
              ? error.message
              : 'AI credential vault is unavailable.',
        });
      }
    },
  });

  instance.route({
    method: 'GET',
    url: '/settings',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: aiSettingsOutputSchema },
    },
    handler: async (request) => loadAiSettings(request.account.id, request.params.workspaceId),
  });

  instance.route({
    method: 'GET',
    url: '/local-models',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: aiLocalModelsOutputSchema },
    },
    handler: async () => ({
      providers: await gateway.discoverLocalModels(),
    }),
  });

  instance.route({
    method: 'PATCH',
    url: '/settings',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: aiSettingsUpdateSchema,
      response: { 200: aiSettingsOutputSchema, 403: apiErrorOutputSchema },
    },
    handler: async (request, reply) => {
      const input = request.body;

      if (
        (input.agentId || input.policy) &&
        request.workspace.user.role !== 'owner' &&
        request.workspace.user.role !== 'admin'
      ) {
        return reply.code(403).send({
          code: ApiErrorCode.Forbidden,
          message: 'Only workspace administrators can update AI policy or agent settings.',
        });
      }

      const [account, workspace] = await Promise.all([
        database
          .selectFrom('accounts')
          .select(['attributes'])
          .where('id', '=', request.account.id)
          .executeTakeFirstOrThrow(),
        database
          .selectFrom('workspaces')
          .select(['attrs'])
          .where('id', '=', request.params.workspaceId)
          .executeTakeFirstOrThrow(),
      ]);

      const accountAttributes = parseJsonRecord(account.attributes) as AccountAttributes;
      const workspaceAttributes = parseJsonRecord(workspace.attrs);
      const aiAttributes = parseJsonRecord(workspaceAttributes.ai);
      const agents = parseAgentSettings(aiAttributes);
      const policy = parseAiPolicy(aiAttributes.policy);

      if (input.user !== undefined) {
        await database
          .updateTable('accounts')
          .set({
            attributes: JSON.stringify({
              ...accountAttributes,
              ai: {
                ...(accountAttributes.ai ?? {}),
                userSettings: input.user,
              },
            }),
            updated_at: new Date(),
          })
          .where('id', '=', request.account.id)
          .execute();
      }

      if (input.agentId || input.policy) {
        const nextAgents = { ...agents };
        if (input.agentId && input.agentSettings === null) {
          delete nextAgents[input.agentId];
        } else if (input.agentId && input.agentSettings) {
          nextAgents[input.agentId] = input.agentSettings;
        }

        await database
          .updateTable('workspaces')
          .set({
            attrs: JSON.stringify({
              ...workspaceAttributes,
              ai: {
                ...aiAttributes,
                agents: nextAgents,
                policy: input.policy ? { ...policy, ...input.policy } : policy,
              },
            }),
            updated_at: new Date(),
            updated_by: request.account.id,
          })
          .where('id', '=', request.params.workspaceId)
          .execute();
      }

      return loadAiSettings(request.account.id, request.params.workspaceId);
    },
  });

  instance.route({
    method: 'POST',
    url: '/chat',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: aiChatRequestSchema,
    },
    handler: async (request, reply) => {
      const persistedSettings = await loadAiSettings(
        request.account.id,
        request.params.workspaceId
      );
      const chatRequest = {
        ...request.body,
        userSettings: request.body.userSettings ?? persistedSettings.user ?? undefined,
        agentSettings:
          request.body.agentSettings ??
          (request.body.agentId
            ? persistedSettings.agents[request.body.agentId]
            : undefined),
      };

      try {
        const requestWithPolicy = { ...chatRequest, policy: persistedSettings.policy };
        const selectedModel = gateway.resolveModel(requestWithPolicy);
        await enforceAiBudget({
          accountId: request.account.id,
          workspaceId: request.params.workspaceId,
          agentId: request.body.agentId,
          request: chatRequest,
          selectedSettings: selectedModel,
          agentBudget: chatRequest.agentSettings?.budget,
          policy: persistedSettings.policy,
        });
        const credentialProviders = new Set(
          [
            selectedModel.provider,
            persistedSettings.policy.allowCloudFallback
              ? persistedSettings.policy.fallbackProvider
              : null,
          ].filter(
            (provider): provider is 'openai' | 'google' | 'anthropic' =>
              provider === 'openai' || provider === 'google' || provider === 'anthropic'
          )
        );
        const serverCredentials: Record<string, string> = {};
        for (const provider of credentialProviders) {
          const key = await credentialVault.resolve(
            request.account.id,
            request.params.workspaceId,
            provider
          );
          if (key) {
            serverCredentials[provider] = key;
          }
        }
        const requestForGateway = {
          ...requestWithPolicy,
          ...(Object.keys(serverCredentials).length > 0 ? { serverCredentials } : {}),
        };

        if (chatRequest.stream) {
          reply.hijack();
          const requestOrigin = request.headers.origin;
          const configuredOrigin = config.cors.origin;
          const allowedOrigin =
            requestOrigin &&
            (configuredOrigin === true ||
              configuredOrigin === requestOrigin ||
              (Array.isArray(configuredOrigin) && configuredOrigin.includes(requestOrigin)))
              ? requestOrigin
              : undefined;
          reply.raw.writeHead(200, {
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            'content-type': 'text/event-stream',
            ...(allowedOrigin
              ? {
                  'access-control-allow-origin': allowedOrigin,
                  'access-control-allow-credentials': 'true',
                  vary: 'Origin',
                }
              : {}),
          });

          let streamedText = '';
          let finalUsage;
          for await (const chunk of gateway.stream(requestForGateway)) {
            streamedText += chunk.delta;
            if (chunk.usage) {
              finalUsage = chunk.usage;
            }
            reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }

          if (finalUsage) {
            await recordAiUsage({
              accountId: request.account.id,
              workspaceId: request.params.workspaceId,
              agentId: request.body.agentId,
              usage: completeUsageForLedger(finalUsage, chatRequest, streamedText),
            });
          }
          reply.raw.end();
          return reply;
        }

        const result = await gateway.chat(requestForGateway);
        await recordAiUsage({
          accountId: request.account.id,
          workspaceId: request.params.workspaceId,
          agentId: request.body.agentId,
          usage: completeUsageForLedger(result.usage, chatRequest, result.message.content),
        });
        return result;
      } catch (error) {
        request.log.error({ err: error }, 'AI chat request failed');
        const gatewayError =
          error instanceof AiGatewayError
            ? error
            : new AiGatewayError('AI provider request failed.', { status: 502 });
        const status =
          error instanceof AiBudgetExceededError
            ? error.status
            : gatewayError.status ?? (gatewayError.retryable ? 502 : 500);

        return reply.code(status).send({
          code:
            status === 503
              ? ApiErrorCode.Unknown
              : gatewayError.status === 429
                ? ApiErrorCode.TooManyRequests
                : ApiErrorCode.Unknown,
          message: gatewayError.message,
        });
      }
    },
  });

  done();
};

const loadAiSettings = async (
  accountId: string,
  workspaceId: string
): Promise<AiSettingsOutput> => {
  const [account, workspace] = await Promise.all([
    database
      .selectFrom('accounts')
      .select(['attributes'])
      .where('id', '=', accountId)
      .executeTakeFirst(),
    database
      .selectFrom('workspaces')
      .select(['attrs'])
      .where('id', '=', workspaceId)
      .executeTakeFirst(),
  ]);

  const accountAttributes = parseJsonRecord(account?.attributes) as AccountAttributes;
  const workspaceAttributes = parseJsonRecord(workspace?.attrs);

  const policy = parseAiPolicy(parseJsonRecord(workspaceAttributes.ai).policy);
  return {
    user: accountAttributes.ai?.userSettings ?? null,
    agents: parseAgentSettings(workspaceAttributes.ai),
    policy,
    usage: await getAiUsageSummary(accountId, workspaceId),
  };
};

const parseAiPolicy = (value: unknown) => {
  const parsed = aiPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : defaultAiPolicy;
};

const parseJsonRecord = (value: unknown): Record<string, unknown> => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const parseAgentSettings = (value: unknown) => {
  const agents = parseJsonRecord(value).agents;
  if (!agents || typeof agents !== 'object') {
    return {};
  }

  const output: Record<string, z.infer<typeof aiModelSettingsSchema>> = {};
  for (const [agentId, settings] of Object.entries(agents)) {
    const parsed = aiModelSettingsSchema.safeParse(settings);
    if (parsed.success) {
      output[agentId] = parsed.data;
    }
  }

  return output;
};
