import { McpConnections } from '@colanode/client/types/mcp';

export type McpConnectionsQueryInput = {
  type: 'mcp.connections.get';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'mcp.connections.get': {
      input: McpConnectionsQueryInput;
      output: McpConnections;
    };
  }
}
