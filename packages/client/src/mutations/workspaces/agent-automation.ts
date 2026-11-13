import { AgentAutomation } from '@colanode/client/types/agent-automation';

export type AgentAutomationMutationInput = {
  type: 'agent-automation.action';
  userId: string;
  action:
    | { kind: 'trigger-toggle'; triggerId: string; enabled: boolean }
    | { kind: 'trigger-create'; agentId: string; name: string; triggerKind: 'manual' | 'schedule' | 'database' | 'webhook'; config: Record<string, unknown>; webhookSecret?: string }
    | { kind: 'trigger-fire'; triggerId: string; eventKey?: string; payload?: Record<string, unknown> }
    | { kind: 'delegation-propose'; parentAgentId: string; childAgentId: string; context?: Record<string, unknown>; requestedPermissions?: string[]; requiresApproval?: boolean }
    | { kind: 'delegation-decide'; delegationId: string; decision: 'approved' | 'rejected'; note?: string }
    | { kind: 'pilot-create'; title: string }
    | { kind: 'pilot-run'; pilotId: string; agentIds: Record<string, string> }
    | { kind: 'pilot-review'; pilotId: string; decision: 'approved' | 'rejected'; note?: string };
};
declare module '@colanode/client/mutations' {
  interface MutationMap {
    'agent-automation.action': { input: AgentAutomationMutationInput; output: AgentAutomation | Record<string, unknown> };
  }
}
