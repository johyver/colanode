import { AiModelSettings, AiPolicySettings, AiSettings } from '@colanode/client/types';

export type AiSettingsUpdateMutationInput = {
  type: 'ai.settings.update';
  userId: string;
  user?: AiModelSettings | null;
  agentId?: string;
  agentSettings?: AiModelSettings | null;
  policy?: Partial<AiPolicySettings>;
};

export type AiSettingsUpdateMutationOutput = AiSettings;

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'ai.settings.update': {
      input: AiSettingsUpdateMutationInput;
      output: AiSettingsUpdateMutationOutput;
    };
  }
}
