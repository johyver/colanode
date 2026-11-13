import { Migration } from 'kysely';

export const addMcpAuthReconnectState: Migration = {
  up: async (db) => {
    await db.schema
      .alterTable('mcp_connections')
      .addColumn('auth_mode', 'varchar(16)', (col) => col.notNull().defaultTo('none'))
      .addColumn('oauth_discovery_state', 'jsonb')
      .addColumn('oauth_pending_state', 'varchar(256)')
      .addColumn('oauth_pending_ciphertext', 'text')
      .addColumn('oauth_pending_iv', 'varchar(32)')
      .addColumn('oauth_pending_tag', 'varchar(32)')
      .addColumn('oauth_authorization_url', 'text')
      .addColumn('oauth_scope', 'varchar(2048)')
      .addColumn('auth_expires_at', 'timestamptz')
      .addColumn('retry_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('circuit_state', 'varchar(16)', (col) => col.notNull().defaultTo('closed'))
      .addColumn('circuit_opened_at', 'timestamptz')
      .addColumn('next_retry_at', 'timestamptz')
      .execute();

    await db
      .updateTable('mcp_connections')
      .set({ auth_mode: 'token' })
      .where('auth_ciphertext', 'is not', null)
      .execute();
  },
  down: async (db) => {
    await db.schema
      .alterTable('mcp_connections')
      .dropColumn('next_retry_at')
      .dropColumn('circuit_opened_at')
      .dropColumn('circuit_state')
      .dropColumn('retry_count')
      .dropColumn('auth_expires_at')
      .dropColumn('oauth_scope')
      .dropColumn('oauth_authorization_url')
      .dropColumn('oauth_pending_tag')
      .dropColumn('oauth_pending_iv')
      .dropColumn('oauth_pending_ciphertext')
      .dropColumn('oauth_pending_state')
      .dropColumn('oauth_discovery_state')
      .dropColumn('auth_mode')
      .execute();
  },
};
