import { McpExecutionAudit } from '@colanode/client/types/mcp';

export type McpExecutionApproveMutationInput = {
  type: 'mcp.execution.approve';
  userId: string;
  auditId: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'mcp.execution.approve': { input: McpExecutionApproveMutationInput; output: McpExecutionAudit };
  }
}
