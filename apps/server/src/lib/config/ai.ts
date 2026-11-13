import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

export const aiProviderSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'ollama',
  'lmstudio',
]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

const booleanConfigSchema = z.preprocess(
  (val) =>
    val === 'true' || val === true
      ? true
      : val === 'false' || val === false
        ? false
        : val,
  z.boolean().optional()
);

export const aiProviderConfigSchema = z.object({
  apiKey: z.string().default('').transform(resolveConfigReference),
  baseUrl: z.string().url().optional(),
  enabled: booleanConfigSchema.default(false),
});

export type AiProviderConfig = z.infer<typeof aiProviderConfigSchema>;

export const aiModelConfigSchema = z.object({
  provider: aiProviderSchema.default('openai'),
  modelName: z.string().default('gpt-4o'),
  temperature: z.coerce.number().default(0.5),
  maxOutputTokens: z.coerce.number().int().positive().optional(),
});

export type AiModelConfig = z.infer<typeof aiModelConfigSchema>;

export const chunkingConfigSchema = z.object({
  defaultChunkSize: z.coerce.number().default(1000),
  defaultOverlap: z.coerce.number().default(200),
  enhanceWithContext: z.preprocess(
    (val) => val === 'true',
    z.boolean().default(false)
  ),
});

export type ChunkingConfig = z.infer<typeof chunkingConfigSchema>;

export const retrievalConfigSchema = z.object({
  hybridSearch: z.object({
    semanticSearchWeight: z.coerce.number().default(0.7),
    keywordSearchWeight: z.coerce.number().default(0.3),
    maxResults: z.coerce.number().default(20),
  }),
});

export type RetrievalConfig = z.infer<typeof retrievalConfigSchema>;

export const aiConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      localOnly: booleanConfigSchema.default(false),
      credentialsMasterKey: z
        .string()
        .default('')
        .transform(resolveConfigReference),
      nodeEmbeddingDelay: z.coerce.number().default(5000),
      documentEmbeddingDelay: z.coerce.number().default(10000),
      providers: z.object({
        openai: aiProviderConfigSchema,
        anthropic: aiProviderConfigSchema.prefault({}),
        google: aiProviderConfigSchema,
        ollama: aiProviderConfigSchema.prefault({}),
        lmstudio: aiProviderConfigSchema.prefault({}),
      }),
      langfuse: z.object({
        enabled: z.boolean().default(false),
        publicKey: z.string().default('').transform(resolveConfigReference),
        secretKey: z.string().default('').transform(resolveConfigReference),
        baseUrl: z
          .string()
          .default('https://cloud.langfuse.com')
          .transform(resolveConfigReference),
      }),
      models: z.object({
        queryRewrite: aiModelConfigSchema,
        response: aiModelConfigSchema,
        rerank: aiModelConfigSchema,
        summarization: aiModelConfigSchema,
        contextEnhancer: aiModelConfigSchema,
        noContext: aiModelConfigSchema,
        intentRecognition: aiModelConfigSchema,
        databaseFilter: aiModelConfigSchema,
      }),
      embedding: z.object({
        provider: aiProviderSchema.default('openai'),
        modelName: z.string().default('text-embedding-3-large'),
        dimensions: z.coerce.number().default(2000),
        apiKey: z.string().default('').transform(resolveConfigReference),
        batchSize: z.coerce.number().default(50),
      }),
      chunking: chunkingConfigSchema,
      retrieval: retrievalConfigSchema,
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({
    enabled: false,
  });

export type AiConfig = z.infer<typeof aiConfigSchema>;
