import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { agentAutomation } from '@colanode/server/lib/agents/agent-automation';

export const agentWebhookRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'POST',
    url: '/workspaces/:workspaceId/agent-triggers/:triggerId/webhook',
    schema: { params: z.object({ workspaceId: z.string(), triggerId: z.string() }), body: z.record(z.string(), z.unknown()) },
    handler: async (request, reply) => {
      const signature = request.headers['x-colanode-signature'];
      if (typeof signature !== 'string') return reply.code(401).send({ message: 'Missing webhook signature.' });
      try {
        const body = JSON.stringify(request.body);
        await agentAutomation.verifyWebhook(request.params.workspaceId, request.params.triggerId, body, signature);
        const eventId = request.headers['x-event-id']?.toString() || 'webhook:' + Date.now();
        return await agentAutomation.fireTrigger(request.params.workspaceId, request.params.triggerId, request.body, 'webhook', eventId);
      } catch (error) {
        return reply.code(401).send({ message: error instanceof Error ? error.message : 'Webhook rejected.' });
      }
    },
  });
  done();
};
