import { JobHandler } from '@colanode/server/jobs';
import { agentAutomation } from '@colanode/server/lib/agents/agent-automation';

export type AgentTriggerTickInput = { type: 'agent.trigger.tick' };

declare module '@colanode/server/jobs' {
  interface JobMap {
    'agent.trigger.tick': { input: AgentTriggerTickInput };
  }
}

export const agentTriggerTickHandler: JobHandler<AgentTriggerTickInput> = async () => {
  await agentAutomation.tickSchedules();
};
