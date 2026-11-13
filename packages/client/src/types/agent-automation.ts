export type AgentTrigger = {
  id: string;
  workspace_id: string;
  agent_id: string;
  name: string;
  kind: 'manual' | 'schedule' | 'database' | 'webhook';
  enabled: boolean;
  config: Record<string, unknown>;
  last_fired_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
export type AgentDelegation = {
  id: string;
  workspace_id: string;
  owner_account_id: string;
  parent_run_id: string | null;
  parent_agent_id: string;
  child_run_id: string | null;
  child_agent_id: string;
  status: string;
  context: Record<string, unknown>;
  requested_permissions: string[];
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
};
export type AgentApproval = {
  id: string;
  workspace_id: string;
  delegation_id: string | null;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
};
export type AgentBlogPilot = {
  id: string;
  title: string;
  stage: string;
  status: string;
  content: Record<string, unknown>;
  reviewDecision: string | null;
  publicationBlocked: boolean;
  steps: Array<{ sequence: number; stage: string; status: string; run_id: string | null }>;
};
export type AgentAutomation = {
  triggers: AgentTrigger[];
  delegations: AgentDelegation[];
  approvals: AgentApproval[];
  pilots: AgentBlogPilot[];
};
