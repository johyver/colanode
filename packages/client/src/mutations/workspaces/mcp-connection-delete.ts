export type McpConnectionDeleteMutationInput = {
  type: 'mcp.connection.delete';
  userId: string;
  connectionId: string;
};

export type McpConnectionDeleteMutationOutput = { deleted: boolean };

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mcp.connection.delete': {
      input: McpConnectionDeleteMutationInput;
      output: McpConnectionDeleteMutationOutput;
    };
  }
}
