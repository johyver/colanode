import { useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@colanode/ui/components/ui/command';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useQuery } from '@colanode/ui/hooks/use-query';

interface WorkspaceSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WorkspaceSearchDialog = ({
  open,
  onOpenChange,
}: WorkspaceSearchDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const searchQuery = useQuery(
    {
      type: 'workspace.search',
      searchQuery: query,
      userId: workspace.userId,
    },
    { enabled: open && query.trim().length > 0 }
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search workspace"
      description="Search pages, databases, records and document content"
      className="sm:max-w-xl"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search pages, databases and content..."
      />
      <CommandList>
        <CommandEmpty>
          {query.trim()
            ? 'No accessible results found.'
            : 'Start typing to search.'}
        </CommandEmpty>
        <CommandGroup heading="Accessible workspace results">
          {searchQuery.data?.map((result) => (
            <CommandItem
              key={result.node.id}
              value={`${'name' in result.node ? result.node.name : result.node.type} ${result.node.id}`}
              onSelect={() => {
                navigate({
                  to: '/workspace/$userId/$nodeId',
                  params: { userId: workspace.userId, nodeId: result.node.id },
                });
                onOpenChange(false);
                setQuery('');
              }}
            >
              <FileText className="size-4" />
              <span className="truncate">
                {'name' in result.node
                  ? result.node.name || 'Untitled'
                  : result.node.type}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {result.matchedIn}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
