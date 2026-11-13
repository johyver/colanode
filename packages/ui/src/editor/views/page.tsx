import { eq, useLiveQuery } from '@tanstack/react-db';
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { LocalPageNode } from '@colanode/client/types';
import { hasNodeRole } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import { PageUpdateDialog } from '@colanode/ui/components/pages/page-update-dialog';
import { Button } from '@colanode/ui/components/ui/button';
import { Link } from '@colanode/ui/components/ui/link';
import { useNode } from '@colanode/ui/contexts/node';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const PageNodeView = ({ node }: NodeViewProps) => {
  const workspace = useWorkspace();
  const { role } = useNode();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const id = node.attrs.id;

  if (!id) {
    return null;
  }

  const pageGetQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, id))
        .findOne(),
    [workspace.userId, id]
  );

  if (
    pageGetQuery.isLoading ||
    !pageGetQuery.data ||
    pageGetQuery.data.type !== 'page'
  ) {
    return null;
  }

  const page = pageGetQuery.data as LocalPageNode | undefined;
  if (!page) {
    return null;
  }

  const name = page.name ?? 'Unnamed';
  const avatar = page.avatar;
  const canManagePage = hasNodeRole(role, 'editor');

  return (
    <NodeViewWrapper data-id={node.attrs.id} contentEditable={false}>
      <div className="my-0.5 flex h-10 w-full items-center gap-1 rounded-md p-1 hover:bg-accent">
        <Link
          from="/workspace/$userId"
          to="$nodeId"
          params={{ nodeId: id }}
          className="flex h-full min-w-0 flex-1 items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Avatar size="small" id={id} name={name} avatar={avatar} />
          <span className="min-w-0 grow truncate text-left">{name}</span>
        </Link>
        {canManagePage && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Edit ${name}`}
              title={`Edit ${name}`}
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowRenameDialog(true);
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete ${name}`}
              title={`Delete ${name}`}
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      {canManagePage && (
        <PageUpdateDialog
          page={page}
          role={role}
          open={showRenameDialog}
          onOpenChange={setShowRenameDialog}
        />
      )}
      {canManagePage && (
        <NodeDeleteDialog
          id={page.id}
          title={`Delete ${name}?`}
          description="This page will no longer be accessible to you or collaborators. This action cannot be undone."
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
        />
      )}
    </NodeViewWrapper>
  );
};
