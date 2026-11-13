export type McpConnectionKind = 'remote' | 'local';
export type McpConnectionAuthMode = 'none' | 'token' | 'oauth';
export type McpConnectionStatus =
  | 'unknown'
  | 'connected'
  | 'error'
  | 'disabled'
  | 'reauthorization_required';

export type McpCapability = {
  name: string;
  title?: string;
  description?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
};

export type McpToolPolicy = {
  id: string;
  accountId: string;
  workspaceId: string;
  connectionId: string;
  agentId: string;
  toolName: string;
  allowed: boolean;
  requireApproval: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export type McpExecutionAudit = {
  id: string;
  accountId: string;
  workspaceId: string;
  connectionId: string;
  agentId: string;
  toolName: string;
  correlationId: string;
  status: 'approval_required' | 'approved' | 'denied' | 'running' | 'succeeded' | 'failed';
  requireApproval: boolean;
  input: Record<string, unknown> | null;
  result: unknown;
  error: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type McpConnection = {
  id: string;
  name: string;
  url: string;
  kind: McpConnectionKind;
  enabled: boolean;
  authMode: McpConnectionAuthMode;
  status: McpConnectionStatus;
  lastError: string | null;
  capabilities: {
    tools: McpCapability[];
    resources: McpCapability[];
    prompts: McpCapability[];
  };
  lastCheckedAt: string | null;
  hasAuthToken: boolean;
  hasOAuthCredentials: boolean;
  reauthorizationRequired: boolean;
  authorizationUrl: string | null;
  retryCount: number;
  circuitState: 'closed' | 'open' | 'half_open';
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type McpConnections = {
  connections: McpConnection[];
};
