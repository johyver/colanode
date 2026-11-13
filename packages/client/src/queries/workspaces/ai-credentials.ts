import { AiCredentials } from '@colanode/client/types/ai';

export type AiCredentialsQueryInput = {
  type: 'ai.credentials.get';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'ai.credentials.get': {
      input: AiCredentialsQueryInput;
      output: AiCredentials;
    };
  }
}
