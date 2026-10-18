/**
 * Integration-only setup: load FalkorDB credentials from dotenv without ever
 * clobbering values already present in the environment and without printing
 * them. Resolution order:
 *
 *   1. `AFTERSHOCK_ENV` pointing at a dotenv file (used from worktrees, where
 *      the checkout `.env` lives elsewhere, e.g. the main checkout),
 *   2. the repo-root `.env` two levels up from this file (`../../.env`).
 *
 * If neither exists, nothing is loaded and the tests skip (no credentials).
 */

import { config as dotenvConfig } from 'dotenv';

const envPath = process.env.AFTERSHOCK_ENV || new URL('../../.env', import.meta.url).pathname;

const result = dotenvConfig({ path: envPath, override: false, quiet: true });

if (result.error) {
  // Do not log the path contents or any interpolation of values; a missing
  // file just means "integration tests will skip".
  process.env.AFTERSHOCK_INTEGRATION_ENV_MISSING = '1';
}
