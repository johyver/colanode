import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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

interface WorkspaceTrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WorkspaceTrashDialog = ({
  open,
  onOpenChange,
}: WorkspaceTrashDialogProps) => {
  const workspace = useWorkspace();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoredIds, setRestoredIds] = useState<string[]>([]);
  const trashQuery = useQuery(
    { type: 'tombstones.list', userId: workspace.userId },
    { enabled: open }
  );
  const items = (trashQuery.data ?? []).filter(
    (item) => !restoredIds.includes(item.node.id)
  );

  const restore = async (nodeId: string) => {
    setRestoring(nodeId);
    const result = await window.colanode.executeMutation({
      type: 'node.restore',
      userId: workspace.userId,
      nodeId,
    });
    setRestoring(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    setRestoredIds((ids) => [...ids, nodeId]);
    toast.success('Item restored');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-4" />
            Recently deleted
          </DialogTitle>
          <DialogDescription>
            Deleted items remain recoverable locally until the server cleanup
            window expires.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing to recover.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.node.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {'name' in item.node
                    ? item.node.name || 'Untitled'
                    : item.node.type}
                </p>
                <p className="text-xs text-muted-foreground">
                  Deleted {new Date(item.deletedAt).toLocaleString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={restoring !== null}
                onClick={() => restore(item.node.id)}
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
