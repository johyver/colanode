import {
  ApiErrorCode,
  extractNodeRole,
  hasNodeRole,
  Mutation,
  MutationStatus,
  Node,
} from '@colanode/core';
import { updateDocumentFromMutation } from '@colanode/server/lib/documents';
import {
  markNodeAsOpened,
  markNodeAsSeen,
} from '@colanode/server/lib/node-interactions';
import {
  createNodeReaction,
  deleteNodeReaction,
} from '@colanode/server/lib/node-reactions';
import {
  createNodeFromMutation,
  updateNodeFromMutation,
  deleteNodeFromMutation,
  fetchNode,
  fetchNodeTree,
  mapNode,
} from '@colanode/server/lib/nodes';
import { WorkspaceContext } from '@colanode/server/types/api';

export type ReadActionResult =
  | { status: 200; node: Node }
  | { status: 403 | 404; code: ApiErrorCode };

// Both workspace membership and node collaboration rights are required.
export const readWorkspaceNode = async (
  workspace: WorkspaceContext,
  nodeId: string
): Promise<ReadActionResult> => {
  const tree = await fetchNodeTree(nodeId);
  if (
    tree.length === 0 ||
    tree.some((node) => node.workspace_id !== workspace.id)
  ) {
    return { status: 404, code: ApiErrorCode.NotFound };
  }

  const nodes = tree.map(mapNode);
  const role = extractNodeRole(nodes, workspace.user.id);
  if (role === null || !hasNodeRole(role, 'viewer')) {
    return { status: 403, code: ApiErrorCode.Forbidden };
  }

  return { status: 200, node: nodes[nodes.length - 1]! };
};

// Shared by native sync and the typed business action API. Scope checks run
// BEFORE native mutation idempotency shortcuts to prevent cross-tenant writes.
export const executeWorkspaceMutation = async (
  workspace: WorkspaceContext,
  mutation: Mutation
): Promise<MutationStatus> => {
  const nodeId =
    mutation.type === 'document.update'
      ? mutation.data.documentId
      : mutation.data.nodeId;

  const existing = await fetchNode(nodeId);
  if (existing && existing.workspace_id !== workspace.id) {
    return MutationStatus.FORBIDDEN;
  }

  if (
    (mutation.type === 'node.interaction.seen' ||
      mutation.type === 'node.interaction.opened') &&
    mutation.data.collaboratorId !== workspace.user.id
  ) {
    return MutationStatus.FORBIDDEN;
  }

  if (mutation.type === 'node.create') {
    return await createNodeFromMutation(workspace, mutation.data);
  } else if (mutation.type === 'node.update') {
    return await updateNodeFromMutation(workspace, mutation.data);
  } else if (mutation.type === 'node.delete') {
    return await deleteNodeFromMutation(workspace, mutation.data);
  } else if (mutation.type === 'node.reaction.create') {
    return await createNodeReaction(workspace, mutation);
  } else if (mutation.type === 'node.reaction.delete') {
    return await deleteNodeReaction(workspace, mutation);
  } else if (mutation.type === 'node.interaction.seen') {
    return await markNodeAsSeen(workspace, mutation);
  } else if (mutation.type === 'node.interaction.opened') {
    return await markNodeAsOpened(workspace, mutation);
  } else if (mutation.type === 'document.update') {
    return await updateDocumentFromMutation(workspace, mutation.data);
  }

  return MutationStatus.METHOD_NOT_ALLOWED;
};
