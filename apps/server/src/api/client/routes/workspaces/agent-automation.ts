import { FastifyReply } from 'fastify';
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode, apiErrorOutputSchema } from '@colanode/core';
import { agentAutomation } from '@colanode/server/lib/agents/agent-automation';

const errorResponse = { 400: apiErrorOutputSchema, 404: apiErrorOutputSchema };
const sendError = (reply: FastifyReply, error: unknown) =>
  reply.code(error instanceof Error && error.message.includes('not found') ? 404 : 400).send({
    code: error instanceof Error && error.message.includes('not found') ? ApiErrorCode.NotFound : ApiErrorCode.BadRequest,
    message: error instanceof Error ? error.message : 'Automation request failed.',
  });
const triggerConfig = z.object({
  intervalSeconds: z.number().int().min(60).max(31536000).optional(),
  events: z.array(z.string().min(1).max(128)).max(32).optional(),
  taskTemplate: z.string().max(20000).optional(),
  dryRun: z.boolean().default(true),
});
const triggerKind = z.enum(['manual', 'schedule', 'database', 'webhook']);

export const agentAutomationRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({ method: 'GET', url: '/agent-triggers', schema: { params: z.object({ workspaceId: z.string() }) }, handler: async (request) => ({ triggers: await agentAutomation.listTriggers(request.params.workspaceId) }) });
  instance.route({
    method: 'POST', url: '/agent-triggers',
    schema: { params: z.object({ workspaceId: z.string() }), body: z.object({ agentId: z.string(), name: z.string().trim().min(1).max(256), kind: triggerKind, config: triggerConfig, enabled: z.boolean().optional(), webhookSecret: z.string().min(16).max(256).optional() }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.createTrigger({ ...request.body, workspaceId: request.params.workspaceId }); } catch (error) { return sendError(reply, error); } },
  });
  instance.route({
    method: 'PATCH', url: '/agent-triggers/:triggerId',
    schema: { params: z.object({ workspaceId: z.string(), triggerId: z.string() }), body: z.object({ name: z.string().trim().min(1).max(256).optional(), enabled: z.boolean().optional(), config: triggerConfig.optional() }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.updateTrigger(request.params.workspaceId, request.params.triggerId, request.body); } catch (error) { return sendError(reply, error); } },
  });
  instance.route({ method: 'DELETE', url: '/agent-triggers/:triggerId', schema: { params: z.object({ workspaceId: z.string(), triggerId: z.string() }), response: { 200: z.object({ deleted: z.boolean() }), ...errorResponse } }, handler: async (request, reply) => { try { return { deleted: await agentAutomation.removeTrigger(request.params.workspaceId, request.params.triggerId) }; } catch (error) { return sendError(reply, error); } } });
  instance.route({
    method: 'POST', url: '/agent-triggers/:triggerId/fire',
    schema: { params: z.object({ workspaceId: z.string(), triggerId: z.string() }), body: z.object({ eventKey: z.string().min(1).max(512).optional(), payload: z.record(z.string(), z.unknown()).default({}) }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.fireTrigger(request.params.workspaceId, request.params.triggerId, request.body.payload, 'manual', request.body.eventKey || 'manual:' + Date.now()); } catch (error) { return sendError(reply, error); } },
  });
  instance.route({ method: 'GET', url: '/agent-delegations', schema: { params: z.object({ workspaceId: z.string() }) }, handler: async (request) => ({ delegations: await agentAutomation.listDelegations(request.params.workspaceId) }) });
  instance.route({ method: 'GET', url: '/agent-approvals', schema: { params: z.object({ workspaceId: z.string() }) }, handler: async (request) => ({ approvals: await agentAutomation.listApprovals(request.params.workspaceId) }) });
  instance.route({
    method: 'POST', url: '/agent-delegations',
    schema: { params: z.object({ workspaceId: z.string() }), body: z.object({ parentRunId: z.string().optional(), parentAgentId: z.string(), childAgentId: z.string(), context: z.record(z.string(), z.unknown()).default({}), requestedPermissions: z.array(z.string()).default([]), requiresApproval: z.boolean().default(true) }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.proposeDelegation({ ...request.body, workspaceId: request.params.workspaceId, accountId: request.account.id }); } catch (error) { return sendError(reply, error); } },
  });
  instance.route({
    method: 'POST', url: '/agent-delegations/:delegationId/decision',
    schema: { params: z.object({ workspaceId: z.string(), delegationId: z.string() }), body: z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(2000).optional() }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.decideDelegation(request.params.workspaceId, request.account.id, request.params.delegationId, request.body.decision, request.body.note); } catch (error) { return sendError(reply, error); } },
  });
  instance.route({ method: 'GET', url: '/agent-blog-pilots', schema: { params: z.object({ workspaceId: z.string() }) }, handler: async (request) => ({ pilots: await agentAutomation.listPilots(request.params.workspaceId) }) });
  instance.route({
    method: 'POST', url: '/agent-blog-pilots',
    schema: { params: z.object({ workspaceId: z.string() }), body: z.object({ title: z.string().trim().min(1).max(512), content: z.record(z.string(), z.unknown()).optional() }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.createPilot({ ...request.body, workspaceId: request.params.workspaceId, accountId: request.account.id }); } catch (error) { return sendError(reply, error); } },
  });
  instance.route({
    method: 'POST', url: '/agent-blog-pilots/:pilotId/run',
    schema: { params: z.object({ workspaceId: z.string(), pilotId: z.string() }), body: z.object({ agentIds: z.record(z.string(), z.string()) }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.runPilot(request.params.workspaceId, request.account.id, request.params.pilotId, request.body.agentIds as never); } catch (error) { return sendError(reply, error); } },
  });
  instance.route({
    method: 'POST', url: '/agent-blog-pilots/:pilotId/review',
    schema: { params: z.object({ workspaceId: z.string(), pilotId: z.string() }), body: z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(2000).optional() }), response: { 200: z.any(), ...errorResponse } },
    handler: async (request, reply) => { try { return await agentAutomation.decidePilotReview(request.params.workspaceId, request.params.pilotId, request.body.decision, request.body.note); } catch (error) { return sendError(reply, error); } },
  });
  done();
};
