import { defineConfig, devices } from '@playwright/test';

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


