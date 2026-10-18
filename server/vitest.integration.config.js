// Integration tests — talk to the real FalkorDB cloud instance and MUST only
// touch the `aftershock:demo-smoke` graph. They skip gracefully when
// credentials are absent (CI); locally, credentials come from the main
// checkout `.env` via AFTERSHOCK_ENV (see server/test/_env.mjs).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.mjs'],
    environment: 'node',
    setupFiles: ['./test/_env.mjs'],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    bail: false,
  },
});
