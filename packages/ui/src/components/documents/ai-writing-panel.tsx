import { useNavigate } from '@tanstack/react-router';
import { Editor } from '@tiptap/core';
import { Check, FileText, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AiChatMutationOutput } from '@colanode/client/mutations/workspaces/ai-chat';
import { WorkspaceRagCitation } from '@colanode/client/queries/workspaces/workspace-rag';
import { EditorContext } from '@colanode/client/types';
import { Button } from '@colanode/ui/components/ui/button';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

type AiWritingAction = 'rewrite' | 'summarize' | 'expand' | 'translate' | 'ask';

type SelectionRange = { from: number; to: number };
type ConversationMessage = { role: 'user' | 'assistant'; content: string };

const actionLabels: Record<AiWritingAction, string> = {
  rewrite: 'Rewrite',
  summarize: 'Summarize',
  expand: 'Expand',
  translate: 'Translate',
  ask: 'Ask about page',
};

const maxContextLength = 12000;

const getEditorText = (editor: Editor, range?: SelectionRange) => {
  const from = range?.from ?? 0;
  const to = range?.to ?? editor.state.doc.content.size;
  return editor.state.doc.textBetween(from, to, '\n\n').slice(0, maxContextLength).trim();
};

const buildInstruction = (
  action: AiWritingAction,
  question: string,
  targetLanguage: string
) => {
  switch (action) {
    case 'rewrite':
      return 'Rewrite the supplied selection for clarity and flow. Preserve the meaning. Return only the replacement text.';
    case 'summarize':
      return 'Summarize the supplied selection concisely. Return only the summary text.';
    case 'expand':
      return 'Expand the supplied selection with useful detail while preserving its tone and meaning. Return only the replacement text.';
    case 'translate':
      return `Translate the supplied selection into ${targetLanguage || 'English'}. Return only the translated text.`;
    case 'ask':
      return question.trim() || 'Explain the current page in a concise way.';
  }
};

interface AiWritingPanelProps {
  editor: Editor;
  context: EditorContext;
  onUndo: () => void;
  currentSource: Pick<WorkspaceRagCitation, 'nodeId' | 'title' | 'type'>;
}

export const AiWritingPanel = ({
  editor,
  context,
  onUndo,
  currentSource,
}: AiWritingPanelProps) => {
  const navigate = useNavigate();
  const { mutate, isPending } = useMutation();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<AiWritingAction>('rewrite');
  const [question, setQuestion] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewRange, setPreviewRange] = useState<SelectionRange | null>(null);
  const [previewMeta, setPreviewMeta] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [citations, setCitations] = useState<WorkspaceRagCitation[]>([]);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [appliedPreview, setAppliedPreview] = useState(false);

  const runAction = async () => {
    const selection = editor.state.selection;
    const selectedRange = selection.empty
      ? undefined
      : { from: selection.from, to: selection.to };
    const contextText = getEditorText(editor, selectedRange);

    if (!contextText) {
      toast.error('Select some text or add content to the page first.');
      return;
    }

    if (action === 'ask' && !question.trim()) {
      toast.error('Enter a question about the page.');
      return;
    }

    setPreview(null);
    setPreviewRange(null);
    setPreviewMeta(null);
    setAppliedPreview(false);

    let retrievedCitations: WorkspaceRagCitation[] = [];
    if (action === 'ask') {
      setIsRetrieving(true);
      try {
        retrievedCitations = await window.colanode.executeQuery({
          type: 'workspace.rag',
          userId: context.userId,
          query: question,
          limit: 6,
        });
        setCitations([
          {
            nodeId: currentSource.nodeId,
            title: currentSource.title,
            type: currentSource.type,
            excerpt: contextText,
            score: 1,
            updatedAt: null,
          },
          ...retrievedCitations.filter(
            (citation) => citation.nodeId !== currentSource.nodeId
          ),
        ].slice(0, 7));
      } catch (error) {
        setIsRetrieving(false);
        toast.error(
          `Workspace retrieval failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        return;
      } finally {
        setIsRetrieving(false);
      }
    } else {
      setCitations([]);
    }

    const sourcePrompt =
      action === 'ask'
        ? `\n\nAccessible workspace sources are listed below. They come only from the current user's local permission-filtered workspace index. Cite supporting claims with [1], [2], etc. If the sources do not support an answer, say that clearly and do not guess.\n\n${[
            {
              nodeId: currentSource.nodeId,
              title: currentSource.title,
              type: currentSource.type,
              excerpt: contextText,
            },
            ...retrievedCitations,
          ]
            .slice(0, 7)
            .map(
              (citation, index) =>
                `[${index + 1}] ${citation.title} (${citation.type})\n${citation.excerpt}`
            )
            .join('\n\n')}`
        : '';

    mutate({
      input: {
        type: 'ai.chat',
        userId: context.userId,
        messages: [
          {
            role: 'system',
            content:
              'You are the inline writing assistant for a Notion-style editor. Follow the requested operation exactly. Do not add commentary or markdown fences unless the user asks for them.',
          },
          ...conversation,
          {
            role: 'user',
            content: `${buildInstruction(action, question, targetLanguage)}\n\nSource context:\n${contextText}${sourcePrompt}`,
          },
        ],
        timeoutMs: 120000,
      },
      onSuccess(output: AiChatMutationOutput) {
        setPreviewMeta(`${output.usage.provider} / ${output.usage.model}`);
        if (action === 'ask') {
          setConversation((messages) => [
            ...messages,
            { role: 'user', content: question.trim() },
            { role: 'assistant', content: output.message.content.trim() },
          ]);
          setPreview(null);
          setPreviewRange(null);
        } else {
          setPreview(output.message.content.trim());
          setPreviewRange(selectedRange ?? null);
        }
      },
      onError(error) {
        toast.error(`AI writing request failed: ${error.message}`);
      },
    });
  };

  const isBusy = isPending || isRetrieving;

  const applyPreview = () => {
    if (!preview || !previewRange) {
      toast.error('Select text before applying an inline edit.');
      return;
    }

    editor.chain().focus().insertContentAt(previewRange, preview).run();
    setPreview(null);
    setPreviewRange(null);
    setPreviewMeta(null);
    setAppliedPreview(true);
    toast.success('AI preview applied. Undo is available if needed.');
  };

  return (
    <div className="fixed right-5 top-5 z-40 w-80 max-w-[calc(100vw-2rem)]">
      {!open ? (
        <Button
          type="button"
          variant="outline"
          className="bg-background shadow-md"
          onClick={() => setOpen(true)}
          aria-label="Open AI writing assistant"
        >
          <Sparkles className="size-4" />
          AI writing
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border bg-background p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">AI writing sidebar</p>
              <p className="text-xs text-muted-foreground">
                Preview first. Nothing changes until you apply it.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close AI writing assistant"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(actionLabels) as AiWritingAction[]).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={action === item ? 'default' : 'outline'}
                onClick={() => setAction(item)}
              >
                {actionLabels[item]}
              </Button>
            ))}
          </div>

          {action === 'translate' && (
            <input
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value)}
              placeholder="Target language"
              aria-label="Target language"
            />
          )}

          {action === 'ask' && (
            <div className="space-y-2">
              {conversation.length > 0 && (
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-2">
                  {conversation.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={message.role === 'user' ? 'text-sm' : 'text-sm text-muted-foreground'}
                    >
                      <span className="font-medium">
                        {message.role === 'user' ? 'You' : 'AI'}:
                      </span>{' '}
                      {message.content}
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about the current page…"
                aria-label="Question about current page"
                rows={3}
              />
              {conversation.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConversation([])}
                >
                  Clear conversation
                </Button>
              )}
            </div>
          )}

          <Button type="button" className="w-full" onClick={runAction} disabled={isBusy}>
            <Sparkles className="size-4" />
            {isRetrieving ? 'Searching workspace…' : isPending ? 'Thinking…' : 'Generate preview'}
          </Button>

          {action === 'ask' && citations.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sources from your accessible workspace
              </p>
              {citations.map((citation, index) => (
                <button
                  key={`${citation.nodeId}-${index}`}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-background"
                  onClick={() => {
                    void navigate({
                      to: '/workspace/$userId/$nodeId',
                      params: {
                        userId: context.userId,
                        nodeId: citation.nodeId,
                      },
                    });
                  }}
                >
                  <FileText className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      [{index + 1}] {citation.title}
                    </span>
                    <span className="block line-clamp-2 text-xs text-muted-foreground">
                      {citation.excerpt}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {preview !== null && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview{previewMeta ? ` · ${previewMeta}` : ''}
              </p>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm">
                {preview || 'The provider returned an empty response.'}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={applyPreview}
                  disabled={!previewRange || !preview}
                >
                  <Check className="size-4" />
                  Apply to selection
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setPreviewRange(null);
                    setPreviewMeta(null);
                  }}
                >
                  Discard
                </Button>
              </div>
              {!previewRange && (
                <p className="text-xs text-muted-foreground">
                  This is a page answer. Select text to apply an inline edit.
                </p>
              )}
            </div>
          )}
          {appliedPreview && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onUndo();
                setAppliedPreview(false);
              }}
            >
              Undo last edit
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
