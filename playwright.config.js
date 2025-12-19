// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * ============================================================================
 * LEO STACK PLAYWRIGHT CONFIGURATION
 * ============================================================================
 *
 * IMPORTANT: This is the DEFAULT config for EHG_Engineer dashboard tests.
 *
 * TEST TARGETS:
 * ┌──────────────────────┬────────────────────────────────────────────────────┐
 * │ Config File          │ Target App & Tests                                 │
 * ├──────────────────────┼────────────────────────────────────────────────────┤
 * │ playwright.config.js │ EHG_Engineer Dashboard (port 3001)                 │
 * │ (THIS FILE)          │ Tests: tests/e2e/ (excluding venture-creation/)    │
 * │                      │ Starts: src/client automatically                   │
 * ├──────────────────────┼────────────────────────────────────────────────────┤
 * │ playwright-ehg.config│ EHG Venture App (port 8080)                        │
 * │                      │ Tests: tests/e2e/venture-creation/                 │
 * │                      │ Requires: LEO Stack running (./scripts/leo-stack.sh)│
 * ├──────────────────────┼────────────────────────────────────────────────────┤
 * │ playwright-uat.config│ EHG App UAT (port 8080)                            │
 * │                      │ Tests: tests/uat/                                  │
 * │                      │ Requires: LEO Stack running + auth setup           │
 * └──────────────────────┴────────────────────────────────────────────────────┘
 *
 * NPM SCRIPTS:
 *   npm run test:e2e           - EHG_Engineer dashboard tests (this config)
 *   npm run test:e2e:ehg       - EHG Venture app tests (venture-creation)
 *   npm run test:uat           - EHG App UAT tests (authenticated)
 *
 * PREREQUISITE FOR EHG TESTS:
 *   ./scripts/leo-stack.sh restart
 */
export default defineConfig({
  // Test directory - excludes venture-creation (those use playwright-ehg.config.js)
  testDir: './tests/e2e',
  // Exclude Jest-style tests (.test.js) - those run via Jest, not Playwright
  // Playwright tests use .spec.ts/.spec.js naming convention
  testIgnore: [
    '**/venture-creation/**',
    '**/*.test.js',      // Jest convention - run via npm test, not Playwright
    '**/*.test.ts',      // Jest convention
  ],

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  // LEO v4.3.4: Added custom reporter for unified test evidence architecture
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
    // LEO Protocol: Unified test evidence capture (writes to test_runs/test_results tables)
    ['./lib/reporters/leo-playwright-reporter.js']
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL - EHG_Engineer dashboard runs on port 3001
    baseURL: process.env.BASE_URL || 'http://localhost:3001',

    // LEO v4.4: Always capture trace for Evidence Pack (cleanup script handles retention)
    trace: 'on',

    // Record video on failure (CI) or first-retry (local)
    video: process.env.CI ? 'retain-on-failure' : 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // LEO v4.4: Capture HAR for API verification (minimal mode for storage efficiency)
    recordHar: {
      path: 'test-results/har/',
      mode: 'minimal',
      urlFilter: '**/api/**'
    },

    // Ignore HTTPS errors
    ignoreHTTPSErrors: true,

    // Default timeout for actions
    actionTimeout: 10000,

    // Default timeout for navigation
    navigationTimeout: 30000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile viewports for responsive testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Starts EHG_Engineer client (dashboard) on port 3001
  webServer: [
    {
      command: 'cd src/client && PORT=3001 npm run dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    }
  ],

  // Visual testing specific configuration
  expect: {
    // Visual comparison threshold
    threshold: 0.2,

    // Animation handling for visual tests
    toHaveScreenshot: {
      mode: 'css',
      animations: 'disabled',
    },

    toMatchSnapshot: {
      mode: 'css',
      animations: 'disabled',
    }
  },

  // Output directories
  outputDir: 'test-results/artifacts',

  // Metadata for LEO Protocol compliance
  metadata: {
    protocol: 'LEO v4.4',
    purpose: 'EHG_Engineer Dashboard E2E Testing',
    testingSubAgent: 'activated',
    coverage: 'e2e-dashboard',
    evidencePack: 'enabled',
  },
});