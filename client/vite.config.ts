import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineConfig } from 'vitest/config'

import { headsSprite } from './heads-sprite.ts'

// Dev server proxies /api and /ws to the FastAPI server on :8000.
//
// `lib/names.ts` imports `data/player-names.json` from outside the client, so the dev
// server is allowed that one file as well as its own root. A build needs nothing: Rollup
// reads it straight off the disk. The chat heads in `data/heads/` never go through the
// dev server at all: `headsSprite` reads them and serves one sheet (D4).
//
// `pnpm test` runs the component tests in jsdom. `svelteTesting` resolves Svelte's
// browser build rather than its server one, which is what `mount` needs, and unmounts
// whatever a test rendered once it finishes.
export default defineConfig({
  plugins: [svelte(), svelteTesting(), headsSprite()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['.', '../data/player-names.json'] },
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8000', ws: true, changeOrigin: true },
    },
  },
})
