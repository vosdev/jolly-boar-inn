import { readFileSync } from 'node:fs'

import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineConfig } from 'vitest/config'

import { headsSprite } from './heads-sprite.ts'
import { siteBranding } from './site-branding.ts'

// Dev server proxies /api and /ws to the FastAPI server on :8000.
//
// `lib/names.ts` imports `data/player-names.json` and `lib/questionSchema.ts` the question
// schema from outside the client, so the dev server is allowed those two files as well as
// its own root. A build needs nothing: Rollup reads them straight off the disk. The chat heads in `data/heads/` never go through the
// dev server at all: `headsSprite` reads them and serves one sheet.
//
// `pnpm test` runs the component tests in jsdom. `svelteTesting` resolves Svelte's
// browser build rather than its server one, which is what `mount` needs, and unmounts
// whatever a test rendered once it finishes.
//
// `/VERSION` is read here, once, rather than imported: it is a plain text file at the repo
// root, the single source of the app's version (ideas/architecture.md, Versioning).
const APP_VERSION = readFileSync(new URL('../VERSION', import.meta.url), 'utf-8').trim()

export default defineConfig({
  plugins: [svelte(), svelteTesting(), headsSprite(), siteBranding()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'site-branding.test.ts', 'theme-contract.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['.', '../data/player-names.json', '../schema/question.schema.json'] },
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8000', ws: true, changeOrigin: true },
    },
  },
})
