import {
  ColumnType,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from 'kysely';

import {
  NodeAttributes,
  NodeRole,
  NodeType,
  WorkspaceRole,
  UserStatus,
  DocumentType,
  DocumentContent,
  UpdateMergeMetadata,
} from '@colanode/core';
import { AccountAttributes } from '@colanode/server/types/accounts';

interface AccountTable {
  id: ColumnType<string, string, never>;
  name: ColumnType<string, string, string>;
  email: ColumnType<string, string, never>;
  avatar: ColumnType<string | null, string | null, string | null>;
  password: ColumnType<string | null, string | null, string | null>;
  attributes: JSONColumnType<
    AccountAttributes | null,
    string | null,
    string | null
  >;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  status: ColumnType<number, number, number>;
}

export type SelectAccount = Selectable<AccountTable>;
export type CreateAccount = Insertable<AccountTable>;
export type UpdateAccount = Updateable<AccountTable>;

interface DeviceTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  token_hash: ColumnType<string, string, string>;
  token_salt: ColumnType<string, string, string>;
  token_generated_at: ColumnType<Date, Date, Date>;
  previous_token_hash: ColumnType<string | null, string | null, string | null>;
  previous_token_salt: ColumnType<string | null, string | null, string | null>;
  type: ColumnType<number, number, number>;
  version: ColumnType<string, string, string>;
  platform: ColumnType<string | null, string | null, string | null>;
  ip: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  synced_at: ColumnType<Date | null, Date | null, Date>;
}

export type SelectDevice = Selectable<DeviceTable>;
export type CreateDevice = Insertable<DeviceTable>;
export type UpdateDevice = Updateable<DeviceTable>;

interface WorkspaceTable {
  id: ColumnType<string, string, never>;
  name: ColumnType<string, string, string>;
  description: ColumnType<string | null, string | null, string | null>;
  avatar: ColumnType<string | null, string | null, string | null>;
  attrs: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  created_by: ColumnType<string, string, never>;
  updated_by: ColumnType<string | null, string | null, string>;
  status: ColumnType<number, number, number>;
  max_file_size: ColumnType<string | null, string | null, string | null>;
}

export type SelectWorkspace = Selectable<WorkspaceTable>;
export type CreateWorkspace = Insertable<WorkspaceTable>;
export type UpdateWorkspace = Updateable<WorkspaceTable>;

interface UserTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  email: ColumnType<string, string, string>;
  role: ColumnType<WorkspaceRole, WorkspaceRole, WorkspaceRole>;
  name: ColumnType<string, string, string>;
  avatar: ColumnType<string | null, string | null, string | null>;
  custom_name: ColumnType<string | null, string | null, string | null>;
  custom_avatar: ColumnType<string | null, string | null, string | null>;
  storage_limit: ColumnType<string, string, string>;
  max_file_size: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  updated_by: ColumnType<string | null, string | null, string>;
  status: ColumnType<UserStatus, UserStatus, UserStatus>;
}

export type SelectUser = Selectable<UserTable>;
export type CreateUser = Insertable<UserTable>;
export type UpdateUser = Updateable<UserTable>;

interface NodeTable {
  id: ColumnType<string, string, never>;
  type: ColumnType<NodeType, never, never>;
  parent_id: ColumnType<string | null, never, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, string, string>;
  attributes: JSONColumnType<NodeAttributes, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  updated_by: ColumnType<string | null, string | null, string>;
}

export type SelectNode = Selectable<NodeTable>;
export type CreateNode = Insertable<NodeTable>;
export type UpdateNode = Updateable<NodeTable>;

interface NodeUpdateTable {
  id: ColumnType<string, string, never>;
  node_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  data: ColumnType<Uint8Array, Uint8Array, Uint8Array>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  merged_updates: ColumnType<
    UpdateMergeMetadata[] | null,
    string | null,
    string | null
  >;
}

export type SelectNodeUpdate = Selectable<NodeUpdateTable>;
export type CreateNodeUpdate = Insertable<NodeUpdateTable>;
export type UpdateNodeUpdate = Updateable<NodeUpdateTable>;

interface NodeInteractionTable {
  node_id: ColumnType<string, string, never>;
  collaborator_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  first_seen_at: ColumnType<Date | null, Date | null, Date | null>;
  last_seen_at: ColumnType<Date | null, Date | null, Date | null>;
  first_opened_at: ColumnType<Date | null, Date | null, Date | null>;
  last_opened_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectNodeInteraction = Selectable<NodeInteractionTable>;
export type CreateNodeInteraction = Insertable<NodeInteractionTable>;
export type UpdateNodeInteraction = Updateable<NodeInteractionTable>;

interface NodeReactionTable {
  node_id: ColumnType<string, string, never>;
  collaborator_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  reaction: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, Date>;
  deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectNodeReaction = Selectable<NodeReactionTable>;
export type CreateNodeReaction = Insertable<NodeReactionTable>;
export type UpdateNodeReaction = Updateable<NodeReactionTable>;

interface NodeTombstoneTable {
  id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  deleted_at: ColumnType<Date, Date, Date>;
  deleted_by: ColumnType<string, string, never>;
}

export type SelectNodeTombstone = Selectable<NodeTombstoneTable>;
export type CreateNodeTombstone = Insertable<NodeTombstoneTable>;
export type UpdateNodeTombstone = Updateable<NodeTombstoneTable>;

interface NodePathTable {
  ancestor_id: ColumnType<string, string, never>;
  descendant_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  level: ColumnType<number, number, number>;
}

export type SelectNodePath = Selectable<NodePathTable>;
export type CreateNodePath = Insertable<NodePathTable>;
export type UpdateNodePath = Updateable<NodePathTable>;

interface CollaborationTable {
  node_id: ColumnType<string, string, never>;
  collaborator_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  role: ColumnType<NodeRole, NodeRole, NodeRole>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
  updated_by: ColumnType<string | null, string | null, string | null>;
  deleted_at: ColumnType<Date | null, Date | null, Date | null>;
  deleted_by: ColumnType<string | null, string | null, string | null>;
}

export type SelectCollaboration = Selectable<CollaborationTable>;
export type CreateCollaboration = Insertable<CollaborationTable>;
export type UpdateCollaboration = Updateable<CollaborationTable>;

interface DocumentTable {
  id: ColumnType<string, string, never>;
  type: ColumnType<DocumentType, never, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, string, string>;
  content: JSONColumnType<DocumentContent, string, string>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  updated_by: ColumnType<string | null, string | null, string>;
}

export type SelectDocument = Selectable<DocumentTable>;
export type CreateDocument = Insertable<DocumentTable>;
export type UpdateDocument = Updateable<DocumentTable>;

interface DocumentUpdateTable {
  id: ColumnType<string, string, never>;
  document_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  revision: ColumnType<string, never, never>;
  data: ColumnType<Uint8Array, Uint8Array, Uint8Array>;
  created_at: ColumnType<Date, Date, never>;
  created_by: ColumnType<string, string, never>;
  merged_updates: ColumnType<
    UpdateMergeMetadata[] | null,
    string | null,
    string | null
  >;
}

export type SelectDocumentUpdate = Selectable<DocumentUpdateTable>;
export type CreateDocumentUpdate = Insertable<DocumentUpdateTable>;
export type UpdateDocumentUpdate = Updateable<DocumentUpdateTable>;

interface UploadTable {
  file_id: ColumnType<string, string, never>;
  upload_id: ColumnType<string, string, string>;
  workspace_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  mime_type: ColumnType<string, string, string>;
  size: ColumnType<number, number, number>;
  path: ColumnType<string, string, string>;
  version_id: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, Date>;
  created_by: ColumnType<string, string, string>;
  uploaded_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectUpload = Selectable<UploadTable>;
export type CreateUpload = Insertable<UploadTable>;
export type UpdateUpload = Updateable<UploadTable>;

interface NodeEmbeddingTable {
  node_id: ColumnType<string, string, never>;
  chunk: ColumnType<number, number, number>;
  revision: ColumnType<string, string, string>;
  workspace_id: ColumnType<string, string, never>;
  text: ColumnType<string, string, string>;
  summary: ColumnType<string | null, string | null, string | null>;
  embedding_vector: ColumnType<number[], number[], number[]>;
  search_vector: ColumnType<never, never, never>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectNodeEmbedding = Selectable<NodeEmbeddingTable>;
export type CreateNodeEmbedding = Insertable<NodeEmbeddingTable>;
export type UpdateNodeEmbedding = Updateable<NodeEmbeddingTable>;

interface DocumentEmbeddingTable {
  document_id: ColumnType<string, string, never>;
  chunk: ColumnType<number, number, number>;
  revision: ColumnType<string, string, string>;
  workspace_id: ColumnType<string, string, never>;
  text: ColumnType<string, string, string>;
  summary: ColumnType<string | null, string | null, string | null>;
  embedding_vector: ColumnType<number[], number[], number[]>;
  search_vector: ColumnType<never, never, never>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectDocumentEmbedding = Selectable<DocumentEmbeddingTable>;
export type CreateDocumentEmbedding = Insertable<DocumentEmbeddingTable>;
export type UpdateDocumentEmbedding = Updateable<DocumentEmbeddingTable>;

interface CounterTable {
  key: ColumnType<string, string, never>;
  value: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
}

interface AiCredentialTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  provider: ColumnType<string, string, never>;
  label: ColumnType<string, string, string>;
  ciphertext: ColumnType<string, string, string>;
  iv: ColumnType<string, string, string>;
  auth_tag: ColumnType<string, string, string>;
  key_version: ColumnType<number, number, number>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  revoked_at: ColumnType<Date | null, Date | null, Date | null>;
}

interface AiUsageLedgerTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  agent_id: ColumnType<string | null, string | null, string | null>;
  provider: ColumnType<string, string, never>;
  model: ColumnType<string, string, never>;
  prompt_tokens: ColumnType<number, number, number>;
  completion_tokens: ColumnType<number, number, number>;
  total_tokens: ColumnType<number, number, number>;
  estimated_cost_usd: ColumnType<number, number, number>;
  request_id: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
}

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
};

export type McpConnectionCapabilities = {
  tools: McpCapability[];
  resources: McpCapability[];
  prompts: McpCapability[];
};

export type McpToolPolicyStatus = 'allowed' | 'denied';
export type McpExecutionAuditStatus =
  | 'approval_required'
  | 'approved'
  | 'denied'
  | 'running'
  | 'succeeded'
  | 'failed';

export type McpToolPolicy = {
  id: string;
  accountId: string;
  workspaceId: string;
  connectionId: string;
  agentId: string;
  toolName: string;
  allowed: boolean;
  requireApproval: boolean;
  createdAt: Date;
  updatedAt: Date | null;
};

export type McpExecutionAudit = {
  id: string;
  accountId: string;
  workspaceId: string;
  connectionId: string;
  agentId: string;
  toolName: string;
  correlationId: string;
  status: McpExecutionAuditStatus;
  requireApproval: boolean;
  input: Record<string, unknown> | null;
  result: unknown;
  error: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

interface McpConnectionTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  name: ColumnType<string, string, string>;
  url: ColumnType<string, string, string>;
  kind: ColumnType<McpConnectionKind, McpConnectionKind, McpConnectionKind>;
  enabled: ColumnType<boolean, boolean, boolean>;
  auth_ciphertext: ColumnType<string | null, string | null, string | null>;
  auth_iv: ColumnType<string | null, string | null, string | null>;
  auth_tag: ColumnType<string | null, string | null, string | null>;
  auth_key_version: ColumnType<number | null, number | null, number | null>;
  auth_mode: ColumnType<McpConnectionAuthMode, McpConnectionAuthMode, McpConnectionAuthMode>;
  oauth_discovery_state: JSONColumnType<
    Record<string, unknown> | null,
    string | null,
    string | null
  >;
  oauth_pending_state: ColumnType<string | null, string | null, string | null>;
  oauth_pending_ciphertext: ColumnType<string | null, string | null, string | null>;
  oauth_pending_iv: ColumnType<string | null, string | null, string | null>;
  oauth_pending_tag: ColumnType<string | null, string | null, string | null>;
  oauth_authorization_url: ColumnType<string | null, string | null, string | null>;
  oauth_scope: ColumnType<string | null, string | null, string | null>;
  auth_expires_at: ColumnType<Date | null, Date | null, Date | null>;
  status: ColumnType<McpConnectionStatus, McpConnectionStatus, McpConnectionStatus>;
  last_error: ColumnType<string | null, string | null, string | null>;
  capabilities: JSONColumnType<
    McpConnectionCapabilities | null,
    string | null,
    string | null
  >;
  last_checked_at: ColumnType<Date | null, Date | null, Date | null>;
  retry_count: ColumnType<number, number, number>;
  circuit_state: ColumnType<'closed' | 'open' | 'half_open', 'closed' | 'open' | 'half_open', 'closed' | 'open' | 'half_open'>;
  circuit_opened_at: ColumnType<Date | null, Date | null, Date | null>;
  next_retry_at: ColumnType<Date | null, Date | null, Date | null>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
}

interface McpToolPolicyTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  connection_id: ColumnType<string, string, never>;
  agent_id: ColumnType<string, string, string>;
  tool_name: ColumnType<string, string, string>;
  allowed: ColumnType<boolean, boolean, boolean>;
  require_approval: ColumnType<boolean, boolean, boolean>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
}

interface McpExecutionAuditTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  connection_id: ColumnType<string, string, never>;
  agent_id: ColumnType<string, string, string>;
  tool_name: ColumnType<string, string, string>;
  correlation_id: ColumnType<string, string, never>;
  status: ColumnType<McpExecutionAuditStatus, McpExecutionAuditStatus, McpExecutionAuditStatus>;
  require_approval: ColumnType<boolean, boolean, boolean>;
  input: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  result: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  error: ColumnType<string | null, string | null, string | null>;
  approved_at: ColumnType<Date | null, Date | null, Date | null>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
}

export type SelectMcpConnection = Selectable<McpConnectionTable>;
export type CreateMcpConnection = Insertable<McpConnectionTable>;
export type UpdateMcpConnection = Updateable<McpConnectionTable>;

export type SelectAiCredential = Selectable<AiCredentialTable>;
export type CreateAiCredential = Insertable<AiCredentialTable>;
export type UpdateAiCredential = Updateable<AiCredentialTable>;
export type SelectAiUsageLedger = Selectable<AiUsageLedgerTable>;
export type CreateAiUsageLedger = Insertable<AiUsageLedgerTable>;

export type AgentLifecycle = 'draft' | 'active' | 'paused' | 'archived';
export type AgentModelConfig = {
  provider: 'openai' | 'google' | 'ollama' | 'lmstudio';
  model: string;
  temperature: number;
  maxOutputTokens: number | null;
};
export type AgentBudget = {
  monthlySpendUsd: number | null;
  monthlyTokens: number | null;
};
interface AgentTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  owner_account_id: ColumnType<string, string, never>;
  name: ColumnType<string, string, string>;
  description: ColumnType<string, string, string>;
  instructions: ColumnType<string, string, string>;
  model: JSONColumnType<AgentModelConfig, string, string>;
  mcp_tool_allowlist: JSONColumnType<string[], string, string>;
  permissions: JSONColumnType<string[], string, string>;
  triggers: JSONColumnType<string[], string, string>;
  budget: JSONColumnType<AgentBudget, string, string>;
  version: ColumnType<number, number, number>;
  lifecycle: ColumnType<AgentLifecycle, AgentLifecycle, AgentLifecycle>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date>;
  updated_by: ColumnType<string | null, string | null, string | null>;
}
export type SelectAgent = Selectable<AgentTable>;
export type CreateAgent = Insertable<AgentTable>;
export type UpdateAgent = Updateable<AgentTable>;

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'canceled';
export type AgentRunStepKind = 'checkpoint' | 'model' | 'tool' | 'note';
export type AgentRunStepStatus = 'pending' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'skipped';
export type AgentActionStatus = 'running' | 'waiting' | 'succeeded' | 'failed';

interface AgentRunTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  agent_id: ColumnType<string, string, never>;
  status: ColumnType<AgentRunStatus, AgentRunStatus, AgentRunStatus>;
  input: JSONColumnType<Record<string, unknown>, string, string>;
  output: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  error: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  current_step: ColumnType<number, number, number>;
  max_steps: ColumnType<number, number, number>;
  retry_count: ColumnType<number, number, number>;
  next_retry_at: ColumnType<Date | null, Date | null, Date | null>;
  started_at: ColumnType<Date | null, Date | null, Date | null>;
  finished_at: ColumnType<Date | null, Date | null, Date | null>;
  heartbeat_at: ColumnType<Date | null, Date | null, Date | null>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date, Date, Date>;
}

interface AgentRunStepTable {
  id: ColumnType<string, string, never>;
  run_id: ColumnType<string, string, never>;
  sequence: ColumnType<number, number, number>;
  kind: ColumnType<AgentRunStepKind, AgentRunStepKind, AgentRunStepKind>;
  status: ColumnType<AgentRunStepStatus, AgentRunStepStatus, AgentRunStepStatus>;
  action_key: ColumnType<string | null, string | null, string | null>;
  input: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  result: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  error: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  started_at: ColumnType<Date | null, Date | null, Date | null>;
  finished_at: ColumnType<Date | null, Date | null, Date | null>;
  created_at: ColumnType<Date, Date, never>;
}

interface AgentActionLedgerTable {
  id: ColumnType<string, string, never>;
  run_id: ColumnType<string, string, never>;
  action_key: ColumnType<string, string, never>;
  action_type: ColumnType<string, string, string>;
  status: ColumnType<AgentActionStatus, AgentActionStatus, AgentActionStatus>;
  input: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  result: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  error: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  attempts: ColumnType<number, number, number>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date, Date, Date>;
}

export type SelectAgentRun = Selectable<AgentRunTable>;
export type SelectAgentRunStep = Selectable<AgentRunStepTable>;
export type SelectAgentActionLedger = Selectable<AgentActionLedgerTable>;
export type CreateAgentRun = Insertable<AgentRunTable>;
export type CreateAgentRunStep = Insertable<AgentRunStepTable>;
export type CreateAgentActionLedger = Insertable<AgentActionLedgerTable>;

export type AgentTriggerKind = 'manual' | 'schedule' | 'database' | 'webhook';
export type AgentTriggerEventStatus = 'accepted' | 'duplicate' | 'ignored' | 'failed';
export type AgentDelegationStatus = 'proposed' | 'waiting' | 'approved' | 'rejected' | 'queued' | 'succeeded' | 'failed';
export type AgentApprovalKind = 'delegation' | 'action';
export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected';
export type AgentBlogPilotStage = 'draft' | 'author' | 'research' | 'content' | 'textmetrics' | 'review';

interface AgentTriggerTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  agent_id: ColumnType<string, string, never>;
  name: ColumnType<string, string, string>;
  kind: ColumnType<AgentTriggerKind, AgentTriggerKind, AgentTriggerKind>;
  enabled: ColumnType<boolean, boolean, boolean>;
  config: JSONColumnType<Record<string, unknown>, string, string>;
  secret: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  last_fired_at: ColumnType<Date | null, Date | null, Date | null>;
  last_error: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date, Date, Date>;
}
interface AgentTriggerEventTable {
  id: ColumnType<string, string, never>;
  trigger_id: ColumnType<string, string, never>;
  event_key: ColumnType<string, string, never>;
  source: ColumnType<string, string, string>;
  payload: JSONColumnType<Record<string, unknown>, string, string>;
  status: ColumnType<AgentTriggerEventStatus, AgentTriggerEventStatus, AgentTriggerEventStatus>;
  run_id: ColumnType<string | null, string | null, string | null>;
  error: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  received_at: ColumnType<Date, Date, never>;
  processed_at: ColumnType<Date | null, Date | null, Date | null>;
}
interface AgentDelegationTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  owner_account_id: ColumnType<string, string, never>;
  parent_run_id: ColumnType<string | null, string | null, string | null>;
  parent_agent_id: ColumnType<string, string, never>;
  child_run_id: ColumnType<string | null, string | null, string | null>;
  child_agent_id: ColumnType<string, string, never>;
  status: ColumnType<AgentDelegationStatus, AgentDelegationStatus, AgentDelegationStatus>;
  context: JSONColumnType<Record<string, unknown>, string, string>;
  requested_permissions: JSONColumnType<string[], string, string>;
  requires_approval: ColumnType<boolean, boolean, boolean>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date, Date, Date>;
}
interface AgentApprovalTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  run_id: ColumnType<string | null, string | null, string | null>;
  delegation_id: ColumnType<string | null, string | null, string | null>;
  kind: ColumnType<AgentApprovalKind, AgentApprovalKind, AgentApprovalKind>;
  status: ColumnType<AgentApprovalStatus, AgentApprovalStatus, AgentApprovalStatus>;
  requested_by: ColumnType<string, string, never>;
  decided_by: ColumnType<string | null, string | null, string | null>;
  decision_note: ColumnType<string | null, string | null, string | null>;
  payload: JSONColumnType<Record<string, unknown>, string, string>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date, Date, Date>;
}
interface AgentBlogPilotTable {
  id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  owner_account_id: ColumnType<string, string, never>;
  title: ColumnType<string, string, string>;
  stage: ColumnType<AgentBlogPilotStage, AgentBlogPilotStage, AgentBlogPilotStage>;
  status: ColumnType<string, string, string>;
  content: JSONColumnType<Record<string, unknown>, string, string>;
  review_decision: ColumnType<string | null, string | null, string | null>;
  publication_blocked: ColumnType<boolean, boolean, boolean>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date, Date, Date>;
}
interface AgentBlogPilotStepTable {
  id: ColumnType<string, string, never>;
  pilot_id: ColumnType<string, string, never>;
  sequence: ColumnType<number, number, number>;
  stage: ColumnType<string, string, string>;
  status: ColumnType<string, string, string>;
  agent_id: ColumnType<string | null, string | null, string | null>;
  run_id: ColumnType<string | null, string | null, string | null>;
  input: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  output: JSONColumnType<Record<string, unknown> | null, string | null, string | null>;
  created_at: ColumnType<Date, Date, never>;
}
export type SelectAgentTrigger = Selectable<AgentTriggerTable>;
export type SelectAgentTriggerEvent = Selectable<AgentTriggerEventTable>;
export type SelectAgentDelegation = Selectable<AgentDelegationTable>;
export type SelectAgentApproval = Selectable<AgentApprovalTable>;
export type SelectAgentBlogPilot = Selectable<AgentBlogPilotTable>;
export type SelectAgentBlogPilotStep = Selectable<AgentBlogPilotStepTable>;

export interface DatabaseSchema {
  accounts: AccountTable;
  devices: DeviceTable;
  workspaces: WorkspaceTable;
  users: UserTable;
  nodes: NodeTable;
  node_updates: NodeUpdateTable;
  node_interactions: NodeInteractionTable;
  node_reactions: NodeReactionTable;
  node_paths: NodePathTable;
  node_tombstones: NodeTombstoneTable;
  collaborations: CollaborationTable;
  documents: DocumentTable;
  document_updates: DocumentUpdateTable;
  uploads: UploadTable;
  node_embeddings: NodeEmbeddingTable;
  document_embeddings: DocumentEmbeddingTable;
  counters: CounterTable;
  ai_credentials: AiCredentialTable;
  ai_usage_ledger: AiUsageLedgerTable;
  mcp_connections: McpConnectionTable;
  mcp_tool_policies: McpToolPolicyTable;
  mcp_execution_audits: McpExecutionAuditTable;
  agents: AgentTable;
  agent_runs: AgentRunTable;
  agent_run_steps: AgentRunStepTable;
  agent_action_ledger: AgentActionLedgerTable;
  agent_triggers: AgentTriggerTable;
  agent_trigger_events: AgentTriggerEventTable;
  agent_delegations: AgentDelegationTable;
  agent_approvals: AgentApprovalTable;
  agent_blog_pilots: AgentBlogPilotTable;
  agent_blog_pilot_steps: AgentBlogPilotStepTable;
}
