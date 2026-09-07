import { defineConfig, devices } from '@playwright/test';
import { assertPlaywrightTargetSafe } from './tests/helpers/e2e-db-target-guard.js';

// SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001: refuse to proceed when the resolved target
// is the production Supabase project ref, before any spec file (or its network calls) loads.
assertPlaywrightTargetSafe();

export default defineConfig({
  testDir: './tests/uat',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  // NO global authentication setup - using existing auth state

  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 30000,

    // Reuse authenticated state from manual test
    storageState: 'tests/uat/.auth/user.json',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});