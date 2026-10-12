import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// The Garden SDK pulls in bitcoinjs (tiny-secp256k1 uses WebAssembly) and Node built-ins (buffer, crypto, process).
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ include: ['buffer', 'crypto', 'process', 'stream', 'util'], globals: { Buffer: true, global: true, process: true } }),
    wasm(),
  ],
  // Modern browsers support top-level await, which the wasm plugin emits.
  build: { target: 'esnext' },
  optimizeDeps: { exclude: ['tiny-secp256k1'], esbuildOptions: { target: 'esnext' } },
});
