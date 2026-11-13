import { McpConnectionStatus } from '@colanode/client/types/mcp';

export type McpConnectionOAuthStartMutationInput = {
  type: 'mcp.connection.oauth.start';
  userId: string;
  connectionId: string;
};

export type McpConnectionOAuthStartMutationOutput = {
  authorizationUrl: string | null;
  status: McpConnectionStatus;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mcp.connection.oauth.start': {
      input: McpConnectionOAuthStartMutationInput;
      output: McpConnectionOAuthStartMutationOutput;
    };
  }
}
