import { AgentRun, AgentRunActionInput } from '@colanode/client/types/agent-runs';

export type AgentRunStartMutationInput = { type: 'agent-run.start'; userId: string; agentId: string; task: string; actions?: AgentRunActionInput[]; maxSteps?: number };
declare module '@colanode/client/mutations' { interface MutationMap { 'agent-run.start': { input: AgentRunStartMutationInput; output: AgentRun }; } }
