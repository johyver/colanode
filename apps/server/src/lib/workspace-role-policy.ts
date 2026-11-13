import { WorkspaceRole } from '@colanode/core';

// Invitations are not ownership transfers. An admin cannot create peers or
// an owner; a collaborator/guest cannot invite anyone.
export const canInviteWorkspaceRole = (
  actor: WorkspaceRole,
  proposed: WorkspaceRole
): boolean => {
  if (actor === 'owner') {
    return (
      proposed === 'admin' ||
      proposed === 'collaborator' ||
      proposed === 'guest'
    );
  }

  if (actor === 'admin') {
    return proposed === 'collaborator' || proposed === 'guest';
  }

  return false;
};
