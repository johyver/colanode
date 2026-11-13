import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  LocalDatabaseNode,
  LocalDatabaseViewNode,
} from '@colanode/client/types';
import { generateFractionalIndex, generateId, IdType } from '@colanode/core';
import {
  DatabaseForm,
  DatabaseFormValues,
} from '@colanode/ui/components/databases/database-form';
import {
  DATABASE_TEMPLATES,
  createDatabaseFromTemplate,
  DatabaseTemplate,
} from '@colanode/ui/components/databases/database-templates';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface DatabaseCreateDialogProps {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DatabaseCreateDialog = ({
  spaceId,
  open,
  onOpenChange,
}: DatabaseCreateDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const [selectedTemplate, setSelectedTemplate] = useState<DatabaseTemplate | null>(null);

  const { mutate } = useMutation({
    mutationFn: async (values: DatabaseFormValues) => {
      const nodes = workspace.collections.nodes;

      if (selectedTemplate) {
        const created = createDatabaseFromTemplate({
          template: selectedTemplate,
          name: values.name.trim() || selectedTemplate.name,
          parentId: spaceId,
          userId: workspace.userId,
        });
        // Persist each node in dependency order. A single optimistic batch
        // can race the node-create mutation queue when it contains a
        // database, its views, and records; waiting keeps seeded records
        // durable across a reload as well as visible immediately.
        for (const node of created) {
          const transaction = nodes.insert(node);
          await transaction.isPersisted.promise;
        }
        return created[0] as LocalDatabaseNode;
      }

      const databaseId = generateId(IdType.Database);
      const fieldId = generateId(IdType.Field);
      const viewId = generateId(IdType.DatabaseView);

      const database: LocalDatabaseNode = {
        id: databaseId,
        type: 'database',
        name: values.name,
        parentId: spaceId,
        fields: {
          [fieldId]: {
            id: fieldId,
            type: 'text',
            index: generateFractionalIndex(null, null),
            name: 'Comment',
          },
        },
        rootId: spaceId,
        createdAt: new Date().toISOString(),
        createdBy: workspace.userId,
        updatedAt: null,
        updatedBy: null,
        localRevision: '0',
        serverRevision: '0',
      };

      const view: LocalDatabaseViewNode = {
        id: viewId,
        type: 'database_view',
        name: 'Default',
        index: generateFractionalIndex(null, null),
        layout: 'table',
        parentId: databaseId,
        rootId: databaseId,
        createdAt: new Date().toISOString(),
        createdBy: workspace.userId,
        updatedAt: null,
        updatedBy: null,
        localRevision: '0',
        serverRevision: '0',
      };

      nodes.insert([database, view]);
      return database;
    },
    onSuccess: (database) => {
      setSelectedTemplate(null);
      navigate({
        to: '$nodeId',
        params: {
          nodeId: database.id,
        },
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectedTemplate(null);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create database</DialogTitle>
          <DialogDescription>
            Start blank or use a reusable workflow template
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            className={`rounded-md border p-3 text-left text-sm ${selectedTemplate === null ? 'border-foreground' : 'hover:bg-accent'}`}
            onClick={() => setSelectedTemplate(null)}
          >
            <div className="flex items-center justify-between font-medium">
              Blank database
              {selectedTemplate === null && <Check className="size-4" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Build your own fields and views.</p>
          </button>
          {DATABASE_TEMPLATES.map((template) => (
            <button
              type="button"
              key={template.id}
              className={`rounded-md border p-3 text-left text-sm ${selectedTemplate?.id === template.id ? 'border-foreground' : 'hover:bg-accent'}`}
              onClick={() => setSelectedTemplate(template)}
            >
              <div className="flex items-center justify-between font-medium">
                {template.name}
                {selectedTemplate?.id === template.id && <Check className="size-4" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
            </button>
          ))}
        </div>
        <DatabaseForm
          id={generateId(IdType.Database)}
          values={{
            name: '',
          }}
          submitText="Create"
          onCancel={() => {
            handleOpenChange(false);
          }}
          onSubmit={(values) => mutate(values)}
        />
      </DialogContent>
    </Dialog>
  );
};
