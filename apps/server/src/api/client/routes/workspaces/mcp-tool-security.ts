import { FastifyReply } from 'fastify';
import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode, apiErrorOutputSchema } from '@colanode/core';

import {
  McpToolApprovalRequiredError,
  McpToolPermissionDeniedError,
  McpToolSecurityManager,
} from '../../../../lib/mcp/tool-security';

const securityManager = new McpToolSecurityManager();

const policySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  workspaceId: z.string(),
  connectionId: z.string(),
  agentId: z.string(),
  toolName: z.string(),
  allowed: z.boolean(),
  requireApproval: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

const auditSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  workspaceId: z.string(),
  connectionId: z.string(),
  agentId: z.string(),
  toolName: z.string(),
  correlationId: z.string(),
  status: z.enum([
    'approval_required',
    'approved',
    'denied',
    'running',
    'succeeded',
    'failed',
  ]),
  requireApproval: z.boolean(),
  input: z.record(z.string(), z.unknown()).nullable(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

const toPolicyOutput = (policy: Awaited<ReturnType<McpToolSecurityManager['listPolicies']>>[number]) => ({
  ...policy,
  createdAt: policy.createdAt.toISOString(),
  updatedAt: policy.updatedAt?.toISOString() ?? null,
});

const toAuditOutput = (audit: Awaited<ReturnType<McpToolSecurityManager['listAudits']>>[number]) => ({
  ...audit,
  createdAt: audit.createdAt.toISOString(),
  updatedAt: audit.updatedAt?.toISOString() ?? null,
  approvedAt: audit.approvedAt?.toISOString() ?? null,
});

const errorResponse = {
  400: apiErrorOutputSchema,
  403: apiErrorOutputSchema,
  404: apiErrorOutputSchema,
  409: apiErrorOutputSchema,
};

const sendError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof McpToolPermissionDeniedError) {
    return reply.code(403).send({
      code: ApiErrorCode.Forbidden,
      message: `${error.message} Audit ${error.auditId}; correlation ${error.correlationId}.`,
    });
  }
  if (error instanceof McpToolApprovalRequiredError) {
    return reply.code(409).send({
      code: ApiErrorCode.BadRequest,
      message: `${error.message} Approval ID ${error.auditId}; correlation ${error.correlationId}.`,
    });
  }
  return reply.code(400).send({
    code: ApiErrorCode.BadRequest,
    message: error instanceof Error ? error.message : 'MCP tool security request failed.',
  });
};

const ensurePolicyAdministrator = (request: { workspace: { user: { role: string } } }, reply: FastifyReply) => {
  if (request.workspace.user.role !== 'owner' && request.workspace.user.role !== 'admin') {
    reply.code(403).send({
      code: ApiErrorCode.Forbidden,
      message: 'Only workspace owners and admins can change MCP tool permissions or approve executions.',
    });
    return false;
  }
  return true;
};

export const mcpToolSecurityRoutes: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'GET',
    url: '/mcp-connections/:connectionId/tool-policies',
    schema: {
      params: z.object({ workspaceId: z.string(), connectionId: z.string() }),
      response: { 200: z.object({ policies: z.array(policySchema) }), ...errorResponse },
    },
    handler: async (request, reply) => {
      try {
        const policies = await securityManager.listPolicies(
          request.account.id,
          request.params.workspaceId,
          request.params.connectionId
        );
        return { policies: policies.map(toPolicyOutput) };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  });

  instance.route({
    method: 'POST',
    url: '/mcp-connections/:connectionId/tool-policies',
    schema: {
      params: z.object({ workspaceId: z.string(), connectionId: z.string() }),
      body: z.object({
        agentId: z.string().trim().min(1).optional(),
        toolName: z.string().trim().min(1).max(256),
        allowed: z.boolean(),
        requireApproval: z.boolean().default(true),
      }),
      response: { 200: policySchema, ...errorResponse },
    },
    handler: async (request, reply) => {
      if (!ensurePolicyAdministrator(request, reply)) return;
      try {
        const policy = await securityManager.upsertPolicy({
          ...request.body,
          accountId: request.account.id,
          workspaceId: request.params.workspaceId,
          connectionId: request.params.connectionId,
        });
        return toPolicyOutput(policy);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  });

  instance.route({
    method: 'DELETE',
    url: '/mcp-tool-policies/:policyId',
    schema: {
      params: z.object({ workspaceId: z.string(), policyId: z.string() }),
      response: { 200: z.object({ deleted: z.boolean() }), ...errorResponse },
    },
    handler: async (request, reply) => {
      if (!ensurePolicyAdministrator(request, reply)) return;
      try {
        return {
          deleted: await securityManager.removePolicy(
            request.account.id,
            request.params.workspaceId,
            request.params.policyId
          ),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  });

  instance.route({
    method: 'GET',
    url: '/mcp-connections/:connectionId/execution-audit',
    schema: {
      params: z.object({ workspaceId: z.string(), connectionId: z.string() }),
      response: { 200: z.object({ audits: z.array(auditSchema) }), ...errorResponse },
    },
    handler: async (request, reply) => {
      try {
        const audits = await securityManager.listAudits(
          request.account.id,
          request.params.workspaceId,
          request.params.connectionId
        );
        return { audits: audits.map(toAuditOutput) };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  });

  instance.route({
    method: 'POST',
    url: '/mcp-execution-audit/:auditId/approve',
    schema: {
      params: z.object({ workspaceId: z.string(), auditId: z.string() }),
      response: { 200: auditSchema, ...errorResponse },
    },
    handler: async (request, reply) => {
      if (!ensurePolicyAdministrator(request, reply)) return;
      try {
        return toAuditOutput(
          await securityManager.approveAudit(
            request.account.id,
            request.params.workspaceId,
            request.params.auditId
          )
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  });

  instance.route({
    method: 'POST',
    url: '/mcp-connections/:connectionId/tools/:toolName/call',
    schema: {
      params: z.object({
        workspaceId: z.string(),
        connectionId: z.string(),
        toolName: z.string().min(1),
      }),
      body: z.object({
        agentId: z.string().trim().min(1).optional(),
        arguments: z.record(z.string(), z.unknown()).default({}),
        approvalId: z.string().optional(),
      }),
      response: {
        200: z.object({
          status: z.enum(['approval_required', 'succeeded']),
          auditId: z.string(),
          correlationId: z.string(),
          result: z.unknown().optional(),
        }),
        ...errorResponse,
      },
    },
    handler: async (request, reply) => {
      try {
        return await securityManager.callTool({
          ...request.body,
          accountId: request.account.id,
          workspaceId: request.params.workspaceId,
          connectionId: request.params.connectionId,
          toolName: request.params.toolName,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  });

  done();
};
