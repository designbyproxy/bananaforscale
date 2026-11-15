import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served at experiments.designbyproxy.com/bananaforscale/ by a Cloudflare Worker
// (see wrangler.jsonc). Files are built into dist/bananaforscale/ so their paths
// match the URL path.
export default defineConfig({
  plugins: [react()],
  base: '/bananaforscale/',
  build: {
    outDir: 'dist/bananaforscale',
    emptyOutDir: true,
  },
})
