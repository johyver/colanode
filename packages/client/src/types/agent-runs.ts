export type AgentRunStatus = 'queued' | 'running' | 'waiting' | 'paused' | 'succeeded' | 'failed' | 'canceled';
export type AgentRunActionInput =
  | { kind: 'note'; message: string; idempotencyKey?: string }
  | { kind: 'mcp'; connectionId: string; toolName: string; arguments: Record<string, unknown>; approvalId?: string; idempotencyKey?: string };

export type AgentRun = {
  id: string;
  workspaceId: string;
  accountId: string;
  agentId: string;
  agentName?: string;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  currentStep: number;
  maxSteps: number;
  retryCount: number;
  nextRetryAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunStep = {
  id: string; runId: string; sequence: number; kind: string; status: string; actionKey: string | null;
  input: Record<string, unknown> | null; result: Record<string, unknown> | null; error: Record<string, unknown> | null;
  startedAt: string | null; finishedAt: string | null; createdAt: string;
};
export type AgentActionLedger = {
  id: string; runId: string; actionKey: string; actionType: string; status: string;
  input: Record<string, unknown> | null; result: Record<string, unknown> | null; error: Record<string, unknown> | null;
  attempts: number; createdAt: string; updatedAt: string;
};
export type AgentRunHistory = { run: AgentRun; steps: AgentRunStep[]; actions: AgentActionLedger[] };
export type AgentRuns = { runs: AgentRun[] };
