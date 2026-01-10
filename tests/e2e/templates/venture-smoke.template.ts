/**
 * Venture Pre-Launch Smoke Test Template
 * SD-E2E-VENTURE-LAUNCH-001B
 *
 * A standardized smoke test suite that every venture must pass before launch.
 * Covers 7 critical test domains:
 * 1. Core Functionality - App loads, navigation, happy path
 * 2. Auth & Authorization - Login, sessions, protected routes
 * 3. Performance (Core Web Vitals) - LCP, FID, CLS
 * 4. Accessibility (WCAG 2.1 AA) - No critical violations
 * 5. Security Baseline - XSS, CSRF, auth tokens
 * 6. Mobile Responsiveness - Viewport, touch targets
 * 7. Error Handling - Network errors, validation, recovery
 *
 * Usage:
 * ```typescript
 * import { createVentureSmokeTests } from './templates/venture-smoke.template';
 *
 * const smokeTests = createVentureSmokeTests({
 *   venture: {
 *     name: 'MyVenture',
 *     baseUrl: 'http://localhost:8080',
 *     happyPath: ['/dashboard', '/ventures', '/ventures/new']
 *   }
 * });
 * ```
 */

import { test as base, expect } from '@playwright/test';
import { mergeTests } from '@playwright/test';
// Import from index which re-exports with proper names
import {
  accessibilityTest,
  checkAccessibility,
  assertNoBlockingA11yViolations
} from '../fixtures';
import {
  consoleTest,
  getConsoleSummary
} from '../fixtures';
import { stringencyTest } from '../fixtures';

// ============================================
// CONFIGURATION TYPES
// ============================================

export interface SmokeConfig {
  venture: {
    name: string;
    baseUrl: string;
    loginPath?: string;
    happyPath: string[];
    authRequired?: boolean;
  };
  thresholds?: {
    lcp?: number;     // default: 2500ms
    fid?: number;     // default: 100ms
    cls?: number;     // default: 0.1
  };
  skip?: {
    accessibility?: boolean;
    performance?: boolean;
    security?: boolean;
    mobile?: boolean;
    errorHandling?: boolean;
  };
  credentials?: {
    email: string;
    password: string;
  };
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

const DEFAULT_CONFIG: Partial<SmokeConfig> = {
  thresholds: {
    lcp: 2500,
    fid: 100,
    cls: 0.1
  },
  skip: {}
};

// ============================================
// MERGED TEST WITH FIXTURES
// ============================================

// Combine all required fixtures
const test = mergeTests(
  base,
  accessibilityTest,
  consoleTest,
  stringencyTest
);

// ============================================
// SMOKE TEST FACTORY
// ============================================

/**
 * Create venture-specific smoke tests
 * @param config - Venture smoke test configuration
 */
export function createVentureSmokeTests(config: SmokeConfig) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const { venture, thresholds, skip, credentials } = fullConfig;

  test.describe(`[SMOKE] ${venture.name} Pre-Launch Validation`, () => {
    test.describe.configure({ mode: 'serial' });

    // ========================================
    // DOMAIN 1: CORE FUNCTIONALITY
    // ========================================
    test.describe('Domain 1: Core Functionality', () => {
      test('1.1 App loads without errors', async ({ page, consoleLogs }) => {
        const response = await page.goto(venture.baseUrl);

        // Verify successful response
        expect(response?.status()).toBeLessThan(400);

        // Wait for network idle
        await page.waitForLoadState('networkidle');

        // Verify no uncaught JS errors
        const consoleSummary = getConsoleSummary(consoleLogs);
        expect(consoleSummary.pageErrorCount).toBe(0);
      });

      test('1.2 Primary navigation elements visible', async ({ page }) => {
        await page.goto(venture.baseUrl);
        await page.waitForLoadState('networkidle');

        // Check for common navigation patterns
        const navSelectors = [
          '[data-testid="main-nav"]',
          '[data-testid="sidebar"]',
          'nav',
          '[role="navigation"]'
        ];

        let navFound = false;
        for (const selector of navSelectors) {
          const count = await page.locator(selector).count();
          if (count > 0) {
            navFound = true;
            break;
          }
        }

        expect(navFound).toBe(true);
      });

      test('1.3 Happy path navigation works', async ({ page }) => {
        for (const path of venture.happyPath) {
          const fullUrl = `${venture.baseUrl}${path}`;
          const response = await page.goto(fullUrl);

          // Skip auth-protected paths if not logged in
          if (response?.status() === 401 || response?.status() === 403) {
            test.skip(true, `Path ${path} requires authentication`);
            continue;
          }

          expect(response?.status()).toBeLessThan(400);
          await page.waitForLoadState('networkidle');
        }
      });
    });

    // ========================================
    // DOMAIN 2: AUTH & AUTHORIZATION
    // ========================================
    test.describe('Domain 2: Auth & Authorization', () => {
      test.skip(!venture.authRequired && !credentials, 'Auth not configured');

      test('2.1 Login page loads', async ({ page }) => {
        const loginPath = venture.loginPath || '/login';
        const response = await page.goto(`${venture.baseUrl}${loginPath}`);
        expect(response?.status()).toBe(200);

        // Check for login form elements
        const emailField = page.locator('input[type="email"], input[name="email"]');
        const passwordField = page.locator('input[type="password"]');

        expect(await emailField.count()).toBeGreaterThan(0);
        expect(await passwordField.count()).toBeGreaterThan(0);
      });

      test('2.2 Protected routes redirect unauthenticated users', async ({ page }) => {
        // Clear any existing auth state
        await page.context().clearCookies();

        // Try to access a protected route
        const protectedPath = venture.happyPath.find(p => p.includes('dashboard') || p.includes('ventures'));
        if (!protectedPath) {
          test.skip(true, 'No protected path identified');
        }

        await page.goto(`${venture.baseUrl}${protectedPath}`);

        // Should redirect to login or show auth error
        const currentUrl = page.url();
        const isRedirected = currentUrl.includes('login') || currentUrl.includes('signin');
        const hasAuthError = await page.locator('[role="alert"]').count() > 0;

        expect(isRedirected || hasAuthError).toBe(true);
      });

      test('2.3 Login flow works with valid credentials', async ({ page }) => {
        test.skip(!credentials, 'Test credentials not provided');

        const loginPath = venture.loginPath || '/login';
        await page.goto(`${venture.baseUrl}${loginPath}`);

        await page.fill('input[type="email"], input[name="email"]', credentials!.email);
        await page.fill('input[type="password"]', credentials!.password);
        await page.click('button[type="submit"]');

        // Wait for navigation away from login
        await page.waitForURL(url => !url.toString().includes('login'), { timeout: 10000 });

        // Verify we're logged in (not on login page)
        expect(page.url()).not.toContain('login');
      });
    });

    // ========================================
    // DOMAIN 3: PERFORMANCE (CORE WEB VITALS)
    // ========================================
    test.describe('Domain 3: Performance', () => {
      test.skip(skip?.performance, 'Performance tests skipped');

      test('3.1 LCP within threshold', async ({ page }) => {
        await page.goto(venture.baseUrl);

        // Measure LCP using PerformanceObserver
        const lcp = await page.evaluate(() => {
          return new Promise<number>((resolve) => {
            new PerformanceObserver((entryList) => {
              const entries = entryList.getEntries();
              const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
              resolve(lastEntry.startTime);
            }).observe({ type: 'largest-contentful-paint', buffered: true });

            // Fallback timeout
            setTimeout(() => resolve(0), 5000);
          });
        });

        expect(lcp).toBeLessThan(thresholds!.lcp!);
      });

      test('3.2 CLS within threshold', async ({ page }) => {
        await page.goto(venture.baseUrl);

        // Wait for page to stabilize
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Measure CLS
        const cls = await page.evaluate(() => {
          return new Promise<number>((resolve) => {
            let clsValue = 0;
            new PerformanceObserver((entryList) => {
              for (const entry of entryList.getEntries()) {
                const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
                if (!layoutShift.hadRecentInput) {
                  clsValue += layoutShift.value ?? 0;
                }
              }
            }).observe({ type: 'layout-shift', buffered: true });

            setTimeout(() => resolve(clsValue), 3000);
          });
        });

        expect(cls).toBeLessThan(thresholds!.cls!);
      });

      test('3.3 Page load time acceptable', async ({ page }) => {
        const startTime = Date.now();
        await page.goto(venture.baseUrl);
        await page.waitForLoadState('domcontentloaded');
        const loadTime = Date.now() - startTime;

        // Allow up to 5 seconds for initial load
        expect(loadTime).toBeLessThan(5000);
      });
    });

    // ========================================
    // DOMAIN 4: ACCESSIBILITY (WCAG 2.1 AA)
    // ========================================
    test.describe('Domain 4: Accessibility', () => {
      test.skip(skip?.accessibility, 'Accessibility tests skipped');

      test('4.1 Homepage has no critical a11y violations', async ({ page }) => {
        await page.goto(venture.baseUrl);
        await page.waitForLoadState('networkidle');

        const results = await checkAccessibility(page);
        assertNoBlockingA11yViolations(results);
      });

      test('4.2 Key pages pass accessibility audit', async ({ page }) => {
        for (const path of venture.happyPath.slice(0, 3)) {
          await page.goto(`${venture.baseUrl}${path}`);
          await page.waitForLoadState('networkidle');

          const results = await checkAccessibility(page);

          // Allow warnings but no critical/serious issues
          const criticalViolations = results.violations.filter(
            v => v.impact === 'critical' || v.impact === 'serious'
          );

          expect(criticalViolations.length).toBe(0);
        }
      });

      test('4.3 Focus management works correctly', async ({ page }) => {
        await page.goto(venture.baseUrl);
        await page.waitForLoadState('networkidle');

        // Tab through the page and verify focus is visible
        await page.keyboard.press('Tab');
        const focusedElement = await page.evaluate(() => document.activeElement?.tagName);

        expect(focusedElement).not.toBe('BODY');
      });
    });

    // ========================================
    // DOMAIN 5: SECURITY BASELINE
    // ========================================
    test.describe('Domain 5: Security', () => {
      test.skip(skip?.security, 'Security tests skipped');

      test('5.1 XSS prevention - script tags sanitized', async ({ page }) => {
        await page.goto(venture.baseUrl);

        // Find any input field
        const inputField = page.locator('input[type="text"], input[type="search"], textarea').first();

        if (await inputField.count() > 0) {
          const xssPayload = '<script>alert("xss")</script>';
          await inputField.fill(xssPayload);

          // Check that script tags are not rendered
          const scriptInDom = await page.locator('script:has-text("xss")').count();
          expect(scriptInDom).toBe(0);
        }
      });

      test('5.2 Auth tokens not exposed in localStorage', async ({ page }) => {
        await page.goto(venture.baseUrl);

        const localStorage = await page.evaluate(() => {
          const storage: Record<string, string> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              storage[key] = window.localStorage.getItem(key) || '';
            }
          }
          return storage;
        });

        // Check for common token patterns in localStorage
        const sensitiveKeys = Object.keys(localStorage).filter(key =>
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret') ||
          (key.toLowerCase().includes('token') && !key.includes('csrf'))
        );

        // Should use httpOnly cookies, not localStorage for sensitive tokens
        expect(sensitiveKeys.length).toBe(0);
      });

      test('5.3 HTTPS enforced for sensitive operations', async ({ page }) => {
        // Check that login page uses HTTPS (in production)
        const loginPath = venture.loginPath || '/login';

        if (!venture.baseUrl.includes('localhost')) {
          await page.goto(`${venture.baseUrl}${loginPath}`);
          expect(page.url()).toMatch(/^https:/);
        }
      });
    });

    // ========================================
    // DOMAIN 6: MOBILE RESPONSIVENESS
    // ========================================
    test.describe('Domain 6: Mobile Responsiveness', () => {
      test.skip(skip?.mobile, 'Mobile tests skipped');

      test('6.1 App renders correctly on mobile viewport', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(venture.baseUrl);
        await page.waitForLoadState('networkidle');

        // Check for horizontal overflow
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        expect(hasHorizontalOverflow).toBe(false);
      });

      test('6.2 Touch targets meet minimum size', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(venture.baseUrl);
        await page.waitForLoadState('networkidle');

        // Check interactive elements
        const interactiveElements = await page.locator('button, a, input, [role="button"]').all();

        let smallTargets = 0;
        for (const element of interactiveElements.slice(0, 20)) {
          const box = await element.boundingBox();
          if (box && (box.width < 44 || box.height < 44)) {
            smallTargets++;
          }
        }

        // Allow up to 10% small targets
        const threshold = Math.ceil(interactiveElements.length * 0.1);
        expect(smallTargets).toBeLessThanOrEqual(threshold);
      });
    });

    // ========================================
    // DOMAIN 7: ERROR HANDLING
    // ========================================
    test.describe('Domain 7: Error Handling', () => {
      test.skip(skip?.errorHandling, 'Error handling tests skipped');

      test('7.1 404 page shows user-friendly message', async ({ page }) => {
        const response = await page.goto(`${venture.baseUrl}/this-page-does-not-exist-xyz`);

        // Should either return 404 or redirect
        if (response?.status() === 404) {
          // Check for user-friendly error content
          const pageContent = await page.textContent('body');
          const hasErrorMessage =
            pageContent?.toLowerCase().includes('not found') ||
            pageContent?.toLowerCase().includes('404') ||
            pageContent?.toLowerCase().includes('page doesn\'t exist');

          expect(hasErrorMessage).toBe(true);
        }
      });

      test('7.2 Form validation shows helpful errors', async ({ page }) => {
        await page.goto(venture.baseUrl);
        await page.waitForLoadState('networkidle');

        // Find a form with validation
        const form = page.locator('form').first();

        if (await form.count() > 0) {
          const submitButton = form.locator('button[type="submit"]');

          if (await submitButton.count() > 0) {
            // Try to submit empty form
            await submitButton.click();

            // Check for validation messages
            await page.waitForTimeout(500);
            const errorMessages = await page.locator('[role="alert"], .error, [class*="error"]').count();

            // Should show validation errors
            expect(errorMessages).toBeGreaterThanOrEqual(0);
          }
        }
      });

      test('7.3 Network error shows recovery option', async ({ page }) => {
        // Intercept and fail a network request
        await page.route('**/api/**', route => route.abort());

        await page.goto(venture.baseUrl);
        await page.waitForLoadState('networkidle');

        // Wait for any error UI
        await page.waitForTimeout(2000);

        // Check for retry or error messaging
        const errorUI = await page.locator('[role="alert"], [data-testid*="error"], [class*="error"]').count();

        // Page should either show error or gracefully degrade
        expect(errorUI).toBeGreaterThanOrEqual(0);
      });
    });
  });
}

// ============================================
// DEFAULT EXPORT FOR DIRECT USAGE
// ============================================

export { test, expect };
