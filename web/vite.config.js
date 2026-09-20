import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this repo at /kosh/, while the container and local dev
// serve it at /. BASE_PATH is set by the Pages workflow and left unset
// everywhere else, so one config covers both without a second build script.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
