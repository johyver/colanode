import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  IdType,
  MutationStatus,
  WorkspaceStatus,
  generateId,
} from '@colanode/core';
import { accountAuthenticator } from '@colanode/server/api/client/plugins/account-auth';
import { workspaceAuthenticator } from '@colanode/server/api/client/plugins/workspace-auth';
import { database } from '@colanode/server/data/database';
import { isWorkspaceActionRateLimited } from '@colanode/server/lib/rate-limits';
import {
  executeWorkspaceMutation,
  readWorkspaceNode,
} from '@colanode/server/lib/workspace-actions';
import {
  AccountContext,
  WorkspaceContext,
} from '@colanode/server/types/api';

const MCP_SERVER_NAME = 'colanode-local';
const MCP_SERVER_VERSION = '1.0.0';

const jsonText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
});

const toolError = (message: string): never => {
  throw new Error(message);
};

const ensureAllowed = async (workspace: WorkspaceContext, nodeId: string) => {
  const result = await readWorkspaceNode(workspace, nodeId);
  if (result.status === 200) {
    return result.node;
  }

  toolError(
    result.code === ApiErrorCode.Forbidden
      ? 'The authenticated user is not allowed to access this node.'
      : 'The requested node does not exist in this workspace.'
  );
};

const ensureMutationAllowed = async (
  workspace: WorkspaceContext,
  deviceId: string
) => {
  if (await isWorkspaceActionRateLimited(deviceId, workspace.id)) {
    toolError('Workspace action rate limit exceeded.');
  }

  if (workspace.status !== WorkspaceStatus.Active) {
    toolError('Readonly workspaces cannot be modified.');
  }
};

const recordAudit = (
  request: { id: string; log: { info: (value: unknown, message: string) => void } },
  workspace: WorkspaceContext,
  action: string,
  nodeId: string
) => {
  request.log.info(
    {
      requestId: request.id,
      workspaceId: workspace.id,
      actorId: workspace.user.id,
      action,
      nodeId,
      executedAt: new Date().toISOString(),
    },
    'mcp workspace action'
  );
};

const createMcpServer = (
  request: {
    id: string;
    account: AccountContext;
    log: { info: (value: unknown, message: string) => void };
  },
  workspace: WorkspaceContext
) => {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    'colanode_get_node',
    {
      title: 'Read a page or database',
      description:
        'Read one page, database, or other node that the authenticated workspace member can view.',
      inputSchema: {
        nodeId: z.string().min(1).describe('The Colanode node ID to read.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ nodeId }) => {
      const node = await ensureAllowed(workspace, nodeId);
      recordAudit(request, workspace, 'node.read', nodeId);
      return jsonText({
        requestId: request.id,
        workspaceId: workspace.id,
        node,
      });
    }
  );

  server.registerTool(
    'colanode_list_children',
    {
      title: 'List pages and databases',
      description:
        'List the directly nested pages and databases visible below an allowed node.',
      inputSchema: {
        parentNodeId: z
          .string()
          .min(1)
          .describe('The allowed parent node ID.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ parentNodeId }) => {
      await ensureAllowed(workspace, parentNodeId);
      const children = await database
        .selectFrom('nodes')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('parent_id', '=', parentNodeId)
        .orderBy('created_at', 'asc')
        .execute();

      const visibleChildren = [];
      for (const child of children) {
        const result = await readWorkspaceNode(workspace, child.id);
        if (result.status === 200) {
          visibleChildren.push(result.node);
        }
      }

      recordAudit(request, workspace, 'node.list_children', parentNodeId);
      return jsonText({
        requestId: request.id,
        workspaceId: workspace.id,
        parentNodeId,
        nodes: visibleChildren,
      });
    }
  );

  server.registerTool(
    'colanode_mark_node_seen',
    {
      title: 'Mark a page as seen',
      description:
        'Record the authenticated member viewing a page or database. This is the only write exposed by this safe MCP surface; deletion and admin operations are not available.',
      inputSchema: {
        nodeId: z.string().min(1).describe('The node to mark as seen.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ nodeId }) => {
      await ensureMutationAllowed(workspace, request.account.deviceId);
      await ensureAllowed(workspace, nodeId);

      const now = new Date().toISOString();
      const status = await executeWorkspaceMutation(workspace, {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'node.interaction.seen',
        data: {
          nodeId,
          collaboratorId: workspace.user.id,
          seenAt: now,
        },
      });

      if (status !== MutationStatus.OK) {
        toolError(`The approved write was not applied (status ${status}).`);
      }

      recordAudit(request, workspace, 'node.interaction.seen', nodeId);
      return jsonText({
        requestId: request.id,
        workspaceId: workspace.id,
        nodeId,
        status,
      });
    }
  );

  return server;
};

const handleMcpRequest = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const server = createMcpServer(request, request.workspace);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  reply.hijack();
  await transport.handleRequest(request.raw, reply.raw, request.body);
};

export const mcpRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(accountAuthenticator);
  instance.register(
    (subInstance, _options, subDone) => {
      subInstance.register(workspaceAuthenticator);
      subInstance.route({
        method: ['POST', 'GET', 'DELETE'],
        url: '/:workspaceId',
        handler: handleMcpRequest,
      });
      subDone();
    },
    { prefix: '' }
  );

  done();
};
