import { Migration } from 'kysely';

export const createAiCredentialsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('ai_credentials')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('provider', 'varchar(30)', (col) => col.notNull())
      .addColumn('label', 'varchar(256)', (col) => col.notNull())
      .addColumn('ciphertext', 'text', (col) => col.notNull())
      .addColumn('iv', 'varchar(32)', (col) => col.notNull())
      .addColumn('auth_tag', 'varchar(32)', (col) => col.notNull())
      .addColumn('key_version', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addColumn('revoked_at', 'timestamptz')
      .addUniqueConstraint('ai_credentials_account_workspace_provider_key', [
        'account_id',
        'workspace_id',
        'provider',
      ])
      .execute();

    await db.schema
      .createIndex('ai_credentials_account_workspace_idx')
      .on('ai_credentials')
      .columns(['account_id', 'workspace_id'])
      .execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('ai_credentials_account_workspace_idx').execute();
    await db.schema
      .dropTable('ai_credentials')
      .execute();
  },
};
