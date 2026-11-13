import { Migration } from 'kysely';

export const createAgentAutomationTables: Migration = {
  up: async (db) => {
    await db.schema.createTable('agent_triggers')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('agent_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('name', 'varchar(256)', (col) => col.notNull())
      .addColumn('kind', 'varchar(24)', (col) => col.notNull())
      .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('config', 'jsonb', (col) => col.notNull())
      .addColumn('secret', 'jsonb')
      .addColumn('last_fired_at', 'timestamptz')
      .addColumn('last_error', 'text')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
      .addUniqueConstraint('agent_triggers_workspace_name_key', ['workspace_id', 'name']).execute();
    await db.schema.createIndex('agent_triggers_workspace_idx').on('agent_triggers').columns(['workspace_id', 'kind', 'enabled']).execute();

    await db.schema.createTable('agent_trigger_events')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('trigger_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('event_key', 'varchar(512)', (col) => col.notNull())
      .addColumn('source', 'varchar(24)', (col) => col.notNull())
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('run_id', 'varchar(30)')
      .addColumn('error', 'jsonb')
      .addColumn('received_at', 'timestamptz', (col) => col.notNull())
      .addColumn('processed_at', 'timestamptz')
      .addUniqueConstraint('agent_trigger_events_dedupe_key', ['trigger_id', 'event_key']).execute();
    await db.schema.createIndex('agent_trigger_events_trigger_idx').on('agent_trigger_events').columns(['trigger_id', 'received_at']).execute();

    await db.schema.createTable('agent_delegations')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('owner_account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('parent_run_id', 'varchar(30)')
      .addColumn('parent_agent_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('child_run_id', 'varchar(30)')
      .addColumn('child_agent_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('context', 'jsonb', (col) => col.notNull())
      .addColumn('requested_permissions', 'jsonb', (col) => col.notNull())
      .addColumn('requires_approval', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull()).execute();
    await db.schema.createIndex('agent_delegations_workspace_idx').on('agent_delegations').columns(['workspace_id', 'created_at']).execute();

    await db.schema.createTable('agent_approvals')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('run_id', 'varchar(30)')
      .addColumn('delegation_id', 'varchar(30)')
      .addColumn('kind', 'varchar(24)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull().defaultTo('pending'))
      .addColumn('requested_by', 'varchar(30)', (col) => col.notNull())
      .addColumn('decided_by', 'varchar(30)')
      .addColumn('decision_note', 'text')
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull()).execute();
    await db.schema.createIndex('agent_approvals_workspace_idx').on('agent_approvals').columns(['workspace_id', 'status', 'created_at']).execute();

    await db.schema.createTable('agent_blog_pilots')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('owner_account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('title', 'varchar(512)', (col) => col.notNull())
      .addColumn('stage', 'varchar(24)', (col) => col.notNull().defaultTo('draft'))
      .addColumn('status', 'varchar(24)', (col) => col.notNull().defaultTo('ready'))
      .addColumn('content', 'jsonb', (col) => col.notNull())
      .addColumn('review_decision', 'varchar(24)')
      .addColumn('publication_blocked', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull()).execute();
    await db.schema.createIndex('agent_blog_pilots_workspace_idx').on('agent_blog_pilots').columns(['workspace_id', 'created_at']).execute();

    await db.schema.createTable('agent_blog_pilot_steps')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('pilot_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('sequence', 'integer', (col) => col.notNull())
      .addColumn('stage', 'varchar(24)', (col) => col.notNull())
      .addColumn('status', 'varchar(24)', (col) => col.notNull())
      .addColumn('agent_id', 'varchar(30)')
      .addColumn('run_id', 'varchar(30)')
      .addColumn('input', 'jsonb')
      .addColumn('output', 'jsonb')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addUniqueConstraint('agent_blog_pilot_steps_sequence_key', ['pilot_id', 'sequence']).execute();
    await db.schema.createIndex('agent_blog_pilot_steps_pilot_idx').on('agent_blog_pilot_steps').columns(['pilot_id', 'sequence']).execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('agent_blog_pilot_steps_pilot_idx').execute();
    await db.schema.dropTable('agent_blog_pilot_steps').execute();
    await db.schema.dropIndex('agent_blog_pilots_workspace_idx').execute();
    await db.schema.dropTable('agent_blog_pilots').execute();
    await db.schema.dropIndex('agent_approvals_workspace_idx').execute();
    await db.schema.dropTable('agent_approvals').execute();
    await db.schema.dropIndex('agent_delegations_workspace_idx').execute();
    await db.schema.dropTable('agent_delegations').execute();
    await db.schema.dropIndex('agent_trigger_events_trigger_idx').execute();
    await db.schema.dropTable('agent_trigger_events').execute();
    await db.schema.dropIndex('agent_triggers_workspace_idx').execute();
    await db.schema.dropTable('agent_triggers').execute();
  },
};
