import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  generateId,
  IdType,
  MutationStatus,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { isWorkspaceActionRateLimited } from '@colanode/server/lib/rate-limits';
import { canInviteWorkspaceRole } from '@colanode/server/lib/workspace-role-policy';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  buildCreateNodeMutation,
  createAccount,
  createDevice,
  createFileNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const app = buildTestApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('typed workspace action API', () => {
  it('rejects unauthenticated access', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/client/v1/workspaces/unknown/actions/nodes/missing',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.TokenMissing,
    });
  });

  it('returns authorized node reads with server-owned audit metadata', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      account,
      workspaceId: workspace.id,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });
    const nodeId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/client/v1/workspaces/' + workspace.id + '/actions/nodes/' + nodeId,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'node.read',
      node: { id: nodeId, type: 'space' },
    });
    expect(response.json().requestId).toBeTruthy();
    expect(new Date(response.json().executedAt).getTime()).not.toBeNaN();
  });

  it('denies private node reads to active workspace guests', async () => {
    const owner = await createAccount();
    const guest = await createAccount();
    const workspace = await createWorkspace({ createdBy: owner.id });
    const ownerUser = await createUser({
      account: owner,
      workspaceId: workspace.id,
      role: 'owner',
    });
    await createUser({
      account: guest,
      workspaceId: workspace.id,
      role: 'guest',
    });
    const rootId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: ownerUser.id,
    });
    const { token } = await createDevice({ accountId: guest.id });

    const response = await app.inject({
      method: 'GET',
      url: '/client/v1/workspaces/' + workspace.id + '/actions/nodes/' + rootId,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe(ApiErrorCode.Forbidden);
  });

  it('scopes node reads, writes and file routes to the requested workspace', async () => {
    const account = await createAccount();
    const first = await createWorkspace({ createdBy: account.id });
    const second = await createWorkspace({ createdBy: account.id });
    const firstUser = await createUser({
      account,
      workspaceId: first.id,
      role: 'owner',
    });
    await createUser({
      account,
      workspaceId: second.id,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });
    const rootId = await createSpaceNode({
      workspaceId: first.id,
      userId: firstUser.id,
    });
    const fileId = await createFileNode({
      workspaceId: first.id,
      userId: firstUser.id,
      parentId: rootId,
      rootId,
      size: 2,
    });

    const read = await app.inject({
      method: 'GET',
      url: '/client/v1/workspaces/' + second.id + '/actions/nodes/' + rootId,
      headers: buildAuthHeader(token),
    });
    expect(read.statusCode).toBe(404);

    const now = new Date().toISOString();
    const mutation = {
      id: generateId(IdType.Mutation),
      createdAt: now,
      type: 'node.delete' as const,
      data: {
        nodeId: rootId,
        rootId,
        deletedAt: now,
      },
    };
    const action = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + second.id + '/actions/mutations',
      headers: buildAuthHeader(token),
      payload: { mutation },
    });
    expect(action.statusCode).toBe(403);
    expect(action.json().code).toBe(ApiErrorCode.Forbidden);

    // Legacy sync must share the same cross-workspace guard.
    const sync = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + second.id + '/mutations',
      headers: buildAuthHeader(token),
      payload: { mutations: [mutation] },
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json().results[0].status).toBe(MutationStatus.FORBIDDEN);

    const upload = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + second.id + '/files/' + fileId + '/tus',
      headers: buildAuthHeader(token),
    });
    expect(upload.statusCode).toBe(404);

    const download = await app.inject({
      method: 'GET',
      url: '/client/v1/workspaces/' + second.id + '/files/' + fileId,
      headers: buildAuthHeader(token),
    });
    expect(download.statusCode).toBe(400);
    expect(download.json().code).toBe(ApiErrorCode.FileNotFound);

    const unchanged = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', rootId)
      .executeTakeFirst();
    expect(unchanged?.workspace_id).toBe(first.id);
  });

  it('executes native CRDT mutation with authenticated actor audit', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      account,
      workspaceId: workspace.id,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });
    const nodeId = generateId(IdType.Space);
    const mutation = buildCreateNodeMutation({
      nodeId,
      attributes: {
        type: 'space',
        name: 'Action API Test Space',
        visibility: 'private',
        collaborators: { [user.id]: 'admin' },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + workspace.id + '/actions/mutations',
      headers: buildAuthHeader(token),
      payload: { mutation },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'node.create',
      mutationId: mutation.id,
      status: MutationStatus.CREATED,
    });

    const node = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', nodeId)
      .executeTakeFirst();
    expect(node?.created_by).toBe(user.id);
    expect(node?.workspace_id).toBe(workspace.id);
  });

  it('prevents mutation actor impersonation in legacy sync', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      account,
      workspaceId: workspace.id,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });
    const rootId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });
    const now = new Date().toISOString();
    const mutation = {
      id: generateId(IdType.Mutation),
      createdAt: now,
      type: 'node.interaction.seen' as const,
      data: {
        nodeId: rootId,
        collaboratorId: generateId(IdType.User),
        seenAt: now,
      },
    };
    const response = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + workspace.id + '/mutations',
      headers: buildAuthHeader(token),
      payload: { mutations: [mutation] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0].status).toBe(MutationStatus.FORBIDDEN);
  });

  it('enforces an independent workspace-scoped action rate limit', async () => {
    const deviceId = generateId(IdType.Device);
    const workspaceId = generateId(IdType.Workspace);
    for (let i = 0; i < 40; i++) {
      expect(await isWorkspaceActionRateLimited(deviceId, workspaceId)).toBe(
        false
      );
    }
    expect(await isWorkspaceActionRateLimited(deviceId, workspaceId)).toBe(
      true
    );
    expect(
      await isWorkspaceActionRateLimited(deviceId, generateId(IdType.Workspace))
    ).toBe(false);
  });

  it('denies a guest attempting to create a workspace space', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      account,
      workspaceId: workspace.id,
      role: 'guest',
    });
    const { token } = await createDevice({ accountId: account.id });
    const nodeId = generateId(IdType.Space);
    const mutation = buildCreateNodeMutation({
      nodeId,
      attributes: {
        type: 'space',
        name: 'Forbidden Guest Space',
        visibility: 'private',
        collaborators: { [user.id]: 'admin' },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + workspace.id + '/actions/mutations',
      headers: buildAuthHeader(token),
      payload: { mutation },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe(ApiErrorCode.Forbidden);

    const node = await database
      .selectFrom('nodes')
      .select('id')
      .where('id', '=', nodeId)
      .executeTakeFirst();
    expect(node).toBeUndefined();
  });

  it('rejects unknown mutation actions instead of executing arbitrary commands', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    await createUser({
      account,
      workspaceId: workspace.id,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });
    const response = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + workspace.id + '/actions/mutations',
      headers: buildAuthHeader(token),
      payload: {
        mutation: {
          id: generateId(IdType.Mutation),
          type: 'sql.execute',
          data: { query: 'SELECT 1' },
        },
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns HTTP 429 after exhausting the HTTP action quota', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      account,
      workspaceId: workspace.id,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });
    const rootId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: user.id,
    });
    const url =
      '/client/v1/workspaces/' + workspace.id + '/actions/nodes/' + rootId;
    for (let i = 0; i < 40; i++) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: buildAuthHeader(token),
      });
      expect(response.statusCode).toBe(200);
    }
    const exceeded = await app.inject({
      method: 'GET',
      url,
      headers: buildAuthHeader(token),
    });
    expect(exceeded.statusCode).toBe(429);
    expect(exceeded.json().code).toBe(ApiErrorCode.TooManyRequests);
  });
});

describe('workspace invitation role policy', () => {
  it('allows only narrow grants and disallows ownership through invitations', () => {
    expect(canInviteWorkspaceRole('owner', 'admin')).toBe(true);
    expect(canInviteWorkspaceRole('admin', 'guest')).toBe(true);
    expect(canInviteWorkspaceRole('admin', 'admin')).toBe(false);
    expect(canInviteWorkspaceRole('owner', 'owner')).toBe(false);
    expect(canInviteWorkspaceRole('owner', 'none')).toBe(false);
    expect(canInviteWorkspaceRole('guest', 'collaborator')).toBe(false);
  });

  it('rejects an admin owner-invitation before account side effects', async () => {
    const owner = await createAccount();
    const admin = await createAccount();
    const workspace = await createWorkspace({ createdBy: owner.id });
    await createUser({
      workspaceId: workspace.id,
      account: owner,
      role: 'owner',
    });
    await createUser({
      workspaceId: workspace.id,
      account: admin,
      role: 'admin',
    });
    const { token } = await createDevice({ accountId: admin.id });
    const email =
      'p104-denied-owner-' + generateId(IdType.Account) + '@example.com';

    const response = await app.inject({
      method: 'POST',
      url: '/client/v1/workspaces/' + workspace.id + '/users',
      headers: buildAuthHeader(token),
      payload: { users: [{ email, role: 'owner' }] },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe(ApiErrorCode.UserInviteNoAccess);

    const account = await database
      .selectFrom('accounts')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst();
    expect(account).toBeUndefined();
  });
});
