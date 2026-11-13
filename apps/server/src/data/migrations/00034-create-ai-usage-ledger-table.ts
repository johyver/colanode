import { Migration } from 'kysely';

export const createAiUsageLedgerTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('ai_usage_ledger')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('agent_id', 'varchar(256)')
      .addColumn('provider', 'varchar(30)', (col) => col.notNull())
      .addColumn('model', 'varchar(256)', (col) => col.notNull())
      .addColumn('prompt_tokens', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('completion_tokens', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('total_tokens', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('estimated_cost_usd', 'numeric(18, 8)', (col) => col.notNull().defaultTo(0))
      .addColumn('request_id', 'varchar(256)')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('ai_usage_ledger_account_workspace_created_idx')
      .on('ai_usage_ledger')
      .columns(['account_id', 'workspace_id', 'created_at'])
      .execute();

    await db.schema
      .createIndex('ai_usage_ledger_agent_created_idx')
      .on('ai_usage_ledger')
      .columns(['workspace_id', 'agent_id', 'created_at'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('ai_usage_ledger_agent_created_idx').execute();
    await db.schema
      .dropIndex('ai_usage_ledger_account_workspace_created_idx')
      .execute();
    await db.schema.dropTable('ai_usage_ledger').execute();
  },
};
