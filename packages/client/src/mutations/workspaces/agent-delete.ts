export type AgentDeleteMutationInput = {
  type: 'agent.delete';
  userId: string;
  agentId: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'agent.delete': { input: AgentDeleteMutationInput; output: { deleted: boolean } };
  }
}
