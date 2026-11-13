export type AiProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'lmstudio';

export type AiModelSettings = {
  provider?: AiProvider;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  budget?: AiBudgetSettings;
};

export type AiBudgetSettings = {
  monthlySpendUsd?: number | null;
  monthlyTokens?: number | null;
};

export type AiPolicySettings = {
  localOnly: boolean;
  allowCloudFallback: boolean;
  fallbackProvider: 'openai' | 'google' | null;
  fallbackModel: string | null;
  monthlySpendUsd: number | null;
  monthlyTokens: number | null;
};

export type AiUsageSummary = {
  monthStart: string;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type AiSettings = {
  user: AiModelSettings | null;
  agents: Record<string, AiModelSettings>;
  policy: AiPolicySettings;
  usage: AiUsageSummary;
};

export type AiLocalModelProvider = {
  provider: 'ollama' | 'lmstudio';
  available: boolean;
  baseUrl: string;
  models: string[];
  error?: string;
};

export type AiLocalModels = {
  providers: AiLocalModelProvider[];
};

export type AiCredential = {
  provider: 'openai' | 'google' | 'anthropic';
  label: string;
  createdAt: string;
  updatedAt: string | null;
  revokedAt: string | null;
};

export type AiCredentials = {
  credentials: AiCredential[];
};
