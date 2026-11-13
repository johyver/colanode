import { McpExecutionAudit } from '@colanode/client/types/mcp';

export type McpExecutionAuditQueryInput = {
  type: 'mcp.execution-audit.get';
  userId: string;
  connectionId: string;
};

export type McpExecutionAuditQueryOutput = { audits: McpExecutionAudit[] };

declare module '@colanode/client/queries' {
  interface QueryMap {
    'mcp.execution-audit.get': {
      input: McpExecutionAuditQueryInput;
      output: McpExecutionAuditQueryOutput;
    };
  }
}
