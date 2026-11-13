import { WorkspaceQueryHandlerBase } from '@colanode/client/handlers/queries/workspace-query-handler-base';
import { ChangeCheckResult, QueryHandler } from '@colanode/client/lib';
import { mapNode } from '@colanode/client/lib/mappers';
import {
  Tombstone,
  TombstonesListQueryInput,
} from '@colanode/client/queries/workspaces/tombstones-list';
import { Event } from '@colanode/client/types/events';

export class TombstonesListQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<TombstonesListQueryInput>
{
  public async handleQuery(
    input: TombstonesListQueryInput
  ): Promise<Tombstone[]> {
    const workspace = this.getWorkspace(input.userId);
    const rows = await workspace.database
      .selectFrom('tombstones')
      .selectAll()
      .orderBy('deleted_at', 'desc')
      .execute();

    return rows.map((row) => ({
      node: mapNode(JSON.parse(row.data)),
      deletedAt: row.deleted_at,
    }));
  }

  public async checkForChanges(
    event: Event,
    input: TombstonesListQueryInput
  ): Promise<ChangeCheckResult<TombstonesListQueryInput>> {
    if (
      'workspace' in event &&
      event.workspace.userId === input.userId &&
      ['node.created', 'node.deleted'].includes(event.type)
    ) {
      return { hasChanges: true, result: await this.handleQuery(input) };
    }

    return { hasChanges: false };
  }
}
