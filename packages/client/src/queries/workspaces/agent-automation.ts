import { AgentAutomation } from '@colanode/client/types/agent-automation';

export type AgentAutomationQueryInput = { type: 'agent-automation.get'; userId: string };
declare module '@colanode/client/queries' {
  interface QueryMap {
    'agent-automation.get': { input: AgentAutomationQueryInput; output: AgentAutomation };
  }
}
