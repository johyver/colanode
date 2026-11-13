import { AiSettings } from '@colanode/client/types';

export type AiSettingsQueryInput = {
  type: 'ai.settings.get';
  userId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'ai.settings.get': {
      input: AiSettingsQueryInput;
      output: AiSettings;
    };
  }
}
