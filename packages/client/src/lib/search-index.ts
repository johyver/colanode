import { Kysely, Transaction } from 'kysely';

import { WorkspaceDatabaseSchema } from '@colanode/client/databases/workspace';
import { NodeText } from '@colanode/core';

type WorkspaceDatabase =
  | Kysely<WorkspaceDatabaseSchema>
  | Transaction<WorkspaceDatabaseSchema>;

/**
 * The workspace text tables are contentless FTS5 indexes. Replacing the row
 * instead of inserting a second row keeps updates and permission revocations
 * from leaving stale searchable content behind.
 */
export const replaceNodeText = async (
  database: WorkspaceDatabase,
  nodeId: string,
  nodeText: NodeText | null
) => {
  await database.deleteFrom('node_texts').where('id', '=', nodeId).execute();

  if (!nodeText) {
    return;
  }

  await database
    .insertInto('node_texts')
    .values({
      id: nodeId,
      name: nodeText.name ?? null,
      attributes: nodeText.attributes ?? null,
    })
    .execute();
};

export const replaceDocumentText = async (
  database: WorkspaceDatabase,
  documentId: string,
  text: string | null
) => {
  await database
    .deleteFrom('document_texts')
    .where('id', '=', documentId)
    .execute();

  if (!text) {
    return;
  }

  await database
    .insertInto('document_texts')
    .values({ id: documentId, text })
    .execute();
};
