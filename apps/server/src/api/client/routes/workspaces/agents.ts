import { FastifyReply } from 'fastify';
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode, apiErrorOutputSchema, generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectAgent } from '@colanode/server/data/schema';

const lifecycleSchema = z.enum(['draft', 'active', 'paused', 'archived']);
const modelSchema = z.object({
  provider: z.enum(['openai', 'google', 'ollama', 'lmstudio']),
  model: z.string().trim().min(1).max(256),
  temperature: z.number().min(0).max(2).default(0.5),
  maxOutputTokens: z.number().int().positive().max(200000).nullable().default(null),
});
const budgetSchema = z.object({
  monthlySpendUsd: z.number().min(0).max(1000000).nullable().default(null),
  monthlyTokens: z.number().int().min(0).max(1000000000).nullable().default(null),
});
const agentInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(256),
  description: z.string().max(2000).default(''),
  instructions: z.string().trim().min(1).max(50000),
  model: modelSchema,
  mcpToolAllowlist: z.array(z.string().trim().min(1).max(256)).max(256).default([]),
  permissions: z.array(z.string().trim().min(1).max(128)).max(128).default([]),
  triggers: z.array(z.string().trim().min(1).max(256)).max(64).default([]),
  budget: budgetSchema.default({ monthlySpendUsd: null, monthlyTokens: null }),
  lifecycle: lifecycleSchema.default('draft'),
});

const agentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  ownerAccountId: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  model: modelSchema,
  mcpToolAllowlist: z.array(z.string()),
  permissions: z.array(z.string()),
  triggers: z.array(z.string()),
  budget: budgetSchema,
  version: z.number().int().positive(),
  lifecycle: lifecycleSchema,
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

const errorResponse = {
  400: apiErrorOutputSchema,
  403: apiErrorOutputSchema,
  404: apiErrorOutputSchema,
  409: apiErrorOutputSchema,
};

const hasPlaintextSecret = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return /(?:sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|(?:api[_-]?key|secret|password|bearer)\s*[:=]\s*\S+)/i.test(value);
  }
  if (Array.isArray(value)) return value.some(hasPlaintextSecret);
  if (value && typeof value === 'object') return Object.values(value).some(hasPlaintextSecret);
  return false;
};

const isAdministrator = (request: { workspace: { user: { role: string } } }, reply: FastifyReply) => {
  if (request.workspace.user.role !== 'owner' && request.workspace.user.role !== 'admin') {
    reply.code(403).send({
      code: ApiErrorCode.Forbidden,
      message: 'Only workspace owners and admins can manage custom agents.',
    });
    return false;
  }
  return true;
};

const toAgentOutput = (agent: SelectAgent) => ({
  id: agent.id,
  workspaceId: agent.workspace_id,
  ownerAccountId: agent.owner_account_id,
  name: agent.name,
  description: agent.description,
  instructions: agent.instructions,
  model: agent.model,
  mcpToolAllowlist: agent.mcp_tool_allowlist,
  permissions: agent.permissions,
  triggers: agent.triggers,
  budget: agent.budget,
  version: agent.version,
  lifecycle: agent.lifecycle,
  createdAt: agent.created_at.toISOString(),
  updatedAt: agent.updated_at?.toISOString() ?? null,
});

const sendError = (reply: FastifyReply, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Agent request failed.';
  return reply.code(message.includes('already exists') ? 409 : 400).send({
    code: ApiErrorCode.BadRequest,
    message,
  });
};

export const agentRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'GET',
    url: '/agents',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: z.object({ agents: z.array(agentSchema) }) },
    },
    handler: async (request) => {
      const agents = await database
        .selectFrom('agents')
        .selectAll()
        .where('workspace_id', '=', request.params.workspaceId)
        .orderBy('updated_at', 'desc')
        .orderBy('created_at', 'desc')
        .execute();
      return { agents: agents.map(toAgentOutput) };
    },
  });

  instance.route({
    method: 'POST',
    url: '/agents',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: agentInputSchema,
      response: { 200: agentSchema, ...errorResponse },
    },
    handler: async (request, reply) => {
      if (!isAdministrator(request, reply)) return;
      if (hasPlaintextSecret(request.body)) {
        return reply.code(400).send({
          code: ApiErrorCode.BadRequest,
          message: 'Agent configuration cannot contain plaintext API keys or secrets. Use the credential vault instead.',
        });
      }
      try {
        const now = new Date();
        if (request.body.id) {
          const existing = await database
            .selectFrom('agents')
            .selectAll()
            .where('id', '=', request.body.id)
            .where('workspace_id', '=', request.params.workspaceId)
            .executeTakeFirst();
          if (!existing) {
            return reply.code(404).send({ code: ApiErrorCode.NotFound, message: 'Agent not found.' });
          }
          await database
            .updateTable('agents')
            .set({
              name: request.body.name,
              description: request.body.description,
              instructions: request.body.instructions,
              model: JSON.stringify(request.body.model),
              mcp_tool_allowlist: JSON.stringify(request.body.mcpToolAllowlist),
              permissions: JSON.stringify(request.body.permissions),
              triggers: JSON.stringify(request.body.triggers),
              budget: JSON.stringify(request.body.budget),
              lifecycle: request.body.lifecycle,
              version: existing.version + 1,
              updated_at: now,
              updated_by: request.account.id,
            })
            .where('id', '=', request.body.id)
            .executeTakeFirstOrThrow();
          const saved = await database.selectFrom('agents').selectAll().where('id', '=', request.body.id).executeTakeFirstOrThrow();
          return toAgentOutput(saved);
        }

        const created = await database
          .insertInto('agents')
          .values({
            id: generateId(IdType.Agent),
            workspace_id: request.params.workspaceId,
            owner_account_id: request.account.id,
            name: request.body.name,
            description: request.body.description,
            instructions: request.body.instructions,
            model: JSON.stringify(request.body.model),
            mcp_tool_allowlist: JSON.stringify(request.body.mcpToolAllowlist),
            permissions: JSON.stringify(request.body.permissions),
            triggers: JSON.stringify(request.body.triggers),
            budget: JSON.stringify(request.body.budget),
            version: 1,
            lifecycle: request.body.lifecycle,
            created_at: now,
            updated_at: now,
            updated_by: request.account.id,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return toAgentOutput(created);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  });

  instance.route({
    method: 'DELETE',
    url: '/agents/:agentId',
    schema: {
      params: z.object({ workspaceId: z.string(), agentId: z.string() }),
      response: { 200: z.object({ deleted: z.boolean() }), ...errorResponse },
    },
    handler: async (request, reply) => {
      if (!isAdministrator(request, reply)) return;
      const result = await database
        .deleteFrom('agents')
        .where('id', '=', request.params.agentId)
        .where('workspace_id', '=', request.params.workspaceId)
        .executeTakeFirst();
      return { deleted: result.numDeletedRows > 0n };
    },
  });

  done();
};
