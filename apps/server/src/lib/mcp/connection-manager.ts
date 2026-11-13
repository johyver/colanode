import { randomUUID } from 'node:crypto';

import {
  auth,
  UnauthorizedError,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import type {
  McpCapability,
  McpConnectionAuthMode,
  McpConnectionCapabilities,
  McpConnectionKind,
  McpConnectionStatus,
  SelectMcpConnection,
} from '@colanode/server/data/schema';
import { config } from '@colanode/server/lib/config';

import { decryptCredential, encryptCredential } from '../ai/credential-crypto';

const DISCOVERY_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2_000;
const CIRCUIT_COOLDOWN_MS = 30_000;

type OAuthPayload = {
  kind: 'oauth';
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformationMixed;
};

export type McpConnectionMetadata = {
  id: string;
  name: string;
  url: string;
  kind: McpConnectionKind;
  enabled: boolean;
  authMode: McpConnectionAuthMode;
  status: McpConnectionStatus;
  lastError: string | null;
  capabilities: McpConnectionCapabilities;
  lastCheckedAt: string | null;
  hasAuthToken: boolean;
  hasOAuthCredentials: boolean;
  reauthorizationRequired: boolean;
  authorizationUrl: string | null;
  retryCount: number;
  circuitState: 'closed' | 'open' | 'half_open';
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type ConnectedMcpClient = {
  client: Client;
  close: () => Promise<void>;
};

export type McpConnectionInput = {
  accountId: string;
  workspaceId: string;
  id?: string;
  name: string;
  url: string;
  kind: McpConnectionKind;
  enabled?: boolean;
  authMode?: McpConnectionAuthMode;
  authToken?: string;
  oauthScope?: string;
};

export class McpReauthorizationRequiredError extends Error {
  public constructor(message = 'MCP authorization is required.') {
    super(message);
    this.name = 'McpReauthorizationRequiredError';
  }
}

const emptyCapabilities = (): McpConnectionCapabilities => ({
  tools: [],
  resources: [],
  prompts: [],
});

const connectionMasterKey = (): string =>
  process.env.MCP_CREDENTIALS_MASTER_KEY ??
  (config.ai.enabled ? config.ai.credentialsMasterKey : '');

const toCapability = (value: {
  name?: string;
  uri?: string;
  title?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}): McpCapability => ({
  name: value.name ?? value.uri ?? 'unnamed',
  ...(value.title ? { title: value.title } : {}),
  ...(value.description ? { description: value.description } : {}),
  ...(value.annotations?.readOnlyHint !== undefined
    ? { readOnlyHint: value.annotations.readOnlyHint }
    : {}),
  ...(value.annotations?.destructiveHint !== undefined
    ? { destructiveHint: value.annotations.destructiveHint }
    : {}),
});

const toMetadata = (connection: SelectMcpConnection): McpConnectionMetadata => ({
  id: connection.id,
  name: connection.name,
  url: connection.url,
  kind: connection.kind,
  enabled: connection.enabled,
  authMode: connection.auth_mode,
  status: connection.status,
  lastError: connection.last_error,
  capabilities: connection.capabilities ?? emptyCapabilities(),
  lastCheckedAt: connection.last_checked_at?.toISOString() ?? null,
  hasAuthToken: connection.auth_mode === 'token' && Boolean(connection.auth_ciphertext),
  hasOAuthCredentials: connection.auth_mode === 'oauth' && Boolean(connection.auth_ciphertext),
  reauthorizationRequired: connection.status === 'reauthorization_required',
  authorizationUrl: connection.oauth_authorization_url,
  retryCount: connection.retry_count,
  circuitState: connection.circuit_state,
  nextRetryAt: connection.next_retry_at?.toISOString() ?? null,
  createdAt: connection.created_at.toISOString(),
  updatedAt: connection.updated_at?.toISOString() ?? null,
});

const validateUrl = (value: string, kind: McpConnectionKind): string => {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('MCP server URL is invalid.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('MCP server URL must use HTTP or HTTPS.');
  }
  const hostname = parsed.hostname.toLowerCase();
  const isLocal =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';
  if (kind === 'local' && !isLocal) {
    throw new Error('Local connections must target localhost or loopback.');
  }
  if (kind === 'remote' && isLocal) {
    throw new Error('Loopback servers must be marked as approved local connections.');
  }
  if (kind === 'remote' && parsed.protocol !== 'https:') {
    throw new Error('Remote MCP connections must use HTTPS.');
  }
  return parsed.toString();
};

const withTimeout = async <T>(promise: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('MCP discovery timed out.')),
          DISCOVERY_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const requireMasterKey = (): string => {
  const masterKey = connectionMasterKey();
  if (!masterKey.trim()) {
    throw new Error(
      'MCP credential storage is not configured. Set MCP_CREDENTIALS_MASTER_KEY or AI_CREDENTIALS_MASTER_KEY on the server.'
    );
  }
  return masterKey;
};

const decryptSecret = (
  ciphertext: string | null,
  iv: string | null,
  authTag: string | null
): string | undefined => {
  if (!ciphertext || !iv || !authTag) return undefined;
  return decryptCredential({ ciphertext, iv, authTag }, requireMasterKey());
};

const encryptSecret = (value: string) => encryptCredential(value, requireMasterKey());

const parseOAuthPayload = (connection: SelectMcpConnection): OAuthPayload => {
  const raw = decryptSecret(connection.auth_ciphertext, connection.auth_iv, connection.auth_tag);
  if (!raw) return { kind: 'oauth' };
  try {
    const parsed = JSON.parse(raw) as OAuthPayload;
    return parsed.kind === 'oauth' ? parsed : { kind: 'oauth' };
  } catch {
    return { kind: 'oauth' };
  }
};

const oauthCallbackBaseUrl = (connectionId: string): string => {
  const configuredBase = process.env.MCP_PUBLIC_BASE_URL?.trim();
  const base = configuredBase
    ? configuredBase.replace(/\/$/, '')
    : config.web
      ? `${config.web.protocol}://${config.web.domain}`
      : 'http://127.0.0.1:3300';
  const prefix = config.pathPrefix ? `/${config.pathPrefix}` : '';
  return `${base}${prefix}/client/v1/mcp/oauth/callback/${connectionId}`;
};

const isOAuthRequired = (error: unknown): boolean =>
  error instanceof UnauthorizedError || error instanceof McpReauthorizationRequiredError;

const retryDelay = (attempt: number) =>
  Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

class StoredOAuthProvider implements OAuthClientProvider {
  public readonly redirectUrl: string;
  public readonly clientMetadata: OAuthClientMetadata;
  public readonly clientMetadataUrl = undefined;

  public constructor(
    private readonly manager: McpConnectionManager,
    private connection: SelectMcpConnection
  ) {
    this.redirectUrl = oauthCallbackBaseUrl(connection.id);
    this.clientMetadata = {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Colanode MCP connection',
      scope: connection.oauth_scope ?? undefined,
    };
  }

  private async refresh() {
    const connection = await this.manager.findById(this.connection.id);
    if (!connection) throw new McpReauthorizationRequiredError();
    this.connection = connection;
    return connection;
  }

  public async state() {
    const state = randomUUID();
    await this.manager.updateOAuthState(this.connection.id, {
      oauth_pending_state: state,
      oauth_authorization_url: null,
    });
    return state;
  }

  public async clientInformation() {
    return parseOAuthPayload(await this.refresh()).clientInformation;
  }

  public async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    const connection = await this.refresh();
    await this.manager.saveOAuthPayload(connection, {
      ...parseOAuthPayload(connection),
      clientInformation,
    });
  }

  public async tokens() {
    return parseOAuthPayload(await this.refresh()).tokens;
  }

  public async saveTokens(tokens: OAuthTokens) {
    const connection = await this.refresh();
    await this.manager.saveOAuthPayload(connection, {
      ...parseOAuthPayload(connection),
      tokens,
    });
    await this.manager.updateOAuthState(connection.id, {
      auth_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      oauth_pending_state: null,
      oauth_pending_ciphertext: null,
      oauth_pending_iv: null,
      oauth_pending_tag: null,
      oauth_authorization_url: null,
      status: 'connected',
      last_error: null,
    });
  }

  public async redirectToAuthorization(authorizationUrl: URL) {
    await this.manager.updateOAuthState(this.connection.id, {
      oauth_authorization_url: authorizationUrl.toString(),
      status: 'reauthorization_required',
      last_error: 'Authorization is required. Open the authorization link to continue.',
    });
  }

  public async saveCodeVerifier(codeVerifier: string) {
    const encrypted = encryptSecret(codeVerifier);
    await this.manager.updateOAuthState(this.connection.id, {
      oauth_pending_ciphertext: encrypted.ciphertext,
      oauth_pending_iv: encrypted.iv,
      oauth_pending_tag: encrypted.authTag,
    });
  }

  public async codeVerifier() {
    const connection = await this.refresh();
    const verifier = decryptSecret(
      connection.oauth_pending_ciphertext,
      connection.oauth_pending_iv,
      connection.oauth_pending_tag
    );
    if (!verifier) {
      throw new McpReauthorizationRequiredError('The OAuth authorization attempt expired. Start again.');
    }
    return verifier;
  }

  public async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    const connection = await this.refresh();
    const payload = parseOAuthPayload(connection);
    await this.manager.saveOAuthPayload(connection, {
      ...payload,
      ...(scope === 'all' || scope === 'client' ? { clientInformation: undefined } : {}),
      ...(scope === 'all' || scope === 'tokens' ? { tokens: undefined } : {}),
    });
    await this.manager.updateOAuthState(connection.id, {
      ...(scope === 'all' || scope === 'discovery' ? { oauth_discovery_state: null } : {}),
      ...(scope === 'all' || scope === 'verifier'
        ? {
            oauth_pending_ciphertext: null,
            oauth_pending_iv: null,
            oauth_pending_tag: null,
          }
        : {}),
      ...(scope === 'all' || scope === 'tokens' ? { auth_expires_at: null } : {}),
    });
  }

  public async saveDiscoveryState(state: OAuthDiscoveryState) {
    await this.manager.updateOAuthState(this.connection.id, {
      oauth_discovery_state: state as unknown as Record<string, unknown>,
    });
  }

  public async discoveryState() {
    return (await this.refresh()).oauth_discovery_state as OAuthDiscoveryState | null ?? undefined;
  }
}

export const connectMcpClient = async (
  connection: SelectMcpConnection,
  manager: McpConnectionManager
): Promise<ConnectedMcpClient> => {
  const headers: Record<string, string> = {};
  const oauthProvider =
    connection.auth_mode === 'oauth' ? new StoredOAuthProvider(manager, connection) : undefined;

  if (
    oauthProvider &&
    connection.auth_expires_at &&
    connection.auth_expires_at.getTime() <= Date.now()
  ) {
    const payload = parseOAuthPayload(connection);
    if (!payload.tokens?.refresh_token) {
      await manager.updateOAuthState(connection.id, {
        status: 'reauthorization_required',
        last_error: 'MCP OAuth access token expired and no refresh token is available.',
      });
      throw new McpReauthorizationRequiredError(
        'MCP OAuth access token expired. Reauthorize this connection.'
      );
    }
  }

  if (connection.auth_mode === 'token') {
    const token = decryptSecret(connection.auth_ciphertext, connection.auth_iv, connection.auth_tag);
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (oauthProvider) {
    let result: Awaited<ReturnType<typeof auth>>;
    try {
      result = await auth(oauthProvider, {
        serverUrl: connection.url,
        scope: connection.oauth_scope ?? undefined,
      });
    } catch (error) {
      throw new McpReauthorizationRequiredError(
        error instanceof Error
          ? `OAuth authorization is required or unavailable: ${error.message}`
          : 'OAuth authorization is required or unavailable.'
      );
    }
    if (result !== 'AUTHORIZED') throw new McpReauthorizationRequiredError();
  }

  const client = new Client({ name: 'colanode-mcp-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
    ...(oauthProvider ? { authProvider: oauthProvider } : {}),
    requestInit: { headers },
  });
  await withTimeout(client.connect(transport));
  return {
    client,
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
};

const discover = async (
  connection: SelectMcpConnection,
  manager: McpConnectionManager
): Promise<McpConnectionCapabilities> => {
  const connected = await connectMcpClient(connection, manager);
  const { client } = connected;
  try {
    const [tools, resources, prompts] = await Promise.all([
      withTimeout(client.listTools()).catch(() => ({ tools: [] })),
      withTimeout(client.listResources()).catch(() => ({ resources: [] })),
      withTimeout(client.listPrompts()).catch(() => ({ prompts: [] })),
    ]);
    return {
      tools: tools.tools.map(toCapability),
      resources: resources.resources.map(toCapability),
      prompts: prompts.prompts.map(toCapability),
    };
  } finally {
    await connected.close();
  }
};

export class McpConnectionManager {
  public async list(accountId: string, workspaceId: string): Promise<McpConnectionMetadata[]> {
    const connections = await database
      .selectFrom('mcp_connections')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .orderBy('created_at', 'asc')
      .execute();
    return connections.map(toMetadata);
  }

  public async upsert(input: McpConnectionInput): Promise<McpConnectionMetadata> {
    const name = input.name.trim();
    if (!name) throw new Error('MCP server name is required.');
    const url = validateUrl(input.url, input.kind);
    const authMode = input.authMode ?? (input.authToken ? 'token' : 'none');
    if (authMode === 'token' && input.authToken === undefined && !input.id) {
      throw new Error('A bearer token is required for token authentication.');
    }
    const now = new Date();
    const existing = input.id
      ? await this.find(input.accountId, input.workspaceId, input.id)
      : undefined;
    if (input.id && !existing) throw new Error('MCP server connection was not found.');
    let encrypted: ReturnType<typeof encryptSecret> | null = null;
    if (authMode === 'token' && input.authToken?.trim()) encrypted = encryptSecret(input.authToken.trim());
    const clearAuth =
      input.authMode !== undefined &&
      input.authToken === undefined &&
      (authMode !== 'oauth' || existing?.auth_mode !== 'oauth');

    const connection = existing
      ? await database
          .updateTable('mcp_connections')
          .set({
            name,
            url,
            kind: input.kind,
            enabled: input.enabled ?? existing.enabled,
            auth_mode: authMode,
            ...(encrypted
              ? {
                  auth_ciphertext: encrypted.ciphertext,
                  auth_iv: encrypted.iv,
                  auth_tag: encrypted.authTag,
                  auth_key_version: encrypted.keyVersion,
                }
              : clearAuth
                ? { auth_ciphertext: null, auth_iv: null, auth_tag: null, auth_key_version: null }
                : {}),
            ...(input.oauthScope !== undefined ? { oauth_scope: input.oauthScope.trim() || null } : {}),
            status: 'unknown',
            last_error: null,
            oauth_authorization_url: null,
            retry_count: 0,
            circuit_state: 'closed',
            circuit_opened_at: null,
            next_retry_at: null,
            updated_at: now,
          })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await database
          .insertInto('mcp_connections')
          .values({
            id: generateId(IdType.Node),
            account_id: input.accountId,
            workspace_id: input.workspaceId,
            name,
            url,
            kind: input.kind,
            enabled: input.enabled ?? true,
            auth_mode: authMode,
            auth_ciphertext: encrypted?.ciphertext ?? null,
            auth_iv: encrypted?.iv ?? null,
            auth_tag: encrypted?.authTag ?? null,
            auth_key_version: encrypted?.keyVersion ?? null,
            status: 'unknown',
            last_error: null,
            capabilities: JSON.stringify(emptyCapabilities()),
            oauth_discovery_state: null,
            oauth_pending_state: null,
            oauth_pending_ciphertext: null,
            oauth_pending_iv: null,
            oauth_pending_tag: null,
            oauth_authorization_url: null,
            oauth_scope: input.oauthScope?.trim() || null,
            auth_expires_at: null,
            retry_count: 0,
            circuit_state: 'closed',
            circuit_opened_at: null,
            next_retry_at: null,
            last_checked_at: null,
            created_at: now,
            updated_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
    return toMetadata(connection);
  }

  public async check(accountId: string, workspaceId: string, id: string) {
    const connection = await this.find(accountId, workspaceId, id);
    if (!connection) throw new Error('MCP server connection was not found.');
    if (!connection.enabled) {
      const disabled = await database
        .updateTable('mcp_connections')
        .set({ status: 'disabled', last_error: null, last_checked_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toMetadata(disabled);
    }

    const now = new Date();
    if (connection.circuit_state === 'open' && connection.next_retry_at && connection.next_retry_at > now) {
      return toMetadata(connection);
    }
    if (connection.circuit_state === 'open') await this.updateOAuthState(id, { circuit_state: 'half_open' });

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const current = await this.findById(id);
        if (!current) throw new Error('MCP server connection was not found.');
        const capabilities = await discover(current, this);
        const updated = await database
          .updateTable('mcp_connections')
          .set({
            status: 'connected',
            last_error: null,
            capabilities: JSON.stringify(capabilities),
            last_checked_at: new Date(),
            retry_count: 0,
            circuit_state: 'closed',
            circuit_opened_at: null,
            next_retry_at: null,
            updated_at: new Date(),
          })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return toMetadata(updated);
      } catch (error) {
        lastError = error;
        if (isOAuthRequired(error)) break;
        if (attempt < MAX_RETRIES) await sleep(retryDelay(attempt));
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : 'MCP health check failed.';
    const needsAuth = isOAuthRequired(lastError);
    const retryCount = connection.retry_count + (needsAuth ? 0 : 1);
    const circuitOpen = !needsAuth && retryCount >= MAX_RETRIES;
    const updated = await database
      .updateTable('mcp_connections')
      .set({
        status: needsAuth ? 'reauthorization_required' : 'error',
        last_error: errorMessage,
        last_checked_at: new Date(),
        retry_count: retryCount,
        circuit_state: circuitOpen ? 'open' : 'closed',
        circuit_opened_at: circuitOpen ? new Date() : null,
        next_retry_at: circuitOpen ? new Date(Date.now() + CIRCUIT_COOLDOWN_MS) : new Date(Date.now() + retryDelay(retryCount)),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toMetadata(updated);
  }

  public async startOAuth(accountId: string, workspaceId: string, id: string) {
    const connection = await this.find(accountId, workspaceId, id);
    if (!connection) throw new Error('MCP server connection was not found.');
    if (connection.auth_mode !== 'oauth') throw new Error('This MCP connection is not configured for OAuth.');
    const provider = new StoredOAuthProvider(this, connection);
    const result = await auth(provider, { serverUrl: connection.url, scope: connection.oauth_scope ?? undefined });
    if (result !== 'REDIRECT') throw new Error('The MCP server is already authorized.');
    const updated = await this.findById(id);
    return { authorizationUrl: updated?.oauth_authorization_url ?? null, status: updated?.status ?? 'reauthorization_required' };
  }

  public async completeOAuth(connectionId: string, code: string, state: string) {
    const connection = await this.findById(connectionId);
    if (!connection || !connection.oauth_pending_state || connection.oauth_pending_state !== state) {
      throw new Error('OAuth callback state is invalid or expired.');
    }
    const result = await auth(new StoredOAuthProvider(this, connection), { serverUrl: connection.url, authorizationCode: code });
    if (result !== 'AUTHORIZED') throw new Error('OAuth authorization did not complete.');
    return this.findById(connectionId);
  }

  public async remove(accountId: string, workspaceId: string, id: string): Promise<boolean> {
    const deleted = await database
      .deleteFrom('mcp_connections')
      .where('id', '=', id)
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .returning('id')
      .executeTakeFirst();
    return Boolean(deleted);
  }

  public async updateOAuthState(id: string, values: Record<string, unknown>) {
    await database.updateTable('mcp_connections').set(values).where('id', '=', id).execute();
  }

  public async saveOAuthPayload(connection: SelectMcpConnection, payload: OAuthPayload) {
    const encrypted = encryptSecret(JSON.stringify(payload));
    await database
      .updateTable('mcp_connections')
      .set({
        auth_ciphertext: encrypted.ciphertext,
        auth_iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        auth_key_version: encrypted.keyVersion,
      })
      .where('id', '=', connection.id)
      .execute();
  }

  public async findById(id: string): Promise<SelectMcpConnection | undefined> {
    return await database
      .selectFrom('mcp_connections')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  private async find(accountId: string, workspaceId: string, id: string) {
    return await database
      .selectFrom('mcp_connections')
      .selectAll()
      .where('id', '=', id)
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();
  }
}
