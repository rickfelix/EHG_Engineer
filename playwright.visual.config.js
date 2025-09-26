import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: {
      mode: 'only-on-failure',
      fullPage: false
    }
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 }
      }
    }
  ],

  reporter: [['list'], ['html', { outputFolder: 'test-results/html' }]],
});