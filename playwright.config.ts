/**
 * Aftershock hosted-acceptance harness.
 *
 * Runs against the deployed Netlify site (no local server). Every test
 * verifies honest product behavior: features not yet built must say so and
 * must never fake data, results, or service availability.
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.AFTERSHOCK_BASE_URL || 'https://aftershock-demo.netlify.app';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  globalTimeout: 15 * 60 * 1000,
  timeout: 40_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
