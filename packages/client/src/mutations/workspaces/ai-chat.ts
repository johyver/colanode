export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export type AiChatMutationInput = {
  type: 'ai.chat';
  userId: string;
  task?: string;
  agentId?: string;
  messages: AiChatMessage[];
  timeoutMs?: number;
  maxRetries?: number;
};

export type AiChatMutationOutput = {
  id: string;
  message: {
    role: 'assistant';
    content: string;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
  };
  usage: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
  };
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.chat': {
      input: AiChatMutationInput;
      output: AiChatMutationOutput;
    };
  }
}
