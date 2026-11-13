import { AiLocalModels } from '@colanode/client/types';

export type AiLocalModelsQueryInput = {
  type: 'ai.localModels.get';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'ai.localModels.get': {
      input: AiLocalModelsQueryInput;
      output: AiLocalModels;
    };
  }
}
