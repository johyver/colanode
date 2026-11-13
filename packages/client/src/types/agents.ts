export type AgentLifecycle = 'draft' | 'active' | 'paused' | 'archived';
export type AgentProvider = 'openai' | 'google' | 'ollama' | 'lmstudio';

export type AgentModelConfig = {
  provider: AgentProvider;
  model: string;
  temperature: number;
  maxOutputTokens: number | null;
};

export type AgentBudget = {
  monthlySpendUsd: number | null;
  monthlyTokens: number | null;
};

export type Agent = {
  id: string;
  workspaceId: string;
  ownerAccountId: string;
  name: string;
  description: string;
  instructions: string;
  model: AgentModelConfig;
  mcpToolAllowlist: string[];
  permissions: string[];
  triggers: string[];
  budget: AgentBudget;
  version: number;
  lifecycle: AgentLifecycle;
  createdAt: string;
  updatedAt: string | null;
};

export type Agents = { agents: Agent[] };
