import { Migration } from 'kysely';

export const createMcpToolSecurityTables: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('mcp_tool_policies')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('connection_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('agent_id', 'varchar(256)', (col) => col.notNull().defaultTo('__workspace__'))
      .addColumn('tool_name', 'varchar(256)', (col) => col.notNull())
      .addColumn('allowed', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('require_approval', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addUniqueConstraint('mcp_tool_policies_scope_tool_key', [
        'workspace_id',
        'connection_id',
        'agent_id',
        'tool_name',
      ])
      .execute();

    await db.schema
      .createIndex('mcp_tool_policies_workspace_connection_idx')
      .on('mcp_tool_policies')
      .columns(['workspace_id', 'connection_id', 'agent_id'])
      .execute();

    await db.schema
      .createTable('mcp_execution_audits')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('connection_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('agent_id', 'varchar(256)', (col) => col.notNull().defaultTo('__workspace__'))
      .addColumn('tool_name', 'varchar(256)', (col) => col.notNull())
      .addColumn('correlation_id', 'varchar(64)', (col) => col.notNull().unique())
      .addColumn('status', 'varchar(32)', (col) => col.notNull())
      .addColumn('require_approval', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('input', 'jsonb')
      .addColumn('result', 'jsonb')
      .addColumn('error', 'text')
      .addColumn('approved_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('mcp_execution_audits_workspace_created_idx')
      .on('mcp_execution_audits')
      .columns(['workspace_id', 'created_at'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('mcp_execution_audits_workspace_created_idx').execute();
    await db.schema.dropTable('mcp_execution_audits').execute();
    await db.schema.dropIndex('mcp_tool_policies_workspace_connection_idx').execute();
    await db.schema.dropTable('mcp_tool_policies').execute();
  },
};
