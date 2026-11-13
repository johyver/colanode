export type AccountAttributes = {
  googleId?: string | null;
  ai?: {
    userSettings?: {
      provider?: 'openai' | 'google';
      model?: string;
      temperature?: number;
      maxOutputTokens?: number;
    } | null;
  };
};
