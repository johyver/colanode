import { McpToolPolicy } from '@colanode/client/types/mcp';

export type McpToolPoliciesQueryInput = {
  type: 'mcp.tool-policies.get';
  userId: string;
  connectionId: string;
};

export type McpToolPoliciesQueryOutput = { policies: McpToolPolicy[] };

declare module '@colanode/client/queries' {
  interface QueryMap {
    'mcp.tool-policies.get': {
      input: McpToolPoliciesQueryInput;
      output: McpToolPoliciesQueryOutput;
    };
  }
}
