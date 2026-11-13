import { describe, expect, it } from 'vitest';

import { getDocumentHistoryAction } from '../src/lib/document-history-shortcuts';

const shortcut = (
  key: string,
  options: Partial<
    Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
  > = {}
) =>
  getDocumentHistoryAction({
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
  });

describe('cross-platform document history shortcuts', () => {
  it('supports Cmd+Z, Cmd+Shift+Z, and Cmd+Y', () => {
    expect(shortcut('z', { metaKey: true })).toBe('undo');
    expect(shortcut('Z', { metaKey: true, shiftKey: true })).toBe('redo');
    expect(shortcut('y', { metaKey: true })).toBe('redo');
  });
  it('supports Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y', () => {
    expect(shortcut('z', { ctrlKey: true })).toBe('undo');
    expect(shortcut('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(shortcut('y', { ctrlKey: true })).toBe('redo');
  });
  it('does not intercept unmodified typing, Alt or other shortcuts', () => {
    expect(shortcut('z')).toBeNull();
    expect(shortcut('z', { metaKey: true, altKey: true })).toBeNull();
    expect(shortcut('a', { metaKey: true })).toBeNull();
    expect(shortcut('y', { metaKey: true, shiftKey: true })).toBeNull();
  });
});
