import { McpToolPolicy } from '@colanode/client/types/mcp';

export type McpToolPolicyUpsertMutationInput = {
  type: 'mcp.tool-policy.upsert';
  userId: string;
  connectionId: string;
  agentId?: string;
  toolName: string;
  allowed: boolean;
  requireApproval: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mcp.tool-policy.upsert': { input: McpToolPolicyUpsertMutationInput; output: McpToolPolicy };
  }
}
