export type McpToolPolicyDeleteMutationInput = {
  type: 'mcp.tool-policy.delete';
  userId: string;
  policyId: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mcp.tool-policy.delete': { input: McpToolPolicyDeleteMutationInput; output: { deleted: boolean } };
  }
}
