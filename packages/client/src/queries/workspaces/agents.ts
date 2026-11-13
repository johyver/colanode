import { Agents } from '@colanode/client/types/agents';

export type AgentsQueryInput = {
  type: 'agents.get';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'agents.get': {
      input: AgentsQueryInput;
      output: Agents;
    };
  }
}
