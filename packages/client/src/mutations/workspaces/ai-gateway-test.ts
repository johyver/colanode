export type AiGatewayTestMutationInput = {
  type: 'ai.gateway.test';
  userId: string;
};

export type AiGatewayTestMutationOutput = {
  provider: string;
  model: string;
  textResponse: string;
  streamedChunks: number;
  toolCallCount: number;
  visionResponse: string;
  totalTokens: number;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.gateway.test': {
      input: AiGatewayTestMutationInput;
      output: AiGatewayTestMutationOutput;
    };
  }
}
