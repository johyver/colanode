import { LocalNode } from '@colanode/client/types';

export type Tombstone = {
  node: LocalNode;
  deletedAt: string;
};

export type TombstonesListQueryInput = {
  type: 'tombstones.list';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'tombstones.list': {
      input: TombstonesListQueryInput;
      output: Tombstone[];
    };
  }
}
