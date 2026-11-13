import { FastifyPluginCallback } from 'fastify';

import { accountAuthenticator } from '@colanode/server/api/client/plugins/account-auth';
import { workspaceAuthenticator } from '@colanode/server/api/client/plugins/workspace-auth';

import { actionsRoutes } from './actions';
import { agentAutomationRoutes } from './agent-automation';
import { agentRunRoutes } from './agent-runs';
import { agentRoutes } from './agents';
import { aiRoutes } from './ai';
import { fileRoutes } from './files';
import { mcpConnectionRoutes } from './mcp-connections';
import { mcpToolSecurityRoutes } from './mcp-tool-security';
import { mutationsRoutes } from './mutations';
import { userRoutes } from './users';
import { workspaceCreateRoute } from './workspace-create';
import { workspaceDeleteRoute } from './workspace-delete';
import { workspaceGetRoute } from './workspace-get';
import { workspaceUpdateRoute } from './workspace-update';

export const workspaceRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(accountAuthenticator);

  instance.register(workspaceCreateRoute);

  instance.register(
    (subInstance) => {
      subInstance.register(workspaceAuthenticator);

      subInstance.register(workspaceDeleteRoute);
      subInstance.register(workspaceGetRoute);
      subInstance.register(workspaceUpdateRoute);

      subInstance.register(actionsRoutes, { prefix: '/actions' });
      subInstance.register(aiRoutes, { prefix: '/ai' });
      subInstance.register(agentRoutes);
      subInstance.register(agentRunRoutes);
      subInstance.register(agentAutomationRoutes);
      subInstance.register(mcpConnectionRoutes);
      subInstance.register(mcpToolSecurityRoutes);
      subInstance.register(fileRoutes, { prefix: '/files' });
      subInstance.register(userRoutes, { prefix: '/users' });
      subInstance.register(mutationsRoutes, { prefix: '/mutations' });
    },
    {
      prefix: '/:workspaceId',
    }
  );

  done();
};
