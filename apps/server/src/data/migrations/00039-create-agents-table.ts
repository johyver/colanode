import { Migration } from 'kysely';

export const createAgentsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('agents')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('owner_account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('name', 'varchar(256)', (col) => col.notNull())
      .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
      .addColumn('instructions', 'text', (col) => col.notNull())
      .addColumn('model', 'jsonb', (col) => col.notNull())
      .addColumn('mcp_tool_allowlist', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('permissions', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('triggers', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('budget', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('lifecycle', 'varchar(16)', (col) => col.notNull().defaultTo('draft'))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addColumn('updated_by', 'varchar(30)')
      .addUniqueConstraint('agents_workspace_name_key', ['workspace_id', 'name'])
      .execute();

    await db.schema
      .createIndex('agents_workspace_idx')
      .on('agents')
      .columns(['workspace_id', 'lifecycle', 'updated_at'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('agents_workspace_idx').execute();
    await db.schema.dropTable('agents').execute();
  },
};
