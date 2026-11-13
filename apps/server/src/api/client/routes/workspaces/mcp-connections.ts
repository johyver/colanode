import { FastifyReply } from 'fastify';
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode, apiErrorOutputSchema } from '@colanode/core';

import { McpConnectionManager } from '../../../../lib/mcp/connection-manager';

const manager = new McpConnectionManager();

const capabilitySchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
});

const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  kind: z.enum(['remote', 'local']),
  enabled: z.boolean(),
  authMode: z.enum(['none', 'token', 'oauth']),
  status: z.enum(['unknown', 'connected', 'error', 'disabled', 'reauthorization_required']),
  lastError: z.string().nullable(),
  capabilities: z.object({
    tools: z.array(capabilitySchema),
    resources: z.array(capabilitySchema),
    prompts: z.array(capabilitySchema),
  }),
  lastCheckedAt: z.string().nullable(),
  hasAuthToken: z.boolean(),
  hasOAuthCredentials: z.boolean(),
  reauthorizationRequired: z.boolean(),
  authorizationUrl: z.string().nullable(),
  retryCount: z.number(),
  circuitState: z.enum(['closed', 'open', 'half_open']),
  nextRetryAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

const connectionInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(256),
  url: z.string().trim().min(1).max(2048),
  kind: z.enum(['remote', 'local']),
  enabled: z.boolean().default(true),
  authMode: z.enum(['none', 'token', 'oauth']).optional(),
  authToken: z.string().max(4096).optional(),
  oauthScope: z.string().max(2048).optional(),
});

const errorResponse = {
  400: apiErrorOutputSchema,
  404: apiErrorOutputSchema,
  503: apiErrorOutputSchema,
};

const sendManagerError = (reply: FastifyReply, error: unknown) =>
  reply.code(400).send({
    code: ApiErrorCode.BadRequest,
    message: error instanceof Error ? error.message : 'MCP connection request failed.',
  });

export const mcpConnectionRoutes: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/mcp-connections',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: z.object({ connections: z.array(connectionSchema) }) },
    },
    handler: async (request) => ({
      connections: await manager.list(request.account.id, request.params.workspaceId),
    }),
  });

  instance.route({
    method: 'POST',
    url: '/mcp-connections/:connectionId/oauth/start',
    schema: {
      params: z.object({ workspaceId: z.string(), connectionId: z.string() }),
      response: {
        200: z.object({
          authorizationUrl: z.string().nullable(),
          status: z.enum(['unknown', 'connected', 'error', 'disabled', 'reauthorization_required']),
        }),
        ...errorResponse,
      },
    },
    handler: async (request, reply) => {
      try {
        return await manager.startOAuth(
          request.account.id,
          request.params.workspaceId,
          request.params.connectionId
        );
      } catch (error) {
        return sendManagerError(reply, error);
      }
    },
  });

  instance.route({
    method: 'POST',
    url: '/mcp-connections',
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: connectionInputSchema,
      response: { 200: connectionSchema, ...errorResponse },
    },
    handler: async (request, reply) => {
      try {
        const connection = await manager.upsert({
          ...request.body,
          accountId: request.account.id,
          workspaceId: request.params.workspaceId,
        });
        return await manager.check(
          request.account.id,
          request.params.workspaceId,
          connection.id
        );
      } catch (error) {
        return sendManagerError(reply, error);
      }
    },
  });

  instance.route({
    method: 'POST',
    url: '/mcp-connections/:connectionId/check',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        connectionId: z.string(),
      }),
      response: { 200: connectionSchema, ...errorResponse },
    },
    handler: async (request, reply) => {
      try {
        return await manager.check(
          request.account.id,
          request.params.workspaceId,
          request.params.connectionId
        );
      } catch (error) {
        return sendManagerError(reply, error);
      }
    },
  });

  instance.route({
    method: 'DELETE',
    url: '/mcp-connections/:connectionId',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        connectionId: z.string(),
      }),
      response: { 200: z.object({ deleted: z.boolean() }), ...errorResponse },
    },
    handler: async (request) => ({
      deleted: await manager.remove(
        request.account.id,
        request.params.workspaceId,
        request.params.connectionId
      ),
    }),
  });

  done();
};

/**
 * OAuth redirects do not carry the Colanode device token. The callback is
 * protected by the one-time state value saved for the connection and never
 * returns tokens or client secrets to the browser.
 */
export const mcpOAuthCallbackRoute: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'GET',
    url: '/oauth/callback/:connectionId',
    schema: {
      params: z.object({ connectionId: z.string() }),
      querystring: z.object({
        code: z.string().optional(),
        state: z.string(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      }),
    },
    handler: async (request, reply) => {
      if (request.query.error) {
        return reply
          .type('text/html')
          .send('<h1>Colanode authorization was not completed</h1><p>You can close this window and try again.</p>');
      }
      if (!request.query.code) {
        return reply.code(400).type('text/html').send('<h1>Missing authorization code</h1>');
      }
      try {
        await manager.completeOAuth(
          request.params.connectionId,
          request.query.code,
          request.query.state
        );
        return reply
          .type('text/html')
          .send('<h1>Colanode authorization complete</h1><p>You can close this window and return to Colanode.</p>');
      } catch (error) {
        return reply
          .code(400)
          .type('text/html')
          .send(`<h1>Colanode authorization failed</h1><p>${error instanceof Error ? error.message : 'Please try again.'}</p>`);
      }
    },
  });
  done();
};
