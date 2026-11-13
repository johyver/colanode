import { randomUUID } from 'node:crypto';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import type {
  McpExecutionAudit,
  McpExecutionAuditStatus,
  McpToolPolicy,
  SelectMcpConnection,
} from '@colanode/server/data/schema';

import {
  connectMcpClient,
  McpConnectionManager,
} from './connection-manager';

export const WORKSPACE_TOOL_SCOPE = '__workspace__';

export class McpToolPermissionDeniedError extends Error {
  public readonly auditId: string;
  public readonly correlationId: string;

  public constructor(auditId: string, correlationId: string) {
    super('This tool is not allowed for the selected agent.');
    this.name = 'McpToolPermissionDeniedError';
    this.auditId = auditId;
    this.correlationId = correlationId;
  }
}

export class McpToolApprovalRequiredError extends Error {
  public readonly auditId: string;
  public readonly correlationId: string;

  public constructor(auditId: string, correlationId: string) {
    super('This tool requires approval before it can run.');
    this.name = 'McpToolApprovalRequiredError';
    this.auditId = auditId;
    this.correlationId = correlationId;
  }
}

export type McpToolPolicyInput = {
  accountId: string;
  workspaceId: string;
  connectionId: string;
  agentId?: string;
  toolName: string;
  allowed: boolean;
  requireApproval: boolean;
};

export type McpToolCallInput = {
  accountId: string;
  workspaceId: string;
  connectionId: string;
  agentId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  approvalId?: string;
};

export type McpToolCallOutput = {
  status: 'approval_required' | 'succeeded';
  auditId: string;
  correlationId: string;
  result?: unknown;
};

const scopeFor = (agentId?: string) => agentId?.trim() || WORKSPACE_TOOL_SCOPE;

const truncateAuditValue = (value: unknown): unknown => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { truncated: true, preview: '[unserializable tool value]' };
  }
  if (serialized.length <= 20_000) return value;
  return {
    truncated: true,
    preview: serialized.slice(0, 19_800),
  };
};

const toPolicy = (row: {
  id: string;
  account_id: string;
  workspace_id: string;
  connection_id: string;
  agent_id: string;
  tool_name: string;
  allowed: boolean;
  require_approval: boolean;
  created_at: Date;
  updated_at: Date | null;
}): McpToolPolicy => ({
  id: row.id,
  accountId: row.account_id,
  workspaceId: row.workspace_id,
  connectionId: row.connection_id,
  agentId: row.agent_id,
  toolName: row.tool_name,
  allowed: row.allowed,
  requireApproval: row.require_approval,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAudit = (row: {
  id: string;
  account_id: string;
  workspace_id: string;
  connection_id: string;
  agent_id: string;
  tool_name: string;
  correlation_id: string;
  status: McpExecutionAuditStatus;
  require_approval: boolean;
  input: Record<string, unknown> | null;
  result: unknown;
  error: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}): McpExecutionAudit => ({
  id: row.id,
  accountId: row.account_id,
  workspaceId: row.workspace_id,
  connectionId: row.connection_id,
  agentId: row.agent_id,
  toolName: row.tool_name,
  correlationId: row.correlation_id,
  status: row.status,
  requireApproval: row.require_approval,
  input: row.input,
  result: row.result,
  error: row.error,
  approvedAt: row.approved_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class McpToolSecurityManager {
  public constructor(private readonly connections = new McpConnectionManager()) {}

  public async listPolicies(accountId: string, workspaceId: string, connectionId: string) {
    await this.requireConnection(accountId, workspaceId, connectionId);
    const rows = await database
      .selectFrom('mcp_tool_policies')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .where('connection_id', '=', connectionId)
      .orderBy('agent_id', 'asc')
      .orderBy('tool_name', 'asc')
      .execute();
    return rows.map(toPolicy);
  }

  public async upsertPolicy(input: McpToolPolicyInput) {
    const toolName = input.toolName.trim();
    if (!toolName) throw new Error('Tool name is required.');
    await this.requireConnection(input.accountId, input.workspaceId, input.connectionId);
    const agentId = scopeFor(input.agentId);
    const existing = await database
      .selectFrom('mcp_tool_policies')
      .selectAll()
      .where('account_id', '=', input.accountId)
      .where('workspace_id', '=', input.workspaceId)
      .where('connection_id', '=', input.connectionId)
      .where('agent_id', '=', agentId)
      .where('tool_name', '=', toolName)
      .executeTakeFirst();
    const now = new Date();
    const row = existing
      ? await database
          .updateTable('mcp_tool_policies')
          .set({
            allowed: input.allowed,
            require_approval: input.requireApproval,
            updated_at: now,
          })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await database
          .insertInto('mcp_tool_policies')
          .values({
            id: generateId(IdType.Node),
            account_id: input.accountId,
            workspace_id: input.workspaceId,
            connection_id: input.connectionId,
            agent_id: agentId,
            tool_name: toolName,
            allowed: input.allowed,
            require_approval: input.requireApproval,
            created_at: now,
            updated_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
    return toPolicy(row);
  }

  public async removePolicy(accountId: string, workspaceId: string, policyId: string) {
    const deleted = await database
      .deleteFrom('mcp_tool_policies')
      .where('id', '=', policyId)
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .returning('id')
      .executeTakeFirst();
    return Boolean(deleted);
  }

  public async listAudits(accountId: string, workspaceId: string, connectionId: string) {
    await this.requireConnection(accountId, workspaceId, connectionId);
    const rows = await database
      .selectFrom('mcp_execution_audits')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .where('connection_id', '=', connectionId)
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute();
    return rows.map(toAudit);
  }

  public async approveAudit(accountId: string, workspaceId: string, auditId: string) {
    const row = await database
      .selectFrom('mcp_execution_audits')
      .selectAll()
      .where('id', '=', auditId)
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (!row) throw new Error('MCP execution audit entry was not found.');
    if (row.status !== 'approval_required') {
      throw new Error('This execution is no longer waiting for approval.');
    }
    const updated = await database
      .updateTable('mcp_execution_audits')
      .set({ status: 'approved', approved_at: new Date(), updated_at: new Date() })
      .where('id', '=', auditId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toAudit(updated);
  }

  public async callTool(input: McpToolCallInput): Promise<McpToolCallOutput> {
    const connection = await this.requireConnection(
      input.accountId,
      input.workspaceId,
      input.connectionId
    );
    const agentId = scopeFor(input.agentId);
    const policy = await database
      .selectFrom('mcp_tool_policies')
      .selectAll()
      .where('account_id', '=', input.accountId)
      .where('workspace_id', '=', input.workspaceId)
      .where('connection_id', '=', input.connectionId)
      .where('agent_id', '=', agentId)
      .where('tool_name', '=', input.toolName)
      .executeTakeFirst();

    if (!policy?.allowed) {
      const audit = await this.createAudit({
        ...input,
        agentId,
        status: 'denied',
        requireApproval: Boolean(policy?.require_approval),
        error: 'Tool is not present in the agent allowlist.',
      });
      throw new McpToolPermissionDeniedError(audit.id, audit.correlationId);
    }

    if (policy.require_approval) {
      if (!input.approvalId) {
        const audit = await this.createAudit({
          ...input,
          agentId,
          status: 'approval_required',
          requireApproval: true,
        });
        throw new McpToolApprovalRequiredError(audit.id, audit.correlationId);
      }
      const approval = await database
        .selectFrom('mcp_execution_audits')
        .selectAll()
        .where('id', '=', input.approvalId)
        .where('account_id', '=', input.accountId)
        .where('workspace_id', '=', input.workspaceId)
        .where('connection_id', '=', input.connectionId)
        .where('agent_id', '=', agentId)
        .where('tool_name', '=', input.toolName)
        .executeTakeFirst();
      if (!approval || approval.status !== 'approved') {
        throw new McpToolApprovalRequiredError(
          approval?.id ?? input.approvalId,
          approval?.correlation_id ?? randomUUID()
        );
      }
      await database
        .updateTable('mcp_execution_audits')
        .set({ status: 'running', updated_at: new Date() })
        .where('id', '=', approval.id)
        .execute();
      return this.executeApproved(connection, input, approval.id, approval.correlation_id);
    }

    const audit = await this.createAudit({
      ...input,
      agentId,
      status: 'running',
      requireApproval: false,
    });
    return this.executeApproved(connection, input, audit.id, audit.correlationId);
  }

  private async executeApproved(
    connection: SelectMcpConnection,
    input: McpToolCallInput,
    auditId: string,
    correlationId: string
  ): Promise<McpToolCallOutput> {
    try {
      const connected = await connectMcpClient(connection, this.connections);
      try {
        const result = await connected.client.callTool({
          name: input.toolName,
          arguments: input.arguments,
        });
        const auditResult = truncateAuditValue(result);
        await database
          .updateTable('mcp_execution_audits')
          .set({ status: 'succeeded', result: JSON.stringify(auditResult), error: null, updated_at: new Date() })
          .where('id', '=', auditId)
          .execute();
        return { status: 'succeeded', auditId, correlationId, result };
      } finally {
        await connected.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP tool execution failed.';
      await database
        .updateTable('mcp_execution_audits')
        .set({ status: 'failed', error: message, updated_at: new Date() })
        .where('id', '=', auditId)
        .execute();
      throw error;
    }
  }

  private async createAudit(input: McpToolCallInput & {
    agentId: string;
    status: McpExecutionAuditStatus;
    requireApproval: boolean;
    error?: string;
  }) {
    const row = await database
      .insertInto('mcp_execution_audits')
      .values({
        id: generateId(IdType.Node),
        account_id: input.accountId,
        workspace_id: input.workspaceId,
        connection_id: input.connectionId,
        agent_id: input.agentId,
        tool_name: input.toolName,
        correlation_id: randomUUID(),
        status: input.status,
        require_approval: input.requireApproval,
        input: JSON.stringify(truncateAuditValue(input.arguments)),
        result: null,
        error: input.error ?? null,
        approved_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toAudit(row);
  }

  private async requireConnection(accountId: string, workspaceId: string, connectionId: string) {
    const connection = await this.connections.findById(connectionId);
    if (
      !connection ||
      connection.account_id !== accountId ||
      connection.workspace_id !== workspaceId
    ) {
      throw new Error('MCP server connection was not found.');
    }
    return connection;
  }
}
