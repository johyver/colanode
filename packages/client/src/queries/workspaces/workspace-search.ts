import { LocalNode } from '@colanode/client/types';

export type WorkspaceSearchResult = {
  node: LocalNode;
  matchedIn: 'title' | 'content';
};

export type WorkspaceSearchQueryInput = {
  type: 'workspace.search';
  searchQuery: string;
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'workspace.search': {
      input: WorkspaceSearchQueryInput;
      output: WorkspaceSearchResult[];
    };
  }
}
