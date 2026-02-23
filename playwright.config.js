// @ts-check
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load environment variables for E2E tests
dotenv.config();

/**
 * ============================================================================
 * LEO STACK PLAYWRIGHT CONFIGURATION
 * ============================================================================
 *
 * ARCHITECTURE (SD-ARCH-EHG-007):
 * - EHG (port 8080): Unified frontend (user + admin features at /admin/*)
 * - EHG_Engineer (port 3000): Backend API only (no standalone UI)
 *
 * TEST TARGETS:
 * ┌──────────────────────┬────────────────────────────────────────────────────┐
 * │ Config File          │ Target App & Tests                                 │
 * ├──────────────────────┼────────────────────────────────────────────────────┤
 * │ playwright.config.js │ EHG Unified Frontend (port 8080)                   │
 * │ (THIS FILE)          │ Tests: tests/e2e/ (excluding venture-creation/)    │
 * │                      │ Requires: LEO Stack running                        │
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
 *   npm run test:e2e           - EHG unified frontend tests (this config)
 *   npm run test:e2e:ehg       - EHG Venture app tests (venture-creation)
 *   npm run test:uat           - EHG App UAT tests (authenticated)
 *
 * PREREQUISITE:
 *   ./scripts/leo-stack.sh restart
 */
export default defineConfig({
  // LEO v4.4: Global teardown for backup evidence pack generation
  globalTeardown: './tests/e2e/setup/global-teardown.js',

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
  // LEO v4.4: Custom reporter with evidence pack generation
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
    // LEO Protocol: Unified test evidence capture with auto evidence pack
    ['./lib/reporters/leo-playwright-reporter.js', {
      generateEvidencePack: true,
      cleanupPassingTraces: true,
      cleanupMaxAgeDays: 7
    }]
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL - EHG unified frontend runs on port 8080 (SD-ARCH-EHG-007)
    baseURL: process.env.BASE_URL || 'http://localhost:8080',

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

  // SD-ARCH-EHG-007: EHG_Engineer has no frontend - tests require LEO Stack running
  // Start with: ./scripts/leo-stack.sh restart (starts EHG on 8080, API on 3000)
  webServer: [],

  // Visual testing specific configuration
  // LEO v4.4: Human-Like E2E Testing thresholds
  expect: {
    // Visual comparison threshold
    threshold: 0.2,

    // Animation handling for visual tests
    toHaveScreenshot: {
      // LEO v4.4: Stringency-based thresholds
      // strict: 1%, standard: 5%, relaxed: 20%
      maxDiffPixelRatio: process.env.E2E_STRINGENCY === 'strict' ? 0.01 :
                         process.env.E2E_STRINGENCY === 'relaxed' ? 0.20 : 0.05,
      threshold: 0.2,
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
    // LEO v4.4: Human-Like E2E Testing Enhancements
    humanLikeTesting: {
      enabled: true,
      fixtures: [
        'accessibility',      // axe-core WCAG testing
        'keyboard-oracle',    // Tab order and focus testing
        'console-capture',    // Console error assertions
        'chaos-saboteur',     // Resilience testing
        'visual-oracle',      // CLS measurement
        'llm-ux-oracle',      // LLM UX evaluation (factory-routed)
        'stringency-resolver' // Intelligent stringency
      ],
      stringency: process.env.E2E_STRINGENCY || 'standard',
      llmModel: 'factory-routed',
      budgetMonthlyUSD: 20
    }
  },
});