import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';

import {
  SyncMutationResult,
  MutationStatus,
  syncMutationsInputSchema,
  ApiErrorCode,
  WorkspaceStatus,
} from '@colanode/core';
import { executeWorkspaceMutation } from '@colanode/server/lib/workspace-actions';

export const mutationsSyncRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/',
    schema: {
      body: syncMutationsInputSchema,
    },
    handler: async (request, reply) => {
      const input = request.body;
      const workspace = request.workspace;

      if (workspace.status === WorkspaceStatus.Readonly) {
        return reply.code(403).send({
          code: ApiErrorCode.WorkspaceReadonly,
          message: 'Workspace is readonly and you cannot make any changes.',
        });
      }

      const results: SyncMutationResult[] = [];
      for (const mutation of input.mutations) {
        try {
          const status = await executeWorkspaceMutation(workspace, mutation);
          results.push({
            id: mutation.id,
            status: status,
          });
        } catch {
          results.push({
            id: mutation.id,
            status: MutationStatus.INTERNAL_SERVER_ERROR,
          });
        }
      }

      return { results };
    },
  });

  done();
};
