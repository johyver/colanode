import {
  CircleHelp,
  ExternalLink,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import {
  McpConnection,
  McpConnectionAuthMode,
  McpConnectionKind,
} from '@colanode/client/types/mcp';
import { Badge } from '@colanode/ui/components/ui/badge';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Label } from '@colanode/ui/components/ui/label';
import { Separator } from '@colanode/ui/components/ui/separator';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';

const SettingLabel = ({
  htmlFor,
  children,
  help,
}: {
  htmlFor: string;
  children: ReactNode;
  help: string;
}) => (
  <div className="flex items-center gap-1">
    <Label htmlFor={htmlFor}>{children}</Label>
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Help for ${children}`}
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {help}
      </TooltipContent>
    </Tooltip>
  </div>
);

const statusLabel: Record<McpConnection['status'], string> = {
  connected: 'Connected',
  error: 'Needs attention',
  unknown: 'Not checked',
  disabled: 'Disabled',
  reauthorization_required: 'Needs authorization',
};

const statusClass: Record<McpConnection['status'], string> = {
  connected: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  unknown: 'bg-muted text-muted-foreground',
  disabled: 'bg-muted text-muted-foreground',
  reauthorization_required: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const formatCheckedAt = (value: string | null) => {
  if (!value) return 'Not checked yet';
  return `Checked ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))}`;
};

const capabilitySummary = (connection: McpConnection) =>
  `${connection.capabilities.tools.length} tools · ${connection.capabilities.resources.length} resources · ${connection.capabilities.prompts.length} prompts`;

const McpToolPermissions = ({ connection }: { connection: McpConnection }) => {
  const workspace = useWorkspace();
  const policiesQuery = useQuery({
    type: 'mcp.tool-policies.get',
    userId: workspace.userId,
    connectionId: connection.id,
  });
  const auditQuery = useQuery({
    type: 'mcp.execution-audit.get',
    userId: workspace.userId,
    connectionId: connection.id,
  });
  const { mutate, isPending } = useMutation();
  const policies = policiesQuery.data?.policies ?? [];

  const policyFor = (toolName: string) =>
    policies.find((policy) => policy.agentId === '__workspace__' && policy.toolName === toolName);

  const savePolicy = (toolName: string, allowed: boolean, requireApproval: boolean) => {
    mutate({
      input: {
        type: 'mcp.tool-policy.upsert',
        userId: workspace.userId,
        connectionId: connection.id,
        toolName,
        allowed,
        requireApproval,
      },
      onSuccess() {
        void policiesQuery.refetch();
        toast.success(`${toolName} permission saved`);
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const pendingApprovals = (auditQuery.data?.audits ?? []).filter(
    (audit) => audit.status === 'approval_required'
  );

  return (
    <div className="mt-4 basis-full space-y-3 rounded-md bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4" />
        <span className="text-sm font-medium">Tool permissions</span>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Tool permission help">
              <CircleHelp className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            Every tool is denied until you explicitly allow it. Approval adds a second confirmation step before a tool runs. External tool responses never change these permissions.
          </TooltipContent>
        </Tooltip>
      </div>
      {connection.capabilities.tools.length ? (
        <div className="space-y-2">
          {connection.capabilities.tools.map((tool) => {
            const policy = policyFor(tool.name);
            const allowed = policy?.allowed ?? false;
            const requireApproval = policy?.requireApproval ?? (!tool.readOnlyHint || Boolean(tool.destructiveHint));
            return (
              <div key={tool.name} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    {allowed ? <ShieldCheck className="size-3.5 text-green-600" /> : <ShieldX className="size-3.5 text-muted-foreground" />}
                    <span className="font-medium">{tool.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tool.readOnlyHint ? 'Read-only hint' : 'Write-capable or unspecified'}{tool.destructiveHint ? ' · destructive hint' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={allowed} disabled={isPending} onChange={(event) => savePolicy(tool.name, event.target.checked, requireApproval)} />
                    Allow
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={requireApproval} disabled={isPending || !allowed} onChange={(event) => savePolicy(tool.name, allowed, event.target.checked)} />
                    Require approval
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Check the connection to discover tools before configuring permissions.</p>
      )}
      {pendingApprovals.length ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Pending approvals</p>
          {pendingApprovals.map((audit) => (
            <div key={audit.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>{audit.toolName} · {audit.correlationId}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => mutate({
                  input: { type: 'mcp.execution.approve', userId: workspace.userId, auditId: audit.id },
                  onSuccess() { void auditQuery.refetch(); toast.success('Tool execution approved'); },
                  onError(error) { toast.error(error.message); },
                })}
              >
                Approve
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const McpConnectionsSettings = () => {
  const workspace = useWorkspace();
  const connectionsQuery = useQuery({
    type: 'mcp.connections.get',
    userId: workspace.userId,
  });
  const { mutate, isPending } = useMutation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<McpConnectionKind>('local');
  const [authMode, setAuthMode] = useState<McpConnectionAuthMode>('token');
  const [authToken, setAuthToken] = useState('');
  const [oauthScope, setOauthScope] = useState('');
  const [pendingCheckId, setPendingCheckId] = useState<string | null>(null);

  const addConnection = () => {
    if (!name.trim() || !url.trim()) {
      toast.error('Add a name and MCP server URL first.');
      return;
    }

    mutate({
      input: {
        type: 'mcp.connection.upsert',
        userId: workspace.userId,
        name: name.trim(),
        url: url.trim(),
        kind,
        authMode,
        ...(authMode === 'token' ? { authToken: authToken.trim() } : {}),
        ...(authMode === 'oauth' && oauthScope.trim() ? { oauthScope: oauthScope.trim() } : {}),
      },
      onSuccess(connection) {
        setName('');
        setUrl('');
        setAuthToken('');
        setOauthScope('');
        void connectionsQuery.refetch();
        toast[connection.status === 'connected' ? 'success' : 'error'](
          connection.status === 'connected'
            ? `${connection.name} connected`
            : `${connection.name} saved, but health check needs attention`
        );
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const startOAuth = (connectionId: string) => {
    mutate({
      input: {
        type: 'mcp.connection.oauth.start',
        userId: workspace.userId,
        connectionId,
      },
      onSuccess(result) {
        void connectionsQuery.refetch();
        if (result.authorizationUrl) {
          window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer');
          toast.success('Authorization opened in a new tab.');
        } else {
          toast.error('This MCP server did not provide an authorization link.');
        }
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const checkConnection = (connectionId: string) => {
    setPendingCheckId(connectionId);
    mutate({
      input: {
        type: 'mcp.connection.check',
        userId: workspace.userId,
        connectionId,
      },
      onSuccess(connection) {
        setPendingCheckId(null);
        void connectionsQuery.refetch();
        toast[connection.status === 'connected' ? 'success' : 'error'](
          connection.status === 'connected'
            ? `${connection.name} is healthy`
            : `${connection.name} health check failed`
        );
      },
      onError(error) {
        setPendingCheckId(null);
        toast.error(error.message);
      },
    });
  };

  const removeConnection = (connection: McpConnection) => {
    mutate({
      input: {
        type: 'mcp.connection.delete',
        userId: workspace.userId,
        connectionId: connection.id,
      },
      onSuccess() {
        void connectionsQuery.refetch();
        toast.success(`${connection.name} removed`);
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">MCP Connections</h2>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Show MCP connection help"
              >
                <CircleHelp className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">
              Connect Colanode to an MCP server you explicitly approve. Remote servers must use HTTPS. Local servers are limited to localhost or loopback addresses.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Discover tools, resources, and prompts without transferring ChatGPT or Notion connection credentials.
        </p>
        <Separator className="mt-3" />
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-center gap-2 font-medium">
          <Plus className="size-4" />
          Add an MCP server
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <SettingLabel
              htmlFor="mcp-name"
              help="A friendly name shown only in this workspace."
            >
              Name
            </SettingLabel>
            <Input
              id="mcp-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My local Colanode server"
            />
          </div>
          <div className="space-y-2">
            <SettingLabel
              htmlFor="mcp-kind"
              help="Choose Local only for a server running on this Mac. Remote servers must use HTTPS."
            >
              Server type
            </SettingLabel>
            <select
              id="mcp-kind"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm"
              value={kind}
              onChange={(event) => setKind(event.target.value as McpConnectionKind)}
            >
              <option value="local">Local / localhost</option>
              <option value="remote">Remote / HTTPS</option>
            </select>
          </div>
          <div className="space-y-2">
            <SettingLabel
              htmlFor="mcp-auth-mode"
              help="Bearer token is for a token you paste yourself. OAuth opens the server's authorization page and stores the resulting tokens encrypted. No auth is for a server that does not require credentials."
            >
              Authentication
            </SettingLabel>
            <select
              id="mcp-auth-mode"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm"
              value={authMode}
              onChange={(event) => setAuthMode(event.target.value as McpConnectionAuthMode)}
            >
              <option value="token">Bearer token</option>
              <option value="oauth">OAuth 2.1</option>
              <option value="none">No authentication</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <SettingLabel
              htmlFor="mcp-url"
              help="Use your MCP endpoint URL. For the local Colanode server, include the workspace ID in the URL."
            >
              Server URL
            </SettingLabel>
            <Input
              id="mcp-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="http://127.0.0.1:3300/client/v1/mcp/<workspaceId>"
              type="url"
            />
          </div>
          {authMode === 'token' ? (
          <div className="space-y-2 md:col-span-2">
            <SettingLabel
              htmlFor="mcp-auth-token"
              help="The Bearer token is encrypted on the server and never shown after saving."
            >
              Bearer token
            </SettingLabel>
            <Input
              id="mcp-auth-token"
              value={authToken}
              onChange={(event) => setAuthToken(event.target.value)}
              placeholder="Paste only the token for this MCP server"
              type="password"
              autoComplete="off"
            />
          </div>
          ) : null}
          {authMode === 'oauth' ? (
            <div className="space-y-2 md:col-span-2">
              <SettingLabel
                htmlFor="mcp-oauth-scope"
                help="Optional space-separated OAuth scopes. Leave blank to use the scopes advertised by the MCP server."
              >
                OAuth scopes <span className="font-normal text-muted-foreground">(optional)</span>
              </SettingLabel>
              <Input
                id="mcp-oauth-scope"
                value={oauthScope}
                onChange={(event) => setOauthScope(event.target.value)}
                placeholder="Leave blank unless the server documents scopes"
              />
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Credentials are explicit per connection; existing ChatGPT/plugin credentials are never reused.
          </p>
          <Button onClick={addConnection} disabled={isPending}>
            {isPending ? <Spinner className="mr-2" /> : <Plus className="mr-2 size-4" />}
            Add &amp; test
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">Saved servers</h3>
        {connectionsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading connections…
          </div>
        ) : connectionsQuery.isError ? (
          <p className="text-sm text-destructive">{connectionsQuery.error.message}</p>
        ) : connectionsQuery.data?.connections.length ? (
          connectionsQuery.data.connections.map((connection) => (
            <div key={connection.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{connection.name}</span>
                    <Badge className={statusClass[connection.status]}>
                      {statusLabel[connection.status]}
                    </Badge>
                    <Badge variant="outline">
                      {connection.kind === 'local' ? 'Local' : 'Remote'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 break-all text-xs text-muted-foreground">
                    <ExternalLink className="size-3 shrink-0" /> {connection.url}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {capabilitySummary(connection)} · {formatCheckedAt(connection.lastCheckedAt)}
                    {connection.hasAuthToken
                      ? ' · Token stored securely'
                      : connection.hasOAuthCredentials
                        ? ' · OAuth credentials stored securely'
                        : ''}
                    {connection.circuitState === 'open' ? ' · Auto-retry paused briefly' : ''}
                  </p>
                  {connection.lastError ? (
                    <p className="text-xs text-destructive">{connection.lastError}</p>
                  ) : null}
                </div>
                <McpToolPermissions connection={connection} />
                <div className="flex shrink-0 gap-2">
                  {connection.authMode === 'oauth' && connection.reauthorizationRequired ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startOAuth(connection.id)}
                      disabled={isPending}
                    >
                      Authorize
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkConnection(connection.id)}
                    disabled={isPending || pendingCheckId === connection.id}
                  >
                    {pendingCheckId === connection.id ? (
                      <Spinner className="mr-2" />
                    ) : (
                      <RefreshCw className="mr-2 size-3.5" />
                    )}
                    Check
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${connection.name}`}
                    onClick={() => removeConnection(connection)}
                    disabled={isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No MCP servers connected yet.
          </p>
        )}
      </div>
    </div>
  );
};
