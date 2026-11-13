import { useQuery } from '@tanstack/react-query';
import { FocusPosition } from '@tiptap/core';
import React from 'react';

import { LocalNode } from '@colanode/client/types';
import { DocumentEditor } from '@colanode/ui/components/documents/document-editor';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

class DocumentEditorRecoveryBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  public override state = { hasError: false };

  public static getDerivedStateFromError() {
    return { hasError: true };
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium">Document recovery mode</p>
            <p className="text-sm text-muted-foreground">
              This saved document version could not be rendered safely. Open
              page settings and choose History to restore an earlier version.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface DocumentProps {
  node: LocalNode;
  canEdit: boolean;
  autoFocus?: FocusPosition;
}

export const Document = ({ node, canEdit, autoFocus }: DocumentProps) => {
  const workspace = useWorkspace();

  const documentStateInput = {
    type: 'document.state.get',
    documentId: node.id,
    userId: workspace.userId,
  } as const;

  const subscribedDocumentStateQuery = useLiveQuery(documentStateInput);
  const documentStateQuery = useQuery({
    queryKey: ['document.state.refresh', workspace.userId, node.id],
    queryFn: () => window.colanode.executeQuery(documentStateInput),
    // A short local refresh closes the gap when a reconnect event reaches the
    // worker while the browser query subscription is being rehydrated.
    refetchInterval: 1000,
  });

  const documentUpdatesQuery = useLiveQuery({
    type: 'document.updates.list',
    documentId: node.id,
    userId: workspace.userId,
  });

  if (
    subscribedDocumentStateQuery.isPending ||
    documentStateQuery.isPending ||
    documentUpdatesQuery.isPending
  ) {
    return null;
  }

  const state =
    documentStateQuery.data ?? subscribedDocumentStateQuery.data ?? null;
  const updates = documentUpdatesQuery.data ?? [];

  return (
    <DocumentEditorRecoveryBoundary>
      <DocumentEditor
        key={node.id}
        node={node}
        state={state}
        updates={updates}
        canEdit={canEdit}
        autoFocus={autoFocus}
      />
    </DocumentEditorRecoveryBoundary>
  );
};
