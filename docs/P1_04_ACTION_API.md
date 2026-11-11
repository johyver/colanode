# P1-04 — Authenticated role-scoped workspace action API

This adds an incremental business API for future MCP and agent clients. It does
not create a second document database, connect to Notion, or bypass Colanode's
native CRDT and synchronization model.

## Endpoints

Both endpoints use the existing account Bearer token and workspace membership
plugin, with a dedicated Redis-backed limit of 40 action requests per device and
workspace per 60 seconds.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /client/v1/workspaces/:workspaceId/actions/nodes/:nodeId | Read one node after checking membership and inherited node viewer rights |
| POST | /client/v1/workspaces/:workspaceId/actions/mutations | Apply exactly one schema-validated native Colanode mutation |

The POST body contains a mutation object. For example, the mutation may have
a unique ID, a createdAt timestamp, a type of node.create or node.delete, and
data conforming to the standard native Colanode mutation schema. The API does
not accept arbitrary commands or SQL.

## Authorization, audit, and safety

- Authentication is the existing verified device token. Callers cannot choose
  the actor, workspace membership, or role.
- Workspace authentication rejects removed users, none roles, and nonmembers.
- Reads check that the complete node tree belongs to the requested workspace
  and that the actor has an inherited native viewer node role. Foreign-workspace
  nodes return 404. Private nodes without read permission return 403.
- Writes use the shared executeWorkspaceMutation dispatcher and existing native
  CRDT-safe operations. Target nodes from other workspaces are rejected even
  before idempotency checks; newly created children cannot use foreign parents.
- Guests cannot create workspace-level spaces under the native node policy.
  Admins cannot invite owners or peer admins, and owners cannot delegate
  ownership through invitations. Invalid role batches are rejected before
  any account creation or invitation email occurs.
- File uploads and downloads require that the underlying file node belongs
  to the authenticated workspace.
- Native node and document update history retain actor and workspace metadata.
  API responses and server logs add request ID, workspace ID, actor user ID,
  action, mutation ID when applicable, result, and server timestamp. Never
  record tokens or document bodies in audit logs.
- Invalid, unauthorized, missing, and rate-limited requests return HTTP
  400, 401, 403, 404, or 429 as appropriate, rather than success responses.
- The global account device quota of 100 requests/minute remains. The
  dedicated 40 requests/workspace/minute action quota is additional.

## Validation

The workspace-actions integration tests use disposable PostgreSQL and Redis
containers to cover missing authentication, owner and guest rights, foreign
workspace references in both new actions and legacy mutation sync, file scope,
native mutation provenance, impersonation prevention, invitation role grants,
schema allowlisting, and HTTP 429 rate limits.

## Scope and migration freeze

This is not external MCP/OAuth token management, a general agent runtime,
a universal SQL endpoint, full Notion parity, or a migration service. Those
are future tasks. Do not access or migrate any real Notion data until the
full project is complete, validated, and separately approved for cutover.
