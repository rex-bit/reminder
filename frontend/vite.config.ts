import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE: "/" for a custom domain / root, "/<repo-name>/" for GitHub Pages project sites.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  build: { sourcemap: mode !== 'production' },
}));
