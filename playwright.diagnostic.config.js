// @ts-check
import { defineConfig, devices } from '@playwright/test';
import { assertPlaywrightTargetSafe } from './tests/helpers/e2e-db-target-guard.js';

// SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001: refuse to proceed when the resolved target
// is the production Supabase project ref, before any spec file (or its network calls) loads.
assertPlaywrightTargetSafe();

/**
 * Minimal Playwright Configuration for Diagnostic Tests
 * Assumes dev server is already running on localhost:8080
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'diagnostic-test-results/html' }]
  ],

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'diagnostic-test-results/',
});
