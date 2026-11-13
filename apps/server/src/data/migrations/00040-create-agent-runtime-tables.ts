import { Migration } from 'kysely';

export const createAgentRuntimeTables: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('agent_runs')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('agent_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull().defaultTo('queued'))
      .addColumn('input', 'jsonb', (col) => col.notNull())
      .addColumn('output', 'jsonb')
      .addColumn('error', 'jsonb')
      .addColumn('current_step', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('max_steps', 'integer', (col) => col.notNull().defaultTo(16))
      .addColumn('retry_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('next_retry_at', 'timestamptz')
      .addColumn('started_at', 'timestamptz')
      .addColumn('finished_at', 'timestamptz')
      .addColumn('heartbeat_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('agent_runs_workspace_idx')
      .on('agent_runs')
      .columns(['workspace_id', 'created_at'])
      .execute();
    await db.schema
      .createIndex('agent_runs_resume_idx')
      .on('agent_runs')
      .columns(['status', 'next_retry_at'])
      .execute();

    await db.schema
      .createTable('agent_run_steps')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('run_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('sequence', 'integer', (col) => col.notNull())
      .addColumn('kind', 'varchar(24)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('action_key', 'varchar(256)')
      .addColumn('input', 'jsonb')
      .addColumn('result', 'jsonb')
      .addColumn('error', 'jsonb')
      .addColumn('started_at', 'timestamptz')
      .addColumn('finished_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addUniqueConstraint('agent_run_steps_run_sequence_key', ['run_id', 'sequence'])
      .execute();
    await db.schema
      .createIndex('agent_run_steps_run_idx')
      .on('agent_run_steps')
      .columns(['run_id', 'sequence'])
      .execute();

    await db.schema
      .createTable('agent_action_ledger')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('run_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('action_key', 'varchar(256)', (col) => col.notNull())
      .addColumn('action_type', 'varchar(24)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('input', 'jsonb')
      .addColumn('result', 'jsonb')
      .addColumn('error', 'jsonb')
      .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
      .addUniqueConstraint('agent_action_ledger_run_key', ['run_id', 'action_key'])
      .execute();
    await db.schema
      .createIndex('agent_action_ledger_run_idx')
      .on('agent_action_ledger')
      .columns(['run_id', 'updated_at'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('agent_action_ledger_run_idx').execute();
    await db.schema.dropTable('agent_action_ledger').execute();
    await db.schema.dropIndex('agent_run_steps_run_idx').execute();
    await db.schema.dropTable('agent_run_steps').execute();
    await db.schema.dropIndex('agent_runs_resume_idx').execute();
    await db.schema.dropIndex('agent_runs_workspace_idx').execute();
    await db.schema.dropTable('agent_runs').execute();
  },
};
