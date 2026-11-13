import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      '@colanode/ui': path.resolve(rootDir, 'src'),
      '@colanode/core': path.resolve(rootDir, '../core/src'),
      '@colanode/client': path.resolve(rootDir, '../client/src'),
      '@colanode/crdt': path.resolve(rootDir, '../crdt/src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
