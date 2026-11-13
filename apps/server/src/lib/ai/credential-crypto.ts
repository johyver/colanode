import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export type EncryptedCredential = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

const deriveKey = (masterKey: string): Buffer => {
  if (!masterKey.trim()) {
    throw new Error(
      'AI credential vault is not configured. Set AI_CREDENTIALS_MASTER_KEY on the server.'
    );
  }

  return crypto.createHash('sha256').update(masterKey, 'utf8').digest();
};

export const encryptCredential = (
  secret: string,
  masterKey: string,
  keyVersion = 1
): EncryptedCredential => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(masterKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion,
  };
};

export const decryptCredential = (
  encrypted: Pick<EncryptedCredential, 'ciphertext' | 'iv' | 'authTag'>,
  masterKey: string
): string => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    deriveKey(masterKey),
    Buffer.from(encrypted.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};
