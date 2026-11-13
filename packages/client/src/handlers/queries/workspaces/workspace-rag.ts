import { sql } from 'kysely';

import { SelectNode } from '@colanode/client/databases/workspace';
import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { mapNode } from '@colanode/client/lib/mappers';
import {
  WorkspaceRagCitation,
  WorkspaceRagQueryInput,
} from '@colanode/client/queries/workspaces/workspace-rag';
import { Event } from '@colanode/client/types/events';
import { extractDocumentText, getNodeModel, NodeAttributes } from '@colanode/core';

type RagRow = SelectNode & {
  document_content: string | null;
  matched_in: 'title' | 'content';
  score: number;
};

const escapeFtsToken = (token: string) => `"${token.replaceAll('"', '""')}"*`;

const getQueryTokens = (query: string) =>
  query
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(Boolean)
    .slice(0, 12);

const buildExcerpt = (text: string, query: string) => {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (cleanText.length <= 480) {
    return cleanText;
  }

  const tokens = getQueryTokens(query);
  const lowerText = cleanText.toLocaleLowerCase();
  const matchIndex = tokens
    .map((token) => lowerText.indexOf(token.toLocaleLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (matchIndex ?? 0) - 120);
  const end = Math.min(cleanText.length, start + 480);
  return `${start > 0 ? '…' : ''}${cleanText.slice(start, end)}${
    end < cleanText.length ? '…' : ''
  }`;
};

const getNodeText = (row: RagRow, node: ReturnType<typeof mapNode>) => {
  if (row.document_content) {
    try {
      const content = JSON.parse(row.document_content);
      const text = extractDocumentText(row.id, content);
      if (text) {
        return text;
      }
    } catch {
      // Fall through to the indexed node attributes when the document is stale.
    }
  }

  try {
    const model = getNodeModel(node.type);
    const extracted = model?.extractText(node.id, node as NodeAttributes);
    return [extracted?.name, extracted?.attributes].filter(Boolean).join('\n');
  } catch {
    return 'Accessible workspace item';
  }
};

export class WorkspaceRagQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<WorkspaceRagQueryInput>
{
  public async handleQuery(
    input: WorkspaceRagQueryInput
  ): Promise<WorkspaceRagCitation[]> {
    const query = input.query.trim();
    const tokens = getQueryTokens(query);
    if (!query || tokens.length === 0) {
      return [];
    }

    const workspace = this.getWorkspace(input.userId);
    const match = tokens.map(escapeFtsToken).join(' AND ');
    const limit = Math.max(1, Math.min(input.limit ?? 6, 12));
    const compiled = sql<RagRow>`
      SELECT n.*, d.content AS document_content,
        CASE
          WHEN n.id IN (
            SELECT id FROM document_texts WHERE document_texts MATCH ${match}
          ) THEN 'content'
          ELSE 'title'
        END AS matched_in,
        CASE
          WHEN n.id IN (
            SELECT id FROM document_texts WHERE document_texts MATCH ${match}
          ) THEN 1.0
          ELSE 0.7
        END AS score
      FROM nodes n
      LEFT JOIN documents d ON d.id = n.id
      WHERE NOT EXISTS (SELECT 1 FROM tombstones t WHERE t.id = n.id)
        AND (
          n.id IN (SELECT id FROM node_texts WHERE node_texts MATCH ${match})
          OR n.id IN (
            SELECT id FROM document_texts WHERE document_texts MATCH ${match}
          )
        )
      ORDER BY score DESC, COALESCE(n.updated_at, n.created_at) DESC
      LIMIT ${limit}
    `.compile(workspace.database);

    const result = await workspace.database.executeQuery(compiled);
    return result.rows.map((row) => {
      const node = mapNode(row);
      const title =
        'name' in node && typeof node.name === 'string' && node.name.trim()
          ? node.name
          : node.type;

      return {
        nodeId: node.id,
        title,
        type: node.type,
        excerpt: buildExcerpt(getNodeText(row, node), query),
        score: Number(row.score),
        updatedAt: node.updatedAt,
      };
    });
  }

  public async checkForChanges(
    event: Event,
    input: WorkspaceRagQueryInput
  ): Promise<ChangeCheckResult<WorkspaceRagQueryInput>> {
    if (
      'workspace' in event &&
      event.workspace.userId === input.userId &&
      ['node.created', 'node.updated', 'node.deleted', 'document.updated'].includes(
        event.type
      )
    ) {
      return {
        hasChanges: true,
        result: await this.handleQuery(input),
      };
    }

    return { hasChanges: false };
  }
}
