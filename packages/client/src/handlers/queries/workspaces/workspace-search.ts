import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases/workspace';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { mapNode } from '@colanode/client/lib/mappers';
import {
  WorkspaceSearchQueryInput,
  WorkspaceSearchResult,
} from '@colanode/client/queries/workspaces/workspace-search';
import { Event } from '@colanode/client/types/events';

const escapeFtsToken = (token: string) => `"${token.replaceAll('"', '""')}"*`;

export class WorkspaceSearchQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<WorkspaceSearchQueryInput>
{
  public async handleQuery(
    input: WorkspaceSearchQueryInput
  ): Promise<WorkspaceSearchResult[]> {
    const query = input.searchQuery.trim();
    if (!query) {
      return [];
    }

    const workspace = this.getWorkspace(input.userId);
    const match = query.split(/\s+/).map(escapeFtsToken).join(' AND ');
    const likePattern = `%${query.replaceAll('%', '%%').replaceAll('_', '[_]')}%`;
    const compiled = sql<SelectNode & { matched_in: 'title' | 'content' }>`
      SELECT n.*, CASE
        WHEN lower(n.attributes) LIKE lower(${likePattern})
          THEN 'title'
        ELSE 'content'
      END AS matched_in
      FROM nodes n
      WHERE n.id IN (
        SELECT id FROM nodes WHERE lower(attributes) LIKE lower(${likePattern})
        UNION ALL
        SELECT id FROM document_texts WHERE document_texts MATCH ${match}
      )
      AND NOT EXISTS (SELECT 1 FROM tombstones t WHERE t.id = n.id)
      ORDER BY COALESCE(n.updated_at, n.created_at) DESC
      LIMIT 100
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(compiled);
    return result.rows.map((row) => ({
      node: mapNode(row),
      matchedIn: row.matched_in,
    })) as WorkspaceSearchResult[];
  }

  public async checkForChanges(
    event: Event,
    input: WorkspaceSearchQueryInput
  ): Promise<ChangeCheckResult<WorkspaceSearchQueryInput>> {
    if (
      'workspace' in event &&
      event.workspace.userId === input.userId &&
      [
        'node.created',
        'node.updated',
        'node.deleted',
        'document.updated',
      ].includes(event.type)
    ) {
      return {
        hasChanges: true,
        result: await this.handleQuery(input),
      };
    }

    return { hasChanges: false };
  }
}
