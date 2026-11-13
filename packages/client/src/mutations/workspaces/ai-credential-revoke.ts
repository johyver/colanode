export type AiCredentialRevokeMutationInput = {
  type: 'ai.credential.revoke';
  userId: string;
  provider: 'openai' | 'google' | 'anthropic';
};

export type AiCredentialRevokeMutationOutput = {
  revoked: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.credential.revoke': {
      input: AiCredentialRevokeMutationInput;
      output: AiCredentialRevokeMutationOutput;
    };
  }
}
