import { JobHandler } from '@colanode/server/jobs';
import { agentRuntime } from '@colanode/server/lib/agents/agent-runtime';

export type AgentRunExecuteInput = {
  type: 'agent.run.execute';
  runId: string;
};

declare module '@colanode/server/jobs' {
  interface JobMap {
    'agent.run.execute': { input: AgentRunExecuteInput };
  }
}

export const agentRunExecuteHandler: JobHandler<AgentRunExecuteInput> = async (input) => {
  await agentRuntime.executeRun(input.runId);
};
