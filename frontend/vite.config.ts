import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    react(),
    cesium(),         // copies CesiumJS static assets, sets CESIUM_BASE_URL
    wasm(),           // WebAssembly support
    topLevelAwait(),  // required for WASM module initialization
  ],

  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('cesium'))               return 'cesium';
          if (id.includes('three'))                return 'three';
          if (id.includes('@tanstack'))            return 'query';
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom'))
            return 'react-vendor';
        },
      },
    },
  },

  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },

  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8000',   ws: true },
    },
  },

});
