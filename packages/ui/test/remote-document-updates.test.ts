// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import type { DocumentState, DocumentUpdate } from '@colanode/client/types';
import { generateId, IdType, richTextContentSchema } from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';

import { applyRemoteDocumentUpdates } from '../src/lib/remote-document-updates';

const pageId = generateId(IdType.Page);
const firstId = generateId(IdType.Block);
const secondId = generateId(IdType.Block);
const build = (first: string, second: string) => ({
  type: 'rich_text' as const,
  blocks: {
    [firstId]: {
      id: firstId,
      type: 'paragraph' as const,
      index: 'a0',
      parentId: pageId,
      content: [{ type: 'text' as const, text: first }],
    },
    [secondId]: {
      id: secondId,
      type: 'paragraph' as const,
      index: 'a1',
      parentId: pageId,
      content: [{ type: 'text' as const, text: second }],
    },
  },
});
const get = (ydoc: YDoc) => ydoc.getObject<ReturnType<typeof build>>();
const updates = (data: Uint8Array): DocumentUpdate[] => [
  { id: 'update-remote', documentId: pageId, data: encodeState(data) },
];
const snapshot = (doc: YDoc): DocumentState => ({
  id: pageId,
  revision: 'same-checkpoint-revision',
  state: doc.getEncodedState(),
});

describe('reconcile remote document updates without a checkpoint revision change', () => {
  it('applies newly received Yjs updates while the checkpoint revision is unchanged', () => {
    const seed = new YDoc();
    seed.update(richTextContentSchema, build('Alpha', 'Beta'));
    const local = new YDoc(seed.getState());
    const other = new YDoc(seed.getState());
    const remote = other.update(
      richTextContentSchema,
      build('Alpha', 'Beta RIGHT')
    )!;
    expect(
      applyRemoteDocumentUpdates(local, snapshot(seed), updates(remote))
    ).toEqual(build('Alpha', 'Beta RIGHT'));
    expect(get(local)).toEqual(build('Alpha', 'Beta RIGHT'));
  });

  it('merges an offline edit and remote edit without erasing local undo history', () => {
    const seed = new YDoc();
    seed.update(richTextContentSchema, build('Alpha', 'Beta'));
    const local = new YDoc(seed.getState());
    const other = new YDoc(seed.getState());
    local.update(richTextContentSchema, build('Alpha LEFT', 'Beta'));
    const remote = other.update(
      richTextContentSchema,
      build('Alpha', 'Beta RIGHT')
    )!;

    const result = applyRemoteDocumentUpdates(
      local,
      snapshot(seed),
      updates(remote)
    );
    expect(result).toEqual(build('Alpha LEFT', 'Beta RIGHT'));
    expect(local.undo(richTextContentSchema)).toBeTruthy();
    expect(get(local)).toEqual(build('Alpha', 'Beta RIGHT'));
  });

  it('refuses a schema-invalid binary update without modifying the live editor state', () => {
    const seed = new YDoc();
    seed.update(richTextContentSchema, build('Alpha', 'Beta'));
    const local = new YDoc(seed.getState());
    const attack = new Y.Doc();
    Y.applyUpdate(attack, seed.getState());
    const stateVector = Y.encodeStateVector(attack);
    attack.getMap('object').set('type', 'not_a_rich_text_document');
    const invalidUpdate = Y.encodeStateAsUpdate(attack, stateVector);
    const before = get(local);

    expect(
      applyRemoteDocumentUpdates(local, snapshot(seed), updates(invalidUpdate))
    ).toBeNull();
    expect(get(local)).toEqual(before);
  });

  it('rejects unreadable Yjs payloads without corrupting the live editor', () => {
    const seed = new YDoc();
    seed.update(richTextContentSchema, build('Alpha', 'Beta'));
    const local = new YDoc(seed.getState());

    expect(
      applyRemoteDocumentUpdates(
        local,
        snapshot(seed),
        updates(new Uint8Array([1, 2, 3]))
      )
    ).toBeNull();
    expect(get(local)).toEqual(build('Alpha', 'Beta'));
  });

  it('accepts valid new page updates even when no prior checkpoint exists', () => {
    const fresh = new YDoc();
    const initial = fresh.update(
      richTextContentSchema,
      build('First', 'Second')
    )!;
    const empty = new YDoc();

    expect(applyRemoteDocumentUpdates(empty, null, updates(initial))).toEqual(
      build('First', 'Second')
    );
  });
});
