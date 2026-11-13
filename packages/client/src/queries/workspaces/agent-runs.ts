import { AgentRuns, AgentRunHistory } from '@colanode/client/types/agent-runs';

export type AgentRunsQueryInput = { type: 'agent-runs.get'; userId: string };
export type AgentRunHistoryQueryInput = { type: 'agent-run-history.get'; userId: string; runId: string };

declare module '@colanode/client/queries' {
  interface QueryMap {
    'agent-runs.get': { input: AgentRunsQueryInput; output: AgentRuns };
    'agent-run-history.get': { input: AgentRunHistoryQueryInput; output: AgentRunHistory };
  }
}
