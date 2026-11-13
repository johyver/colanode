import { describe, expect, it } from 'vitest';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { agentRuntime } from '@colanode/server/lib/agents/agent-runtime';
import { McpConnectionManager } from '@colanode/server/lib/mcp/connection-manager';
import { McpToolSecurityManager } from '@colanode/server/lib/mcp/tool-security';

import { createAccount, createWorkspace } from './helpers/seed';

const createActiveAgent = async (input: { accountId: string; workspaceId: string; name: string }) => {
  const now = new Date();
  return database
    .insertInto('agents')
    .values({
      id: generateId(IdType.Agent),
      workspace_id: input.workspaceId,
      owner_account_id: input.accountId,
      name: input.name,
      description: 'Synthetic P7-03 acceptance agent',
      instructions: 'Operate only on synthetic data.',
      model: JSON.stringify({ provider: 'ollama', model: 'qwen3:4b', temperature: 0.2, maxOutputTokens: 1 }),
      mcp_tool_allowlist: JSON.stringify(['write_external']),
      permissions: JSON.stringify(['mcp:execute']),
      triggers: JSON.stringify([]),
      budget: JSON.stringify({ monthlySpendUsd: null, monthlyTokens: null }),
      version: 1,
      lifecycle: 'active',
      created_at: now,
      updated_at: now,
      updated_by: input.accountId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
};

describe('durable agent runtime acceptance boundaries', () => {
  it('records an end-to-end denied MCP write without contacting the external server', async () => {
    const account = await createAccount({ email: `agent-denial-${Date.now()}@example.com` });
    const workspace = await createWorkspace({ createdBy: account.id, name: 'Synthetic Agent Denial' });
    const agent = await createActiveAgent({ accountId: account.id, workspaceId: workspace.id, name: `Denied ${Date.now()}` });
    const connections = new McpConnectionManager();
    const connection = await connections.upsert({
      accountId: account.id,
      workspaceId: workspace.id,
      name: `unreachable-synthetic-${Date.now()}`,
      url: 'http://127.0.0.1:59997/mcp',
      kind: 'local',
      authMode: 'none',
    });
    const security = new McpToolSecurityManager(connections);
    await security.upsertPolicy({
      accountId: account.id,
      workspaceId: workspace.id,
      connectionId: connection.id,
      agentId: agent.id,
      toolName: 'write_external',
      allowed: false,
      requireApproval: false,
    });

    const run = await agentRuntime.createRun({
      accountId: account.id,
      workspaceId: workspace.id,
      agentId: agent.id,
      task: 'Attempt the synthetic write and prove it is denied.',
      actions: [{ kind: 'mcp', connectionId: connection.id, toolName: 'write_external', arguments: {} }],
      maxSteps: 1,
    });
    await agentRuntime.executeRun(run.id);

    const history = await agentRuntime.getHistory(account.id, workspace.id, run.id);
    expect(history.run.status).toBe('failed');
    expect(history.run.error).toMatchObject({ code: 'permission_denied' });
    expect(history.actions).toHaveLength(1);
    expect(history.actions[0]).toMatchObject({ status: 'failed' });
    expect(history.steps[0]).toMatchObject({ kind: 'tool', status: 'failed' });
    const audits = await security.listAudits(account.id, workspace.id, connection.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ agentId: agent.id, toolName: 'write_external', status: 'denied' });
  });

  it('executes durable note actions with a measurable synthetic throughput baseline', async () => {
    const account = await createAccount({ email: `agent-throughput-${Date.now()}@example.com` });
    const workspace = await createWorkspace({ createdBy: account.id, name: 'Synthetic Agent Throughput' });
    const agent = await createActiveAgent({ accountId: account.id, workspaceId: workspace.id, name: `Throughput ${Date.now()}` });
    const actionCount = 16;
    const started = performance.now();
    const run = await agentRuntime.createRun({
      accountId: account.id,
      workspaceId: workspace.id,
      agentId: agent.id,
      task: 'Execute synthetic durable notes.',
      actions: Array.from({ length: actionCount }, (_, index) => ({ kind: 'note' as const, message: `synthetic-${index}` })),
      maxSteps: actionCount,
    });
    await agentRuntime.executeRun(run.id);
    const elapsedMs = performance.now() - started;
    const history = await agentRuntime.getHistory(account.id, workspace.id, run.id);

    expect(history.run.status).toBe('succeeded');
    expect(history.actions).toHaveLength(actionCount);
    expect(history.actions.every((action) => action.status === 'succeeded')).toBe(true);
    expect(elapsedMs).toBeLessThan(5000);
    console.info(
      `P7-03 synthetic agent throughput: ${actionCount} durable note actions in ${elapsedMs.toFixed(1)}ms (${(actionCount / (elapsedMs / 1000)).toFixed(1)} actions/s)`
    );
  });
});
