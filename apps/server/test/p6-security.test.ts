import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiErrorCode } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { AiCredentialVault } from '@colanode/server/lib/ai/credential-vault';
import { McpConnectionManager } from '@colanode/server/lib/mcp/connection-manager';
import {
  McpToolApprovalRequiredError,
  McpToolPermissionDeniedError,
  McpToolSecurityManager,
} from '@colanode/server/lib/mcp/tool-security';

import { buildTestApp } from './helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
  createUser,
  createWorkspace,
} from './helpers/seed';

const app = buildTestApp();

beforeAll(async () => {
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('P6 workspace isolation and secret boundaries', () => {
  it('denies a valid identity access to a different workspace', async () => {
    const first = await createAccount({ email: `p6-first-${Date.now()}@example.com` });
    const second = await createAccount({ email: `p6-second-${Date.now()}@example.com` });
    const firstWorkspace = await createWorkspace({ createdBy: first.id, name: 'P6 First Workspace' });
    const secondWorkspace = await createWorkspace({ createdBy: second.id, name: 'P6 Second Workspace' });
    await createUser({ workspaceId: firstWorkspace.id, account: first, role: 'owner' });
    await createUser({ workspaceId: secondWorkspace.id, account: second, role: 'owner' });

    const { token } = await createDevice({ accountId: first.id });
    const allowed = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${firstWorkspace.id}`,
      headers: buildAuthHeader(token),
    });
    const denied = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${secondWorkspace.id}`,
      headers: buildAuthHeader(token),
    });

    expect(allowed.statusCode).toBe(200);
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: ApiErrorCode.WorkspaceNoAccess });
  });

  it('stores credentials encrypted and resolves them only in their workspace', async () => {
    const account = await createAccount({ email: `p6-vault-${Date.now()}@example.com` });
    const firstWorkspace = await createWorkspace({ createdBy: account.id, name: 'P6 Vault Workspace A' });
    const secondWorkspace = await createWorkspace({ createdBy: account.id, name: 'P6 Vault Workspace B' });
    const secret = `synthetic-p6-secret-${Date.now()}`;
    const vault = new AiCredentialVault({ masterKey: 'p6-synthetic-master-key' });

    await vault.upsert({
      accountId: account.id,
      workspaceId: firstWorkspace.id,
      provider: 'openai',
      label: 'Synthetic test key',
      apiKey: secret,
    });

    const row = await database
      .selectFrom('ai_credentials')
      .select(['ciphertext'])
      .where('account_id', '=', account.id)
      .where('workspace_id', '=', firstWorkspace.id)
      .executeTakeFirstOrThrow();

    expect(row.ciphertext).not.toContain(secret);
    expect(await vault.resolve(account.id, firstWorkspace.id, 'openai')).toBe(secret);
    expect(await vault.resolve(account.id, secondWorkspace.id, 'openai')).toBeUndefined();

    await vault.revoke(account.id, firstWorkspace.id, 'openai');
    expect(await vault.resolve(account.id, firstWorkspace.id, 'openai')).toBeUndefined();
  });
});
describe('P6 MCP permission and audit boundaries', () => {
  it('denies disallowed tools and gates approved tools before any external call', async () => {
    const account = await createAccount({ email: `p6-mcp-${Date.now()}@example.com` });
    const workspace = await createWorkspace({ createdBy: account.id, name: 'P6 MCP Workspace' });
    const otherWorkspace = await createWorkspace({ createdBy: account.id, name: 'P6 MCP Other Workspace' });
    const connections = new McpConnectionManager();
    const connection = await connections.upsert({
      accountId: account.id,
      workspaceId: workspace.id,
      name: `synthetic-${Date.now()}`,
      url: 'http://127.0.0.1:59999/mcp',
      kind: 'local',
      authMode: 'none',
    });
    const security = new McpToolSecurityManager(connections);

    await security.upsertPolicy({
      accountId: account.id,
      workspaceId: workspace.id,
      connectionId: connection.id,
      agentId: 'p6-agent',
      toolName: 'write_external',
      allowed: false,
      requireApproval: true,
    });
    await security.upsertPolicy({
      accountId: account.id,
      workspaceId: workspace.id,
      connectionId: connection.id,
      agentId: 'p6-agent',
      toolName: 'read_external',
      allowed: true,
      requireApproval: true,
    });

    await expect(
      security.callTool({
        accountId: account.id,
        workspaceId: workspace.id,
        connectionId: connection.id,
        agentId: 'p6-agent',
        toolName: 'write_external',
        arguments: { marker: 'synthetic-only' },
      })
    ).rejects.toBeInstanceOf(McpToolPermissionDeniedError);

    let approvalError: unknown;
    try {
      await security.callTool({
        accountId: account.id,
        workspaceId: workspace.id,
        connectionId: connection.id,
        agentId: 'p6-agent',
        toolName: 'read_external',
        arguments: { marker: 'synthetic-only' },
      });
    } catch (error) {
      approvalError = error;
    }
    expect(approvalError).toBeInstanceOf(McpToolApprovalRequiredError);

    await expect(security.listPolicies(account.id, otherWorkspace.id, connection.id)).rejects.toThrow(
      'MCP server connection was not found.'
    );
    const audits = await security.listAudits(account.id, workspace.id, connection.id);
    expect(audits.some((audit) => audit.status === 'denied')).toBe(true);
    expect(audits.some((audit) => audit.status === 'approval_required')).toBe(true);
  });

  it('converts an expired OAuth access token without a refresh token into reauthorization', async () => {
    const account = await createAccount({ email: `p6-oauth-${Date.now()}@example.com` });
    const workspace = await createWorkspace({ createdBy: account.id, name: 'P6 OAuth Workspace' });
    const connections = new McpConnectionManager();
    const connection = await connections.upsert({
      accountId: account.id,
      workspaceId: workspace.id,
      name: `expired-${Date.now()}`,
      url: 'http://127.0.0.1:59998/mcp',
      kind: 'local',
      authMode: 'none',
    });
    await database
      .updateTable('mcp_connections')
      .set({ auth_mode: 'oauth', auth_expires_at: new Date(Date.now() - 1_000) })
      .where('id', '=', connection.id)
      .execute();

    const result = await connections.check(account.id, workspace.id, connection.id);

    expect(result.status).toBe('reauthorization_required');
    expect(result.lastError).toContain('expired');
    expect(result.reauthorizationRequired).toBe(true);
  });
});
