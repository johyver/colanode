import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import type {
  SelectAiCredential,
} from '@colanode/server/data/schema';
import { config } from '@colanode/server/lib/config';

import {
  decryptCredential,
  encryptCredential,
} from './credential-crypto';

export type AiCredentialProvider = 'openai' | 'google' | 'anthropic';

export type AiCredentialMetadata = {
  provider: AiCredentialProvider;
  label: string;
  createdAt: string;
  updatedAt: string | null;
  revokedAt: string | null;
};

type CredentialDatabase = typeof database;

const toMetadata = (credential: SelectAiCredential): AiCredentialMetadata => ({
  provider: credential.provider as AiCredentialProvider,
  label: credential.label,
  createdAt: credential.created_at.toISOString(),
  updatedAt: credential.updated_at?.toISOString() ?? null,
  revokedAt: credential.revoked_at?.toISOString() ?? null,
});

export class AiCredentialVault {
  private readonly db: CredentialDatabase;
  private readonly masterKey: string;

  constructor(
    options: { db?: CredentialDatabase; masterKey?: string } = {}
  ) {
    this.db = options.db ?? database;
    this.masterKey =
      options.masterKey ?? (config.ai.enabled ? config.ai.credentialsMasterKey : '');
  }

  public isConfigured(): boolean {
    return this.masterKey.trim().length > 0;
  }

  public async list(
    accountId: string,
    workspaceId: string
  ): Promise<AiCredentialMetadata[]> {
    const credentials = await this.db
      .selectFrom('ai_credentials')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .orderBy('provider')
      .execute();

    return credentials.map(toMetadata);
  }

  public async upsert(input: {
    accountId: string;
    workspaceId: string;
    provider: AiCredentialProvider;
    label: string;
    apiKey: string;
  }): Promise<AiCredentialMetadata> {
    this.requireConfigured();
    const encrypted = encryptCredential(input.apiKey, this.masterKey);
    const now = new Date();

    const credential = await this.db
      .insertInto('ai_credentials')
      .values({
        id: generateId(IdType.AiCredential),
        account_id: input.accountId,
        workspace_id: input.workspaceId,
        provider: input.provider,
        label: input.label,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion,
        created_at: now,
        updated_at: now,
        revoked_at: null,
      })
      .onConflict((oc) =>
        oc.columns(['account_id', 'workspace_id', 'provider']).doUpdateSet({
          label: input.label,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_version: encrypted.keyVersion,
          updated_at: now,
          revoked_at: null,
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return toMetadata(credential);
  }

  public async revoke(
    accountId: string,
    workspaceId: string,
    provider: AiCredentialProvider
  ): Promise<AiCredentialMetadata | null> {
    this.requireConfigured();
    const credential = await this.db
      .updateTable('ai_credentials')
      .set({ revoked_at: new Date(), updated_at: new Date() })
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .where('provider', '=', provider)
      .returningAll()
      .executeTakeFirst();

    return credential ? toMetadata(credential) : null;
  }

  public async resolve(
    accountId: string,
    workspaceId: string,
    provider: AiCredentialProvider
  ): Promise<string | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }

    const credential = await this.db
      .selectFrom('ai_credentials')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .where('provider', '=', provider)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    if (!credential) {
      return undefined;
    }

    return decryptCredential(
      {
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.auth_tag,
      },
      this.masterKey
    );
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'AI credential vault is not configured. Set AI_CREDENTIALS_MASTER_KEY on the server.'
      );
    }
  }
}
