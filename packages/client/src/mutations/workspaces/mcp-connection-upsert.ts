import {
  McpConnection,
  McpConnectionAuthMode,
  McpConnectionKind,
} from '@colanode/client/types/mcp';

export type McpConnectionUpsertMutationInput = {
  type: 'mcp.connection.upsert';
  userId: string;
  id?: string;
  name: string;
  url: string;
  kind: McpConnectionKind;
  enabled?: boolean;
  authMode?: McpConnectionAuthMode;
  authToken?: string;
  oauthScope?: string;
};

export type McpConnectionUpsertMutationOutput = McpConnection;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mcp.connection.upsert': {
      input: McpConnectionUpsertMutationInput;
      output: McpConnection;
    };
  }
}
