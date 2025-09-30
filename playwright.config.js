// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * LEO Protocol v4.1 - Playwright Configuration for Visual Testing
 * Enables visual inspection during test development and verification
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  
  // Shared settings for all the projects below
  use: {
    // Base URL for tests
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Record video on failure
    video: 'retain-on-failure',
    
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
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

  // Global setup/teardown (commented out for now - needs ES module conversion)
  // globalSetup: './tests/setup/global-setup.js',
  // globalTeardown: './tests/setup/global-teardown.js',

  // Run your local dev server before starting the tests
  // NOTE: This config is for EHG_Engineer dashboard tests only
  // For EHG app UAT tests, use playwright-uat.config.js instead
  webServer: [
    {
      command: 'cd lib/dashboard && node server.js',
      port: 3456,
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
  outputDir: 'test-results/',
  
  // Metadata for LEO Protocol compliance
  metadata: {
    protocol: 'LEO v4.1',
    purpose: 'Visual inspection and E2E testing',
    testingSubAgent: 'activated',
    coverage: 'e2e-visual',
  },
});