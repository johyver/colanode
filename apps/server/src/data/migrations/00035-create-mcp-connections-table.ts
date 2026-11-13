import { Migration } from 'kysely';

export const createMcpConnectionsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('mcp_connections')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('name', 'varchar(256)', (col) => col.notNull())
      .addColumn('url', 'varchar(2048)', (col) => col.notNull())
      .addColumn('kind', 'varchar(16)', (col) => col.notNull())
      .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('auth_ciphertext', 'text')
      .addColumn('auth_iv', 'varchar(32)')
      .addColumn('auth_tag', 'varchar(32)')
      .addColumn('auth_key_version', 'integer')
      .addColumn('status', 'varchar(16)', (col) => col.notNull().defaultTo('unknown'))
      .addColumn('last_error', 'text')
      .addColumn('capabilities', 'jsonb')
      .addColumn('last_checked_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addUniqueConstraint('mcp_connections_account_workspace_name_key', [
        'account_id',
        'workspace_id',
        'name',
      ])
      .execute();

    await db.schema
      .createIndex('mcp_connections_account_workspace_idx')
      .on('mcp_connections')
      .columns(['account_id', 'workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('mcp_connections_account_workspace_idx').execute();
    await db.schema.dropTable('mcp_connections').execute();
  },
};
