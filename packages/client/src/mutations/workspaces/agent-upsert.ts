import { Agent, AgentBudget, AgentLifecycle, AgentModelConfig } from '@colanode/client/types/agents';

export type AgentUpsertMutationInput = {
  type: 'agent.upsert';
  userId: string;
  id?: string;
  name: string;
  description: string;
  instructions: string;
  model: AgentModelConfig;
  mcpToolAllowlist: string[];
  permissions: string[];
  triggers: string[];
  budget: AgentBudget;
  lifecycle: AgentLifecycle;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'agent.upsert': { input: AgentUpsertMutationInput; output: Agent };
  }
}
