export type WorkspaceRagCitation = {
  nodeId: string;
  title: string;
  type: string;
  excerpt: string;
  score: number;
  updatedAt: string | null;
};

export type WorkspaceRagQueryInput = {
  type: 'workspace.rag';
  query: string;
  userId: string;
  limit?: number;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'workspace.rag': {
      input: WorkspaceRagQueryInput;
      output: WorkspaceRagCitation[];
    };
  }
}
