import { History, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useQuery } from '@colanode/ui/hooks/use-query';

interface PageHistoryDialogProps {
  page: LocalPageNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PageHistoryDialog = ({
  page,
  open,
  onOpenChange,
}: PageHistoryDialogProps) => {
  const workspace = useWorkspace();
  const [restoring, setRestoring] = useState<string | null>(null);
  const updatesQuery = useQuery(
    {
      type: 'document.updates.list',
      documentId: page.id,
      userId: workspace.userId,
    },
    { enabled: open }
  );
  const updates = [...(updatesQuery.data ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const restore = async (updateId: string) => {
    setRestoring(updateId);
    const result = await window.colanode.executeMutation({
      type: 'document.restore',
      userId: workspace.userId,
      documentId: page.id,
      updateId,
    });
    setRestoring(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Page restored to the selected version');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Page history
          </DialogTitle>
          <DialogDescription>
            Restore this page to any saved local version. A new update is
            created, so later recovery remains possible.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {updates.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No saved versions yet.
            </p>
          )}
          {updates.map((update, index) => (
            <div
              key={update.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {index === 0 ? 'Latest saved version' : 'Saved version'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(update.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={restoring !== null}
                onClick={() => restore(update.id)}
              >
                <RotateCcw className="size-3" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
