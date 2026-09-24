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
  optimizeDeps: {
    // three.js is only imported lazily (first 3D toggle); pre-bundle it so dev doesn't reload then.
    include: ['three', 'three/examples/jsm/controls/OrbitControls.js'],
  },
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
