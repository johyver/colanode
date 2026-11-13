import { AiCredential } from '@colanode/client/types/ai';

export type AiCredentialUpsertMutationInput = {
  type: 'ai.credential.upsert';
  userId: string;
  provider: 'openai' | 'google' | 'anthropic';
  label: string;
  apiKey: string;
};

export type AiCredentialUpsertMutationOutput = AiCredential;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.credential.upsert': {
      input: AiCredentialUpsertMutationInput;
      output: AiCredentialUpsertMutationOutput;
    };
  }
}
