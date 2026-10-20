/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Standalone prototype config. This project is intentionally isolated from
 * the repository-root Vite/Tailwind configuration: it lives under
 * `experiments/minimax-m31-frontend/` and runs on its own port.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    strictPort: false,
    host: '127.0.0.1',
  },
  preview: {
    port: 5184,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
