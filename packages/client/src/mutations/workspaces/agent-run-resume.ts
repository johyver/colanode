import { AgentRun } from '@colanode/client/types/agent-runs';
export type AgentRunResumeMutationInput = { type: 'agent-run.resume'; userId: string; runId: string; approvalId?: string };
declare module '@colanode/client/mutations' { interface MutationMap { 'agent-run.resume': { input: AgentRunResumeMutationInput; output: AgentRun }; } }
