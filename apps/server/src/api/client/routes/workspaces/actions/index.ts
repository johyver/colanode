import { FastifyPluginCallback } from 'fastify';

import { actionsRoute } from './workspace-actions';

export const actionsRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(actionsRoute);
  done();
};
