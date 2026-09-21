import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// Dev server proxies /api and /ws to the FastAPI server on :8000.
//
// `lib/names.ts` imports `data/player-names.json` from outside the client, so the dev
// server is allowed that one file as well as its own root. A build needs nothing: Rollup
// reads it straight off the disk.
export default defineConfig({
  plugins: [svelte()],
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
