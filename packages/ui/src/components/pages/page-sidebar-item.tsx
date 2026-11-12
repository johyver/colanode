import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { LocalNode, LocalPageNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@colanode/ui/components/ui/collapsible';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface PageSidebarItemProps {
  page: LocalPageNode;
}

export const PageSidebarItem = ({ page }: PageSidebarItemProps) => {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);

  const childrenQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.parentId, page.id))
        .where(({ nodes }) =>
          inArray(nodes.type, ['page', 'database', 'folder'])
        )
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    [workspace.userId, page.id]
  );

  const children = (childrenQuery.data ?? []) as LocalNode[];
  const hasChildren = children.length > 0;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/page-item w-full"
    >
      <div className="group/page-row flex h-7 min-w-0 items-center gap-1 rounded-md px-1 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={`${open ? 'Collapse' : 'Expand'} ${page.name ?? 'Unnamed'} page`}
              className="flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-sidebar-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  'size-4 transition-transform',
                  open && 'rotate-90'
                )}
              />
            </button>
          </CollapsibleTrigger>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}
        <Link
          from="/workspace/$userId"
          to="$nodeId"
          params={{ nodeId: page.id }}
          className="flex h-full min-w-0 flex-1 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          {({ isActive }) => (
            <span
              className={cn(
                'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1',
                isActive &&
                  'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              )}
            >
              <Avatar
                id={page.id}
                avatar={page.avatar}
                name={page.name}
                className="size-4 shrink-0"
              />
              <span className="line-clamp-1 min-w-0 flex-1 text-left">
                {page.name ?? 'Unnamed'}
              </span>
            </span>
          )}
        </Link>
      </div>
      {hasChildren && (
        <CollapsibleContent>
          <ul className="ml-3 flex min-w-0 flex-col gap-0.5 py-0.5">
            {children.map((child) => (
              <li key={child.id}>
                <SidebarItem node={child} />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};
