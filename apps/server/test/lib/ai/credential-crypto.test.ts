import { describe, expect, it } from 'vitest';

import {
  decryptCredential,
  encryptCredential,
} from '@colanode/server/lib/ai/credential-crypto';

describe('AI credential encryption', () => {
  it('round-trips a secret without storing plaintext', () => {
    const secret = 'sk-test-secret-value';
    const encrypted = encryptCredential(secret, 'test-master-key');

    expect(encrypted.ciphertext).not.toContain(secret);
    expect(JSON.stringify(encrypted)).not.toContain(secret);
    expect(decryptCredential(encrypted, 'test-master-key')).toBe(secret);
  });

  it('rejects tampering and the wrong master key', () => {
    const encrypted = encryptCredential('sk-test-secret-value', 'test-master-key');

    expect(() =>
      decryptCredential(
        {
          ...encrypted,
          ciphertext: `${encrypted.ciphertext.slice(0, -1)}${
            encrypted.ciphertext.endsWith('A') ? 'B' : 'A'
          }`,
        },
        'test-master-key'
      )
    ).toThrow();
    expect(() => decryptCredential(encrypted, 'wrong-master-key')).toThrow();
  });

  it('requires a server master key', () => {
    expect(() => encryptCredential('sk-test-secret-value', '')).toThrow(
      'AI credential vault is not configured'
    );
  });
});
