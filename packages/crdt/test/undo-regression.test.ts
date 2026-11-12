import { describe, expect, it } from 'vitest';

import { generateId, IdType, richTextContentSchema } from '@colanode/core';

import { YDoc } from '../src/index';

const pageId = '01PAGEAAAAAAAAAAAAAAAAAAAAAAAAAApg';
const blockId = generateId(IdType.Block);

const object = (text: string) => ({
  type: 'rich_text' as const,
  blocks: {
    [blockId]: {
      id: blockId,
      index: 'a0',
      parentId: pageId,
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text }],
    },
  },
});

const getText = (doc: YDoc) => {
  const blocks = doc.getObject<ReturnType<typeof object>>().blocks;
  return blocks[blockId]?.content[0]?.text;
};

describe('YDoc rich-text undo/redo safety', () => {
  it('keeps every intermediate hydrated edit as a distinct undo step', () => {
    const seed = new YDoc();
    const initial = seed.update(richTextContentSchema, object('a'))!;
    const doc = new YDoc(initial);
    doc.update(richTextContentSchema, object('ab'));
    doc.update(richTextContentSchema, object('abc'));

    expect(getText(doc)).toBe('abc');
    expect(doc.undo(richTextContentSchema)).toBeTruthy();
    expect(getText(doc)).toBe('ab');
    expect(doc.undo(richTextContentSchema)).toBeTruthy();
    expect(getText(doc)).toBe('a');
    expect(doc.redo(richTextContentSchema)).toBeTruthy();
    expect(getText(doc)).toBe('ab');
    expect(doc.redo(richTextContentSchema)).toBeTruthy();
    expect(getText(doc)).toBe('abc');
    expect(richTextContentSchema.safeParse(doc.getObject()).success).toBe(true);
  });

  it('does not emit invalid empty state when undoing first new-document edit', () => {
    const doc = new YDoc();
    doc.update(richTextContentSchema, object('first'));
    // Yjs CRDT state bytes include rollback tombstones; validate logical state
    // and ensure no invalid sync update escapes rather than comparing bytes.
    expect(doc.undo(richTextContentSchema)).toBeNull();
    expect(doc.getObject()).toEqual(object('first'));
    expect(richTextContentSchema.safeParse(doc.getObject()).success).toBe(true);
  });

  it('keeps new-document first content and undoes only second edit', () => {
    const doc = new YDoc();
    doc.update(richTextContentSchema, object('a'));
    doc.update(richTextContentSchema, object('ab'));
    expect(doc.undo(richTextContentSchema)).toBeTruthy();
    expect(doc.getObject()).toEqual(object('a'));
    expect(doc.undo(richTextContentSchema)).toBeNull();
    expect(doc.getObject()).toEqual(object('a'));
  });

  it('reconciles offline edits on separate blocks without discarding remote changes', () => {
    const secondBlockId = generateId(IdType.Block);
    const baseline = {
      ...object('alpha'),
      blocks: {
        ...object('alpha').blocks,
        [secondBlockId]: {
          id: secondBlockId,
          index: 'b0',
          parentId: pageId,
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: 'beta' }],
        },
      },
    };
    const original = new YDoc();
    original.update(richTextContentSchema, baseline);
    const left = new YDoc(original.getState());
    const right = new YDoc(original.getState());

    const leftEdit = left.update(richTextContentSchema, {
      ...baseline,
      blocks: {
        ...baseline.blocks,
        [blockId]: object('alpha changed').blocks[blockId],
      },
    })!;
    const rightEdit = right.update(richTextContentSchema, {
      ...baseline,
      blocks: {
        ...baseline.blocks,
        [secondBlockId]: {
          ...baseline.blocks[secondBlockId],
          content: [{ type: 'text' as const, text: 'beta changed' }],
        },
      },
    })!;

    left.applyUpdate(rightEdit);
    right.applyUpdate(leftEdit);
    expect(left.getObject()).toEqual(right.getObject());
    expect(richTextContentSchema.safeParse(left.getObject()).success).toBe(
      true
    );
    const converged = left.getObject<typeof baseline>();
    expect(converged.blocks[blockId].content[0].text).toBe('alpha changed');
    expect(converged.blocks[secondBlockId].content[0].text).toBe(
      'beta changed'
    );

    // Undo only the local transaction, preserving the remote client's edit.
    const undo = left.undo(richTextContentSchema);
    expect(undo).toBeTruthy();
    if (undo) right.applyUpdate(undo);
    expect(left.getObject()).toEqual(right.getObject());
    const final = left.getObject<typeof baseline>();
    expect(final.blocks[blockId].content[0].text).toBe('alpha');
    expect(final.blocks[secondBlockId].content[0].text).toBe('beta changed');
  });

  it('syncs only schema-valid undo/redo mutations between two Yjs clients', () => {
    const seed = new YDoc();
    seed.update(richTextContentSchema, object('a'));
    const left = new YDoc(seed.getState());
    const right = new YDoc(seed.getState());
    const edit1 = left.update(richTextContentSchema, object('ab'))!;
    right.applyUpdate(edit1);
    const edit2 = left.update(richTextContentSchema, object('abc'))!;
    right.applyUpdate(edit2);
    const undo = left.undo(richTextContentSchema)!;
    expect(undo).toBeTruthy();
    right.applyUpdate(undo);
    expect(getText(left)).toBe('ab');
    expect(getText(right)).toBe('ab');
    const redo = left.redo(richTextContentSchema)!;
    expect(redo).toBeTruthy();
    right.applyUpdate(redo);
    expect(getText(left)).toBe('abc');
    expect(getText(right)).toBe('abc');
    expect(richTextContentSchema.safeParse(right.getObject()).success).toBe(
      true
    );
  });
});
