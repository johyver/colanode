/** Cross-platform document undo/redo shortcuts for the rich-text editor. */
type HistoryKeyboardEvent = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
>;

export type DocumentHistoryAction = 'undo' | 'redo';

export const getDocumentHistoryAction = (
  event: HistoryKeyboardEvent
): DocumentHistoryAction | null => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (key === 'y' && !event.shiftKey) {
    return 'redo';
  }

  return null;
};
