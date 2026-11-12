import { DocumentState, DocumentUpdate } from '@colanode/client/types';
import { RichTextContent, richTextContentSchema } from '@colanode/core';
import { YDoc } from '@colanode/crdt';

/**
 * Reconcile every incoming remote update, not just new checkpoint revisions.
 *
 * The checkpoint revision can remain unchanged while additional document
 * updates arrive through sync. Check all updates against a copy first: a bad
 * incoming payload must never corrupt the live document or its undo history.
 */
export const applyRemoteDocumentUpdates = (
  ydoc: YDoc,
  state: DocumentState | null | undefined,
  updates: DocumentUpdate[]
): RichTextContent | null => {
  if (!state && updates.length === 0) {
    return null;
  }

  const apply = (doc: YDoc) => {
    if (state) {
      doc.applyUpdate(state.state);
    }

    for (const update of updates) {
      doc.applyUpdate(update.data);
    }
  };

  try {
    const candidate = new YDoc(ydoc.getState());
    apply(candidate);

    if (!richTextContentSchema.safeParse(candidate.getObject()).success) {
      return null;
    }

    // Preserve the live Y.Doc identity and its local UndoManager history.
    apply(ydoc);
    return ydoc.getObject<RichTextContent>();
  } catch {
    // A malformed remote update must not be applied to the live editor.
    return null;
  }
};
