import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        parserOpts: {
          plugins: ['decorators-legacy', 'classProperties'],
        },
      },
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      // If we decide to use absolute paths later, we can map them here
    },
  },
});
