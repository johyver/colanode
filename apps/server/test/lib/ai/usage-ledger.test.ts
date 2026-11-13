import { describe, expect, it } from 'vitest';

import { database } from '@colanode/server/data/database';
import {
  aiPolicySchema,
  type AiChatRequest,
} from '@colanode/server/lib/ai/provider-gateway';
import {
  AiBudgetExceededError,
  enforceAiBudget,
  estimateProjectedCostUsd,
  recordAiUsage,
} from '@colanode/server/lib/ai/usage-ledger';

import { createAccount, createWorkspace } from '../../helpers/seed';

const request: AiChatRequest = {
  task: 'response',
  messages: [{ role: 'user', content: 'Synthetic budget probe' }],
  stream: false,
  timeoutMs: 5000,
  maxRetries: 0,
};

describe('AI usage and budget boundaries', () => {
  it('reserves the permitted cloud fallback cost before a local outage can use it', async () => {
    const account = await createAccount({ email: `budget-fallback-${Date.now()}@example.com` });
    const workspace = await createWorkspace({ createdBy: account.id, name: 'Synthetic Budget Fallback' });
    const selectedSettings = {
      provider: 'ollama' as const,
      model: 'qwen3:4b',
      maxOutputTokens: 1024,
    };
    const policy = aiPolicySchema.parse({
      localOnly: false,
      allowCloudFallback: true,
      fallbackProvider: 'google',
      fallbackModel: 'gemini-2.5-flash',
      monthlySpendUsd: 0.000001,
      monthlyTokens: null,
    });

    expect(estimateProjectedCostUsd({ request, selectedSettings, policy })).toBeGreaterThan(0);
    await expect(
      enforceAiBudget({
        accountId: account.id,
        workspaceId: workspace.id,
        request,
        selectedSettings,
        policy,
      })
    ).rejects.toBeInstanceOf(AiBudgetExceededError);
  });

  it('blocks an agent after its recorded local token budget is exhausted', async () => {
    const account = await createAccount({ email: `budget-agent-${Date.now()}@example.com` });
    const workspace = await createWorkspace({ createdBy: account.id, name: 'Synthetic Agent Budget' });
    await recordAiUsage({
      accountId: account.id,
      workspaceId: workspace.id,
      agentId: 'synthetic-budget-agent',
      usage: {
        provider: 'ollama',
        model: 'qwen3:4b',
        promptTokens: 9,
        completionTokens: 0,
        totalTokens: 9,
        durationMs: 1,
      },
    });

    await expect(
      enforceAiBudget({
        accountId: account.id,
        workspaceId: workspace.id,
        agentId: 'synthetic-budget-agent',
        request: {
          ...request,
          messages: [{ role: 'user', content: 'x' }],
        },
        selectedSettings: {
          provider: 'ollama',
          model: 'qwen3:4b',
          maxOutputTokens: 1,
        },
        agentBudget: { monthlySpendUsd: null, monthlyTokens: 10 },
        policy: aiPolicySchema.parse({
          localOnly: true,
          allowCloudFallback: false,
          fallbackProvider: null,
          fallbackModel: null,
          monthlySpendUsd: null,
          monthlyTokens: null,
        }),
      })
    ).rejects.toThrow('Agent monthly token limit reached');

    const row = await database
      .selectFrom('ai_usage_ledger')
      .select(['provider', 'model', 'estimated_cost_usd'])
      .where('account_id', '=', account.id)
      .where('workspace_id', '=', workspace.id)
      .where('agent_id', '=', 'synthetic-budget-agent')
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ provider: 'ollama', model: 'qwen3:4b', estimated_cost_usd: 0 });
  });
});
