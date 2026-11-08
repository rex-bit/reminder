import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE: "/" for a custom domain / root, "/<repo-name>/" for GitHub Pages project sites.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  build: { sourcemap: mode !== 'production' },
  // Dev only: forwards /api to the local backend, so the browser sees one origin (works in Codespaces too, no CORS or cookie setup).
  server: { proxy: { '/api': { target: process.env.DEV_API_TARGET ?? 'http://localhost:4000', changeOrigin: false } } },
}));
