import { defineConfig, devices } from '@playwright/test';
import { assertPlaywrightTargetSafe } from './tests/helpers/e2e-db-target-guard.js';

// SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001: refuse to proceed when the resolved target
// is the production Supabase project ref, before any spec file (or its network calls) loads.
assertPlaywrightTargetSafe();

export default defineConfig({
  // Test directory
  testDir: './',
  
  // Test match pattern
  testMatch: 'test-playwright-basic.spec.js',
  
  // Run tests in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Reporter to use
  reporter: 'list',
  
  // Shared settings for all the projects below
  use: {
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
    // Collect trace on failure
    trace: 'on-first-retry',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});


