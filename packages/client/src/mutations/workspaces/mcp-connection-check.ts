import { McpConnection } from '@colanode/client/types/mcp';

export type McpConnectionCheckMutationInput = {
  type: 'mcp.connection.check';
  userId: string;
  connectionId: string;
};

export type McpConnectionCheckMutationOutput = McpConnection;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mcp.connection.check': {
      input: McpConnectionCheckMutationInput;
      output: McpConnection;
    };
  }
}
