import '@colanode/ui/styles/editor.css';

import {
  EditorContent,
  FocusPosition,
  JSONContent,
  useEditor,
} from '@tiptap/react';
import { debounce, isEqual } from 'lodash-es';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  restoreRelativeSelection,
  getRelativeSelection,
  mapContentsToBlocks,
  buildEditorContent,
} from '@colanode/client/lib';
import {
  LocalNode,
  DocumentState,
  DocumentUpdate,
} from '@colanode/client/types';
import { RichTextContent, richTextContentSchema } from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';
import { AiWritingPanel } from '@colanode/ui/components/documents/ai-writing-panel';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  BlockquoteCommand,
  BulletListCommand,
  CodeBlockCommand,
  DividerCommand,
  FileCommand,
  FolderCommand,
  Heading1Command,
  Heading2Command,
  Heading3Command,
  OrderedListCommand,
  PageCommand,
  ParagraphCommand,
  TableCommand,
  TodoCommand,
  DatabaseCommand,
  DatabaseInlineCommand,
} from '@colanode/ui/editor/commands';
import {
  BlockquoteNode,
  BoldMark,
  BulletListNode,
  CodeBlockNode,
  CodeMark,
  ColorMark,
  CommanderExtension,
  DeleteControlExtension,
  DividerNode,
  DocumentNode,
  DropcursorExtension,
  FileNode,
  FolderNode,
  Heading1Node,
  Heading2Node,
  Heading3Node,
  HighlightMark,
  IdExtension,
  ItalicMark,
  LinkMark,
  ListItemNode,
  ListKeymapExtension,
  OrderedListNode,
  PageNode,
  ParagraphNode,
  PlaceholderExtension,
  StrikethroughMark,
  TabKeymapExtension,
  TableNode,
  TableRowNode,
  TableHeaderNode,
  TableCellNode,
  TaskItemNode,
  TaskListNode,
  TextNode,
  TrailingNode,
  UnderlineMark,
  DatabaseNode,
  AutoJoiner,
  HardBreakNode,
  ParserExtension,
  Markdown,
} from '@colanode/ui/editor/extensions';
import { ToolbarMenu, ActionMenu } from '@colanode/ui/editor/menus';
import { getDocumentHistoryAction } from '@colanode/ui/lib/document-history-shortcuts';
import { applyRemoteDocumentUpdates } from '@colanode/ui/lib/remote-document-updates';

interface DocumentEditorProps {
  node: LocalNode;
  state: DocumentState | null | undefined;
  updates: DocumentUpdate[];
  canEdit: boolean;
  autoFocus?: FocusPosition;
}

const buildYDoc = (
  state: DocumentState | null | undefined,
  updates: DocumentUpdate[]
) => {
  const ydoc = new YDoc();
  applyRemoteDocumentUpdates(ydoc, state, updates);
  return ydoc;
};

interface UndoRedoParams {
  editor: ReturnType<typeof useEditor>;
  ydoc: YDoc;
  nodeId: string;
  userId: string;
}

const performUndo = async ({
  editor,
  ydoc,
  nodeId,
  userId,
}: UndoRedoParams) => {
  const beforeContent = ydoc.getObject<RichTextContent>();
  const update = ydoc.undo(richTextContentSchema);

  if (!update) {
    return;
  }

  const afterContent = ydoc.getObject<RichTextContent>();

  if (isEqual(beforeContent, afterContent)) {
    return;
  }

  const editorContent = buildEditorContent(nodeId, afterContent);
  editor.chain().setContent(editorContent, { emitUpdate: false }).run();

  const result = await window.colanode.executeMutation({
    type: 'document.update',
    userId,
    documentId: nodeId,
    update: encodeState(update),
  });

  if (!result.success) {
    toast.error(result.error.message);
  }
};

const performRedo = async ({
  editor,
  ydoc,
  nodeId,
  userId,
}: UndoRedoParams) => {
  const beforeContent = ydoc.getObject<RichTextContent>();
  const update = ydoc.redo(richTextContentSchema);

  if (!update) {
    return;
  }

  const afterContent = ydoc.getObject<RichTextContent>();

  if (isEqual(beforeContent, afterContent)) {
    return;
  }

  const editorContent = buildEditorContent(nodeId, afterContent);
  editor.chain().setContent(editorContent, { emitUpdate: false }).run();

  const result = await window.colanode.executeMutation({
    type: 'document.update',
    userId,
    documentId: nodeId,
    update: encodeState(update),
  });

  if (!result.success) {
    toast.error(result.error.message);
  }
};

export const DocumentEditor = ({
  node,
  state,
  updates,
  canEdit,
  autoFocus,
}: DocumentEditorProps) => {
  const workspace = useWorkspace();

  const hasPendingChanges = useRef(false);
  const [saveGeneration, setSaveGeneration] = useState(0);
  const ydocRef = useRef<YDoc>(buildYDoc(state, updates));
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const debouncedSave = useMemo(
    () =>
      debounce(async (content: JSONContent) => {
        const beforeContent = ydocRef.current.getObject<RichTextContent>();
        const beforeBlocks = beforeContent?.blocks;
        const indexMap = new Map<string, string>();
        if (beforeBlocks) {
          for (const [key, value] of Object.entries(beforeBlocks)) {
            indexMap.set(key, value.index);
          }
        }

        const afterBlocks = mapContentsToBlocks(
          node.id,
          content.content ?? [],
          indexMap
        );

        const afterContent: RichTextContent = {
          type: 'rich_text',
          blocks: afterBlocks,
        };

        const update = ydocRef.current.update(
          richTextContentSchema,
          afterContent
        );

        hasPendingChanges.current = false;
        // A remote update could have arrived while an editor save was pending.
        // Retry reconciliation now that it is safe to update the editor view.
        setSaveGeneration((generation) => generation + 1);

        if (!update) {
          return;
        }

        const result = await window.colanode.executeMutation({
          type: 'document.update',
          userId: workspace.userId,
          documentId: node.id,
          update: encodeState(update),
        });

        if (!result.success) {
          toast.error(result.error.message);
        }
      }, 500),
    [node.id]
  );

  const editor = useEditor(
    {
      extensions: [
        IdExtension,
        ParserExtension,
        Markdown,
        DocumentNode,
        PageNode,
        FolderNode,
        FileNode.configure({
          context: {
            userId: workspace.userId,
            accountId: workspace.accountId,
            workspaceId: workspace.workspaceId,
            documentId: node.id,
            rootId: node.rootId,
          },
        }),
        TextNode,
        ParagraphNode,
        HardBreakNode,
        Heading1Node,
        Heading2Node,
        Heading3Node,
        BlockquoteNode,
        BulletListNode,
        CodeBlockNode,
        TabKeymapExtension,
        ListItemNode,
        ListKeymapExtension,
        OrderedListNode,
        PlaceholderExtension.configure({
          message: "Write something or '/' for commands",
        }),
        TaskListNode,
        TaskItemNode,
        TableNode,
        TableRowNode,
        TableCellNode,
        TableHeaderNode,
        DividerNode,
        TrailingNode,
        LinkMark,
        DeleteControlExtension,
        DropcursorExtension,
        DatabaseNode,
        AutoJoiner,
        CommanderExtension.configure({
          commands: [
            ParagraphCommand,
            PageCommand,
            BlockquoteCommand,
            Heading1Command,
            Heading2Command,
            Heading3Command,
            BulletListCommand,
            CodeBlockCommand,
            OrderedListCommand,
            TableCommand,
            DatabaseInlineCommand,
            DatabaseCommand,
            DividerCommand,
            TodoCommand,
            FileCommand,
            FolderCommand,
          ],
          context: {
            userId: workspace.userId,
            documentId: node.id,
            accountId: workspace.accountId,
            workspaceId: workspace.workspaceId,
            rootId: node.rootId,
          },
        }),
        BoldMark,
        ItalicMark,
        UnderlineMark,
        StrikethroughMark,
        CodeMark,
        ColorMark,
        HighlightMark,
      ],
      editorProps: {
        attributes: {
          class:
            'prose-lg prose-stone dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full text-foreground',
          spellCheck: 'false',
        },
        handleKeyDown: (_, event) => {
          if (!editorRef.current) {
            return false;
          }

          const historyAction = getDocumentHistoryAction(event);
          if (!historyAction) {
            return false;
          }

          event.preventDefault();
          if (historyAction === 'undo') {
            void performUndo({
              editor: editorRef.current,
              ydoc: ydocRef.current,
              nodeId: node.id,
              userId: workspace.userId,
            });
          } else {
            void performRedo({
              editor: editorRef.current,
              ydoc: ydocRef.current,
              nodeId: node.id,
              userId: workspace.userId,
            });
          }
          return true;
        },
      },
      content: buildEditorContent(
        node.id,
        ydocRef.current.getObject<RichTextContent>()
      ),
      editable: canEdit,
      shouldRerenderOnTransaction: false,
      autofocus: autoFocus,
      onUpdate: async ({ editor, transaction }) => {
        if (transaction.docChanged) {
          hasPendingChanges.current = true;
          debouncedSave(editor.getJSON());
        }
      },
    },
    [node.id]
  );

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (hasPendingChanges.current) {
      return;
    }

    const afterContent = applyRemoteDocumentUpdates(
      ydocRef.current,
      state,
      updates
    );

    if (!afterContent) {
      return;
    }

    const editorContent = buildEditorContent(node.id, afterContent);

    const relativeSelection = getRelativeSelection(editor);
    editor.commands.setContent(editorContent, { emitUpdate: false });
    // Tiptap's React wrapper intentionally skips React rerenders for
    // transactions.  The document view itself must still be repainted here;
    // this is especially important after a remote update arrives while the
    // editor remains open in another client.
    editor.view.updateState(editor.state);

    if (relativeSelection != null) {
      restoreRelativeSelection(editor, relativeSelection);
    }
  }, [state, updates, editor, saveGeneration, node.id]);

  // Keep editorRef updated so handleKeyDown can access the current editor
  editorRef.current = editor;

  return (
    <>
      {editor && canEdit && (
        <Fragment>
          <ToolbarMenu editor={editor} />
          <ActionMenu editor={editor} />
          <AiWritingPanel
            editor={editor}
            currentSource={{
              nodeId: node.id,
              title:
                'name' in node && node.name?.trim()
                  ? node.name
                  : 'Current page',
              type: node.type,
            }}
            onUndo={() => {
              void performUndo({
                editor,
                ydoc: ydocRef.current,
                nodeId: node.id,
                userId: workspace.userId,
              });
            }}
            context={{
              userId: workspace.userId,
              documentId: node.id,
              accountId: workspace.accountId,
              workspaceId: workspace.workspaceId,
              rootId: node.rootId,
            }}
          />
        </Fragment>
      )}
      <EditorContent editor={editor} />
    </>
  );
};
