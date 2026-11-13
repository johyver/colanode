import { FastifyPluginCallback } from 'fastify';

import { accountRoutes } from '@colanode/server/api/client/routes/accounts';
import { agentWebhookRoutes } from '@colanode/server/api/client/routes/agent-webhook';
import { authRoutes } from '@colanode/server/api/client/routes/auth';
import { avatarRoutes } from '@colanode/server/api/client/routes/avatars';
import { mcpRoutes } from '@colanode/server/api/client/routes/mcp';
import { socketRoutes } from '@colanode/server/api/client/routes/sockets';
import { workspaceRoutes } from '@colanode/server/api/client/routes/workspaces';
import { mcpOAuthCallbackRoute } from '@colanode/server/api/client/routes/workspaces/mcp-connections';

export const clientRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(socketRoutes, { prefix: '/sockets' });
  instance.register(accountRoutes, { prefix: '/accounts' });
  instance.register(agentWebhookRoutes);
  instance.register(authRoutes, { prefix: '/auth' });
  instance.register(avatarRoutes, { prefix: '/avatars' });
  instance.register(mcpRoutes, { prefix: '/mcp' });
  instance.register(mcpOAuthCallbackRoute, { prefix: '/mcp' });
  instance.register(workspaceRoutes, { prefix: '/workspaces' });

  done();
};
