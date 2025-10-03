import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8082';

test.describe('EHG Landing Page Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the landing page
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  });

  test('US-UAT-L01: Landing page loads successfully', async ({ page }) => {
    // Verify the page title
    await expect(page).toHaveTitle(/capital-orchestra|EHG/i);

    // Check that the page loads without errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('US-UAT-L02: Main navigation elements are present', async ({ page }) => {
    // Check for the EHG Platform branding
    await expect(page.locator('text="EHG Platform"')).toBeVisible();

    // Check for the logo/icon
    const logo = page.locator('svg').first();
    await expect(logo).toBeVisible();

    // Check for Sign In button in header
    const signInButton = page.locator('header').locator('text="Sign In"');
    await expect(signInButton).toBeVisible();
  });

  test('US-UAT-L03: Hero section displays correctly', async ({ page }) => {
    // Check for main headline
    await expect(page.locator('h1')).toContainText('Venture Evaluation');

    // Check for description
    await expect(page.locator('text=/Accelerate breakthrough ventures/i')).toBeVisible();

    // Check for Get Started button
    const getStartedButton = page.locator('text="Get Started"');
    await expect(getStartedButton).toBeVisible();

    // Check for Learn More button
    const learnMoreButton = page.locator('text="Learn More"');
    await expect(learnMoreButton).toBeVisible();
  });

  test('US-UAT-L04: Feature cards are displayed', async ({ page }) => {
    // Check for Strategic Oversight card
    await expect(page.locator('text="Strategic Oversight"')).toBeVisible();
    await expect(page.locator('text=/Executive dashboards/i')).toBeVisible();

    // Check for AI Orchestration card
    await expect(page.locator('text="AI Orchestration"')).toBeVisible();
    await expect(page.locator('text=/40-stage workflow/i')).toBeVisible();

    // Check for Risk Management card
    await expect(page.locator('text="Risk Management"')).toBeVisible();
    await expect(page.locator('text=/risk evaluation/i')).toBeVisible();

    // Verify there are exactly 3 feature cards
    const cards = page.locator('.grid > div');
    await expect(cards).toHaveCount(3);
  });

  test('US-UAT-L05: Sign In button navigates to login page', async ({ page }) => {
    // Click the Sign In button in header
    await page.locator('header').locator('text="Sign In"').click();

    // Wait for navigation
    await page.waitForURL(/.*login/, { timeout: 5000 });

    // Verify we're on the login page
    const currentURL = page.url();
    expect(currentURL).toContain('/login');
  });

  test('US-UAT-L06: Get Started button navigates to login page', async ({ page }) => {
    // Click the Get Started button
    await page.locator('text="Get Started"').click();

    // Wait for navigation
    await page.waitForURL(/.*login/, { timeout: 5000 });

    // Verify we're on the login page
    const currentURL = page.url();
    expect(currentURL).toContain('/login');
  });

  test('US-UAT-L07: Landing page is responsive', async ({ page }) => {
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('.grid')).toHaveCSS('grid-template-columns', /repeat/);

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    const tabletGrid = page.locator('.grid');
    await expect(tabletGrid).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // On mobile, cards should stack (single column)
    const mobileCards = page.locator('.grid > div');
    await expect(mobileCards.first()).toBeVisible();
  });

  test('US-UAT-L08: Page performance metrics', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - startTime;

    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);

    // Check for largest contentful paint
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry.renderTime || lastEntry.loadTime);
        }).observe({ entryTypes: ['largest-contentful-paint'] });
      });
    });

    // LCP should be under 2.5 seconds (good)
    expect(lcp).toBeLessThan(2500);
  });

  test('US-UAT-L09: Accessibility - keyboard navigation', async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.textContent);
    expect(firstFocused).toBeTruthy();

    // Continue tabbing and ensure all buttons are reachable
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Press Enter on focused element (should be a button)
    await page.keyboard.press('Enter');

    // Should navigate to login
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('US-UAT-L10: SEO meta tags present', async ({ page }) => {
    // Check for meta description
    const metaDescription = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDescription).toBeTruthy();

    // Check for viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');

    // Check for Open Graph tags
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
  });
});

// Helper function to store test results
async function storeTestResult(testId, status, page) {
  console.log(`Test ${testId}: ${status}`);

  if (status === 'failed') {
    await page.screenshot({
      path: `test-results/screenshots/landing-${testId}-${Date.now()}.png`,
      fullPage: true
    });
  }
}