/**
 * LEO v4.4 Keyboard Navigation Oracle
 *
 * Validates keyboard accessibility including:
 * - Tab order verification
 * - Focus trap detection
 * - Skip link functionality
 * - Keyboard-only navigation
 *
 * Part of Human-Like E2E Testing Enhancements
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/keyboard-oracle';
 *
 * test('keyboard navigation works', async ({ page, keyboard }) => {
 *   await page.goto('/');
 *   const result = await keyboard.verifyTabOrder(['nav-home', 'nav-about', 'main-cta']);
 *   expect(result.matches).toBe(true);
 * });
 * ```
 */

import { test as base, expect, Page } from '@playwright/test';

/**
 * Tab order verification result
 */
interface TabOrderResult {
  expected: string[];
  actual: string[];
  matches: boolean;
  mismatches: Array<{
    position: number;
    expected: string;
    actual: string;
  }>;
}

/**
 * Focus trap detection result
 */
interface FocusTrapResult {
  hasTrap: boolean;
  trapElement?: string;
  escapeAttempts: number;
  trapped: boolean;
}

/**
 * Skip link verification result
 */
interface SkipLinkResult {
  found: boolean;
  selector?: string;
  target?: string;
  works: boolean;
}

/**
 * Focusable element info
 */
interface FocusableElement {
  tag: string;
  testId?: string;
  id?: string;
  text?: string;
  role?: string;
  tabIndex: number;
  isVisible: boolean;
}

/**
 * Keyboard navigation fixture
 */
interface KeyboardOracleFixture {
  /** Verify elements are reached in expected tab order */
  verifyTabOrder: (expectedOrder: string[], options?: TabOrderOptions) => Promise<TabOrderResult>;

  /** Detect focus traps (can't tab out of element) */
  detectFocusTrap: (containerSelector?: string, maxAttempts?: number) => Promise<FocusTrapResult>;

  /** Verify skip link exists and works */
  verifySkipLink: () => Promise<SkipLinkResult>;

  /** Get all focusable elements on page */
  getFocusableElements: () => Promise<FocusableElement[]>;

  /** Tab through page and return focus order */
  captureTabOrder: (maxElements?: number) => Promise<string[]>;

  /** Verify element can be activated with Enter/Space */
  verifyKeyboardActivation: (selector: string) => Promise<boolean>;
}

interface TabOrderOptions {
  /** Attribute to use for identifying elements (default: data-testid) */
  identifierAttribute?: string;
  /** Maximum tabs to try before giving up */
  maxTabs?: number;
  /** Start from a specific element */
  startFrom?: string;
}

/**
 * Get identifier for currently focused element
 */
async function getFocusedElementId(
  page: Page,
  attribute: string = 'data-testid'
): Promise<string> {
  return page.evaluate((attr) => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';

    // Try specified attribute first
    const attrValue = el.getAttribute(attr);
    if (attrValue) return attrValue;

    // Fallback to id
    if (el.id) return `#${el.id}`;

    // Fallback to tag + text
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim().slice(0, 20);
    return text ? `${tag}:${text}` : tag;
  }, attribute);
}

/**
 * Extended test fixtures including keyboard oracle
 */
type KeyboardFixtures = {
  keyboard: KeyboardOracleFixture;
};

/**
 * Extended test with keyboard oracle fixture
 */
export const test = base.extend<KeyboardFixtures>({
  keyboard: [async ({ page }, use, testInfo) => {
    const results: Array<{ type: string; data: unknown }> = [];

    const fixture: KeyboardOracleFixture = {
      verifyTabOrder: async (
        expectedOrder: string[],
        options: TabOrderOptions = {}
      ): Promise<TabOrderResult> => {
        const {
          identifierAttribute = 'data-testid',
          maxTabs = expectedOrder.length + 10,
          startFrom
        } = options;

        // Start from specific element or beginning
        if (startFrom) {
          await page.locator(`[${identifierAttribute}="${startFrom}"]`).focus();
        } else {
          // Focus on body to start fresh
          await page.evaluate(() => {
            (document.activeElement as HTMLElement)?.blur?.();
            document.body.focus();
          });
        }

        const actualOrder: string[] = [];
        const mismatches: TabOrderResult['mismatches'] = [];

        for (let i = 0; i < maxTabs && actualOrder.length < expectedOrder.length; i++) {
          await page.keyboard.press('Tab');
          const focused = await getFocusedElementId(page, identifierAttribute);

          // Only record if it's one of our expected elements
          if (expectedOrder.includes(focused) && !actualOrder.includes(focused)) {
            actualOrder.push(focused);

            // Check if position matches
            const expectedPos = actualOrder.length - 1;
            if (expectedOrder[expectedPos] !== focused) {
              mismatches.push({
                position: expectedPos,
                expected: expectedOrder[expectedPos],
                actual: focused
              });
            }
          }
        }

        const result: TabOrderResult = {
          expected: expectedOrder,
          actual: actualOrder,
          matches: mismatches.length === 0 && actualOrder.length === expectedOrder.length,
          mismatches
        };

        results.push({ type: 'tabOrder', data: result });
        return result;
      },

      detectFocusTrap: async (
        containerSelector?: string,
        maxAttempts: number = 20
      ): Promise<FocusTrapResult> => {
        // If container specified, focus first focusable element in it
        if (containerSelector) {
          const container = page.locator(containerSelector);
          const focusable = container.locator(
            'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ).first();
          await focusable.focus();
        }

        const startElement = await getFocusedElementId(page);
        const visitedElements = new Set<string>([startElement]);
        let trapped = false;
        let escapeAttempts = 0;

        for (let i = 0; i < maxAttempts; i++) {
          await page.keyboard.press('Tab');
          escapeAttempts++;

          const current = await getFocusedElementId(page);

          // If we're back at start and haven't visited enough elements, might be trapped
          if (current === startElement) {
            if (visitedElements.size < 3) {
              trapped = true;
              break;
            }
          }

          // Try Escape key
          await page.keyboard.press('Escape');
          const afterEscape = await getFocusedElementId(page);

          // If Escape worked (focus changed), we're not trapped
          if (afterEscape !== current && !containerSelector) {
            break;
          }

          visitedElements.add(current);
        }

        const result: FocusTrapResult = {
          hasTrap: trapped || visitedElements.size < 3,
          trapElement: trapped ? startElement : undefined,
          escapeAttempts,
          trapped
        };

        results.push({ type: 'focusTrap', data: result });
        return result;
      },

      verifySkipLink: async (): Promise<SkipLinkResult> => {
        // Reset focus to beginning
        await page.evaluate(() => document.body.focus());

        // Tab once to get to potential skip link
        await page.keyboard.press('Tab');

        const skipLink = await page.evaluate(() => {
          const el = document.activeElement as HTMLAnchorElement;
          if (!el) return null;

          const text = el.textContent?.toLowerCase() || '';
          const isSkipLink = text.includes('skip') ||
                            text.includes('main content') ||
                            text.includes('navigation');

          if (!isSkipLink) return null;

          return {
            selector: el.getAttribute('data-testid') || el.id || 'skip-link',
            target: el.getAttribute('href'),
            text: el.textContent
          };
        });

        if (!skipLink) {
          const result: SkipLinkResult = { found: false, works: false };
          results.push({ type: 'skipLink', data: result });
          return result;
        }

        // Try activating skip link
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);

        // Check if focus moved to main content
        const focusedAfter = await page.evaluate(() => {
          const el = document.activeElement;
          return el?.id || el?.getAttribute('data-testid') || el?.tagName.toLowerCase();
        });

        const works = skipLink.target ?
          focusedAfter === skipLink.target.replace('#', '') :
          focusedAfter !== 'body';

        const result: SkipLinkResult = {
          found: true,
          selector: skipLink.selector,
          target: skipLink.target || undefined,
          works
        };

        results.push({ type: 'skipLink', data: result });
        return result;
      },

      getFocusableElements: async (): Promise<FocusableElement[]> => {
        return page.evaluate(() => {
          const selector = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
          const elements = document.querySelectorAll(selector);

          return Array.from(elements).map(el => ({
            tag: el.tagName.toLowerCase(),
            testId: el.getAttribute('data-testid') || undefined,
            id: el.id || undefined,
            text: el.textContent?.trim().slice(0, 50) || undefined,
            role: el.getAttribute('role') || undefined,
            tabIndex: (el as HTMLElement).tabIndex,
            isVisible: (el as HTMLElement).offsetParent !== null
          }));
        });
      },

      captureTabOrder: async (maxElements: number = 50): Promise<string[]> => {
        await page.evaluate(() => document.body.focus());

        const order: string[] = [];
        const seen = new Set<string>();

        for (let i = 0; i < maxElements; i++) {
          await page.keyboard.press('Tab');
          const focused = await getFocusedElementId(page);

          if (focused === 'body' || seen.has(focused)) {
            break;
          }

          order.push(focused);
          seen.add(focused);
        }

        results.push({ type: 'capturedOrder', data: order });
        return order;
      },

      verifyKeyboardActivation: async (selector: string): Promise<boolean> => {
        const element = page.locator(selector);
        await element.focus();

        // Try Enter
        let activated = false;
        const clickPromise = page.waitForEvent('request', { timeout: 1000 }).catch(() => null);
        await page.keyboard.press('Enter');

        const request = await clickPromise;
        if (request) {
          activated = true;
        }

        // Also check if element state changed (for toggles, etc.)
        const stateChanged = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el?.getAttribute('aria-pressed') === 'true' ||
                 el?.getAttribute('aria-expanded') === 'true' ||
                 el?.classList.contains('active');
        }, selector);

        const result = activated || stateChanged;
        results.push({ type: 'keyboardActivation', data: { selector, activated: result } });
        return result;
      }
    };

    await use(fixture);

    // After test: attach keyboard navigation results to artifacts
    if (results.length > 0) {
      const artifact = {
        testTitle: testInfo.title,
        testFile: testInfo.file,
        status: testInfo.status,
        checks: results,
        summary: {
          totalChecks: results.length,
          tabOrderChecks: results.filter(r => r.type === 'tabOrder').length,
          focusTrapChecks: results.filter(r => r.type === 'focusTrap').length,
          trapsDetected: results.filter(r =>
            r.type === 'focusTrap' && (r.data as FocusTrapResult).trapped
          ).length
        },
        capturedAt: new Date().toISOString()
      };

      await testInfo.attach('keyboard-navigation.json', {
        body: JSON.stringify(artifact, null, 2),
        contentType: 'application/json'
      });
    }
  }, { auto: false }]
});

// Re-export expect from Playwright
export { expect };

/**
 * Assert tab order matches expected
 */
export function assertTabOrder(result: TabOrderResult): void {
  if (!result.matches) {
    const mismatchDesc = result.mismatches
      .map(m => `Position ${m.position}: expected "${m.expected}", got "${m.actual}"`)
      .join('\n');

    throw new Error(
      'Tab order mismatch:\n' +
      `Expected: ${result.expected.join(' → ')}\n` +
      `Actual: ${result.actual.join(' → ')}\n` +
      `Mismatches:\n${mismatchDesc}`
    );
  }
}

/**
 * Assert no focus traps
 */
export function assertNoFocusTrap(result: FocusTrapResult): void {
  if (result.trapped) {
    throw new Error(
      `Focus trap detected at element: ${result.trapElement}\n` +
      `Escape attempts: ${result.escapeAttempts}`
    );
  }
}
