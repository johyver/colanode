import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  ApiErrorCode,
  MutationStatus,
  WorkspaceStatus,
  apiErrorOutputSchema,
  mutationSchema,
} from '@colanode/core';
import { isWorkspaceActionRateLimited } from '@colanode/server/lib/rate-limits';
import {
  executeWorkspaceMutation,
  readWorkspaceNode,
} from '@colanode/server/lib/workspace-actions';

const readAuditSchema = z.object({
  requestId: z.string(),
  workspaceId: z.string(),
  actorId: z.string(),
  action: z.literal('node.read'),
  executedAt: z.string(),
  node: z.unknown(),
});

const mutationAuditSchema = z.object({
  requestId: z.string(),
  workspaceId: z.string(),
  actorId: z.string(),
  action: z.string(),
  mutationId: z.string(),
  executedAt: z.string(),
  status: z.enum(MutationStatus),
});

// Minimal typed business API for future agent/MCP clients. Authentication,
// workspace membership, and existing node-level ACLs are all enforced.
// Mutations use the same native CRDT-safe path as client synchronization.
export const actionsRoute: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'GET',
    url: '/nodes/:nodeId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        nodeId: z.string().min(1),
      }),
      response: {
        200: readAuditSchema,
        403: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
        429: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const { nodeId } = request.params;
      if (
        await isWorkspaceActionRateLimited(
          request.account.deviceId,
          request.workspace.id
        )
      ) {
        return reply.code(429).send({
          code: ApiErrorCode.TooManyRequests,
          message: 'Workspace action rate limit exceeded.',
        });
      }

      const result = await readWorkspaceNode(request.workspace, nodeId);
      const audit = {
        requestId: request.id,
        workspaceId: request.workspace.id,
        actorId: request.workspace.user.id,
        action: 'node.read' as const,
        executedAt: new Date().toISOString(),
      };
      request.log.info({ ...audit, status: result.status }, 'workspace action');

      if (result.status !== 200) {
        return reply.code(result.status).send({
          code: result.code,
          message: 'Node unavailable or permission denied.',
        });
      }

      return { ...audit, node: result.node };
    },
  });

  instance.route({
    method: 'POST',
    url: '/mutations',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: z.object({ mutation: mutationSchema }),
      response: {
        200: mutationAuditSchema,
        201: mutationAuditSchema,
        400: apiErrorOutputSchema,
        401: apiErrorOutputSchema,
        403: apiErrorOutputSchema,
        404: apiErrorOutputSchema,
        405: apiErrorOutputSchema,
        409: apiErrorOutputSchema,
        429: apiErrorOutputSchema,
        500: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      if (
        await isWorkspaceActionRateLimited(
          request.account.deviceId,
          request.workspace.id
        )
      ) {
        return reply.code(429).send({
          code: ApiErrorCode.TooManyRequests,
          message: 'Workspace action rate limit exceeded.',
        });
      }

      if (request.workspace.status === WorkspaceStatus.Readonly) {
        return reply.code(403).send({
          code: ApiErrorCode.WorkspaceReadonly,
          message: 'Readonly workspaces cannot be modified.',
        });
      }

      const mutation = request.body.mutation;
      const status = await executeWorkspaceMutation(
        request.workspace,
        mutation
      );
      const audit = {
        requestId: request.id,
        workspaceId: request.workspace.id,
        actorId: request.workspace.user.id,
        action: mutation.type,
        mutationId: mutation.id,
        executedAt: new Date().toISOString(),
        status,
      };
      request.log.info(audit, 'workspace action');

      if (status === MutationStatus.FORBIDDEN) {
        return reply.code(403).send({
          code: ApiErrorCode.Forbidden,
          message: 'Not authorized to apply this mutation.',
        });
      }

      if (status === MutationStatus.OK || status === MutationStatus.CREATED) {
        return reply.code(status).send(audit);
      }

      const code =
        status === MutationStatus.NOT_FOUND
          ? ApiErrorCode.NotFound
          : status === MutationStatus.UNAUTHORIZED
            ? ApiErrorCode.Unauthorized
            : status === MutationStatus.INTERNAL_SERVER_ERROR
              ? ApiErrorCode.Unknown
              : ApiErrorCode.BadRequest;

      return reply.code(status).send({
        code,
        message: 'Mutation was not applied.',
      });
    },
  });

  done();
};
