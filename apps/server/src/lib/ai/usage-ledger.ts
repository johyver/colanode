import { sql } from 'kysely';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import type {
  AiChatRequest,
  AiModelSettings,
  AiPolicySettings,
  AiUsageMetadata,
} from '@colanode/server/lib/ai/provider-gateway';

export type AiUsageSummary = {
  monthStart: string;
  totalTokens: number;
  estimatedCostUsd: number;
};

export class AiBudgetExceededError extends Error {
  public readonly status = 429;

  constructor(message: string) {
    super(message);
    this.name = 'AiBudgetExceededError';
  }
}

const startOfCurrentMonth = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const nextMonth = (monthStart: Date) =>
  new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

const numberValue = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

export const estimateInputTokens = (request: AiChatRequest) => {
  const characters = request.messages.reduce((total, message) => {
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);
    return total + content.length;
  }, 0);

  return Math.max(1, Math.ceil(characters / 4));
};

export const estimateRequestTokens = (
  request: AiChatRequest,
  settings: AiModelSettings
) => estimateInputTokens(request) + (settings.maxOutputTokens ?? 1024);

export const completeUsageForLedger = (
  usage: AiUsageMetadata,
  request: AiChatRequest,
  generatedText = ''
): AiUsageMetadata => {
  if (usage.totalTokens > 0) {
    return usage;
  }

  const promptTokens = estimateInputTokens(request);
  const completionTokens = Math.max(1, Math.ceil(generatedText.length / 4));
  return {
    ...usage,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
};

const pricingPerMillionTokens: Record<
  string,
  { input: number; output: number }
> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

const isLocalProvider = (provider: AiUsageMetadata['provider']) =>
  provider === 'ollama' || provider === 'lmstudio';

export const estimateCostUsd = (usage: AiUsageMetadata) => {
  if (isLocalProvider(usage.provider)) {
    return 0;
  }

  const pricing = pricingPerMillionTokens[usage.model] ?? {
    input: 1,
    output: 4,
  };
  return (
    (usage.promptTokens / 1_000_000) * pricing.input +
    (usage.completionTokens / 1_000_000) * pricing.output
  );
};

const defaultFallbackModel = (provider: 'openai' | 'google') =>
  provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash';

export const estimateProjectedCostUsd = (input: {
  request: AiChatRequest;
  selectedSettings: AiModelSettings;
  policy: AiPolicySettings;
}) => {
  const promptTokens = estimateInputTokens(input.request);
  const completionTokens = input.selectedSettings.maxOutputTokens ?? 1024;
  const totalTokens = promptTokens + completionTokens;
  const primaryCost = estimateCostUsd({
    provider: input.selectedSettings.provider ?? 'openai',
    model: input.selectedSettings.model ?? 'unknown',
    promptTokens,
    completionTokens,
    totalTokens,
    durationMs: 0,
  });

  // Reserve the more expensive permitted path so a local outage cannot bypass
  // the configured monthly spend limit by switching to a paid fallback.
  const fallbackCost =
    input.policy.allowCloudFallback &&
    !input.policy.localOnly &&
    isLocalProvider(input.selectedSettings.provider ?? 'openai') &&
    input.policy.fallbackProvider
      ? estimateCostUsd({
          provider: input.policy.fallbackProvider,
          model:
            input.policy.fallbackModel ??
            defaultFallbackModel(input.policy.fallbackProvider),
          promptTokens,
          completionTokens,
          totalTokens,
          durationMs: 0,
        })
      : 0;

  return Math.max(primaryCost, fallbackCost);
};

const selectUsage = async (input: {
  accountId: string;
  workspaceId: string;
  agentId?: string;
  monthStart: Date;
}) => {
  const query = database
    .selectFrom('ai_usage_ledger')
    .select([
      sql<number>`coalesce(sum(total_tokens), 0)`.as('total_tokens'),
      sql<number>`coalesce(sum(estimated_cost_usd), 0)`.as('estimated_cost_usd'),
    ])
    .where('account_id', '=', input.accountId)
    .where('workspace_id', '=', input.workspaceId)
    .where('created_at', '>=', input.monthStart)
    .where('created_at', '<', nextMonth(input.monthStart));

  const row = await (input.agentId
    ? query.where('agent_id', '=', input.agentId)
    : query).executeTakeFirst();

  return {
    totalTokens: Math.max(0, Math.round(numberValue(row?.total_tokens))),
    estimatedCostUsd: Math.max(0, numberValue(row?.estimated_cost_usd)),
  };
};

export const getAiUsageSummary = async (
  accountId: string,
  workspaceId: string
): Promise<AiUsageSummary> => {
  const monthStart = startOfCurrentMonth();
  const usage = await selectUsage({ accountId, workspaceId, monthStart });
  return { monthStart: monthStart.toISOString(), ...usage };
};

export const enforceAiBudget = async (input: {
  accountId: string;
  workspaceId: string;
  agentId?: string;
  request: AiChatRequest;
  selectedSettings: AiModelSettings;
  agentBudget?: AiModelSettings['budget'];
  policy: AiPolicySettings;
}) => {
  const monthStart = startOfCurrentMonth();
  const [workspaceUsage, agentUsage] = await Promise.all([
    selectUsage({ accountId: input.accountId, workspaceId: input.workspaceId, monthStart }),
    input.agentId
      ? selectUsage({
          accountId: input.accountId,
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          monthStart,
        })
      : Promise.resolve(undefined),
  ]);
  const projectedTokens = estimateRequestTokens(input.request, input.selectedSettings);
  const projectedCostUsd = estimateProjectedCostUsd(input);

  if (
    input.policy.monthlyTokens !== null &&
    workspaceUsage.totalTokens + projectedTokens > input.policy.monthlyTokens
  ) {
    throw new AiBudgetExceededError(
      `Workspace monthly token limit reached (${input.policy.monthlyTokens.toLocaleString()} tokens).`
    );
  }
  if (
    input.policy.monthlySpendUsd !== null &&
    workspaceUsage.estimatedCostUsd + projectedCostUsd > input.policy.monthlySpendUsd
  ) {
    throw new AiBudgetExceededError(
      `Workspace monthly spend limit reached ($${input.policy.monthlySpendUsd.toFixed(2)} estimated).`
    );
  }
  if (
    input.agentBudget?.monthlyTokens != null &&
    agentUsage &&
    agentUsage.totalTokens + projectedTokens > input.agentBudget.monthlyTokens
  ) {
    throw new AiBudgetExceededError(
      `Agent monthly token limit reached (${input.agentBudget.monthlyTokens.toLocaleString()} tokens).`
    );
  }
  if (
    input.agentBudget?.monthlySpendUsd != null &&
    agentUsage &&
    agentUsage.estimatedCostUsd + projectedCostUsd > input.agentBudget.monthlySpendUsd
  ) {
    throw new AiBudgetExceededError(
      `Agent monthly spend limit reached ($${input.agentBudget.monthlySpendUsd.toFixed(2)} estimated).`
    );
  }
};

export const recordAiUsage = async (input: {
  accountId: string;
  workspaceId: string;
  agentId?: string;
  usage: AiUsageMetadata;
}) => {
  const usage = {
    promptTokens: Math.max(0, Math.round(input.usage.promptTokens)),
    completionTokens: Math.max(0, Math.round(input.usage.completionTokens)),
  };
  const totalTokens = Math.max(
    0,
    Math.round(input.usage.totalTokens || usage.promptTokens + usage.completionTokens)
  );

  await database
    .insertInto('ai_usage_ledger')
    .values({
      id: generateId(IdType.Event),
      account_id: input.accountId,
      workspace_id: input.workspaceId,
      agent_id: input.agentId ?? null,
      provider: input.usage.provider,
      model: input.usage.model,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimateCostUsd(input.usage),
      request_id: input.usage.requestId ?? null,
      created_at: new Date(),
    })
    .execute();
};
