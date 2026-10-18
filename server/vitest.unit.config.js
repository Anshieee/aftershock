// Unit tests only — must never require FalkorDB credentials (bare `npm test`
// passes with an empty environment).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
