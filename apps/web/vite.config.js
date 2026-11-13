import { resolve } from 'node:path';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup-dom.ts'],
  },
  resolve: {
    // Tiptap exposes ProseMirror through @tiptap/pm while a few extensions
    // resolve the same packages directly. Deduping them prevents Vite from
    // loading two DecorationSet/DecorationGroup implementations, which makes
    // the editor crash during mount with DecorationGroup.localsInner errors.
    dedupe: [
      '@tiptap/core',
      '@tiptap/pm',
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-transform',
      'prosemirror-view',
    ],
    alias: {
      '@colanode/web': resolve(__dirname, './src'),
      '@colanode/core': resolve(__dirname, '../../packages/core/src'),
      '@colanode/crdt': resolve(__dirname, '../../packages/crdt/src'),
      '@colanode/client': resolve(__dirname, '../../packages/client/src'),
      '@colanode/ui': resolve(__dirname, '../../packages/ui/src'),
      // The workspace package is outside Vite's app root, so resolve the
      // React adapter explicitly instead of allowing a stale dependency
      // graph to make every editor node-view fail to load.
      '@tiptap/react/menus': resolve(
        __dirname,
        '../../packages/ui/node_modules/@tiptap/react/dist/menus/index.js'
      ),
      '@tiptap/react': resolve(
        __dirname,
        '../../packages/ui/node_modules/@tiptap/react'
      ),
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  plugins: [
    viteReact(),
    VitePWA({
      mode: 'development',
      base: '/',
      includeAssets: ['favicon.ico'],
      devOptions: {
        // A development service worker can retain stale Vite module responses
        // across restarts and blank the local preview. PWA remains available
        // for production builds, while this preview stays network-backed.
        enabled: false,
        type: 'module',
      },
      srcDir: 'src/workers',
      filename: 'service.ts',
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      injectManifest: {
        minify: false,
        enableWorkboxModulesLogs: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
});
