import { Migration, sql } from 'kysely';

export const widenMcpStatusColumn: Migration = {
  up: async (db) => {
    await sql`ALTER TABLE mcp_connections ALTER COLUMN status TYPE varchar(32)`.execute(db);
  },
  down: async (db) => {
    await sql`ALTER TABLE mcp_connections ALTER COLUMN status TYPE varchar(16)`.execute(db);
  },
};
