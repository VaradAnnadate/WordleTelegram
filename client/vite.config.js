import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3000',
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
