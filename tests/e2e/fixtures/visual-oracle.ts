/**
 * LEO v4.4 Visual Oracle Fixture
 *
 * Visual regression and layout stability testing:
 * - Cumulative Layout Shift (CLS) measurement
 * - Screenshot comparison
 * - Viewport-based assertions
 *
 * Part of Human-Like E2E Testing Enhancements
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/visual-oracle';
 *
 * test('page has acceptable CLS', async ({ page, visual }) => {
 *   await page.goto('/');
 *   const cls = await visual.measureCLS();
 *   expect(cls).toBeLessThan(0.1);
 * });
 * ```
 */

import { test as base, expect, Page } from '@playwright/test';

/**
 * CLS measurement result
 */
interface CLSResult {
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  shifts: number;
  largestShift: number;
  measurementDuration: number;
}

/**
 * Visual check thresholds based on stringency
 */
interface VisualThresholds {
  maxCLS: number;
  maxPixelDiff: number;
  maxDiffPercent: number;
}

const THRESHOLDS: Record<'strict' | 'standard' | 'relaxed', VisualThresholds> = {
  strict: { maxCLS: 0.05, maxPixelDiff: 100, maxDiffPercent: 0.01 },
  standard: { maxCLS: 0.1, maxPixelDiff: 500, maxDiffPercent: 0.05 },
  relaxed: { maxCLS: 0.25, maxPixelDiff: 2000, maxDiffPercent: 0.20 }
};

/**
 * Viewport stability result
 */
interface ViewportStabilityResult {
  stable: boolean;
  heightChanges: number;
  widthChanges: number;
  initialHeight: number;
  finalHeight: number;
  maxHeightDelta: number;
}

/**
 * Visual oracle fixture
 */
interface VisualOracleFixture {
  /** Measure Cumulative Layout Shift */
  measureCLS: (durationMs?: number) => Promise<CLSResult>;

  /** Check if CLS is within acceptable range for stringency */
  checkCLS: (stringency?: 'strict' | 'standard' | 'relaxed') => Promise<{
    cls: CLSResult;
    passed: boolean;
    threshold: number;
  }>;

  /** Monitor viewport stability during action */
  monitorViewportStability: (
    action: () => Promise<void>,
    options?: { maxHeightDelta?: number }
  ) => Promise<ViewportStabilityResult>;

  /** Check for above-fold content density */
  checkAboveFoldDensity: (maxInteractiveElements?: number) => Promise<{
    count: number;
    exceeds: boolean;
    elements: Array<{ tag: string; text?: string }>;
  }>;

  /** Check heading hierarchy */
  checkHeadingHierarchy: () => Promise<{
    valid: boolean;
    violations: string[];
    headings: Array<{ level: number; text: string }>;
  }>;

  /** Get thresholds for stringency */
  getThresholds: (stringency: 'strict' | 'standard' | 'relaxed') => VisualThresholds;
}

/**
 * Inject CLS measurement script into page
 */
async function measureCLSInPage(page: Page, durationMs: number): Promise<CLSResult> {
  return page.evaluate((duration) => {
    return new Promise<{
      value: number;
      shifts: number;
      largestShift: number;
      measurementDuration: number;
    }>((resolve) => {
      let clsValue = 0;
      let shiftCount = 0;
      let largestShift = 0;
      const startTime = Date.now();

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };

          // Only count shifts without recent user input
          if (!layoutShift.hadRecentInput) {
            clsValue += layoutShift.value;
            shiftCount++;
            largestShift = Math.max(largestShift, layoutShift.value);
          }
        }
      });

      observer.observe({ type: 'layout-shift', buffered: true });

      setTimeout(() => {
        observer.disconnect();
        resolve({
          value: clsValue,
          shifts: shiftCount,
          largestShift,
          measurementDuration: Date.now() - startTime
        });
      }, duration);
    });
  }, durationMs);
}

/**
 * Get CLS rating based on value
 */
function getCLSRating(cls: number): 'good' | 'needs-improvement' | 'poor' {
  if (cls <= 0.1) return 'good';
  if (cls <= 0.25) return 'needs-improvement';
  return 'poor';
}

/**
 * Extended test fixtures including visual oracle
 */
type VisualFixtures = {
  visual: VisualOracleFixture;
};

/**
 * Extended test with visual oracle fixture
 */
export const test = base.extend<VisualFixtures>({
  visual: [async ({ page }, use, testInfo) => {
    const results: Array<{ type: string; data: unknown }> = [];

    const fixture: VisualOracleFixture = {
      measureCLS: async (durationMs = 5000): Promise<CLSResult> => {
        const measurement = await measureCLSInPage(page, durationMs);

        const result: CLSResult = {
          value: measurement.value,
          rating: getCLSRating(measurement.value),
          shifts: measurement.shifts,
          largestShift: measurement.largestShift,
          measurementDuration: measurement.measurementDuration
        };

        results.push({ type: 'cls', data: result });
        return result;
      },

      checkCLS: async (
        stringency: 'strict' | 'standard' | 'relaxed' = 'standard'
      ) => {
        const cls = await fixture.measureCLS();
        const threshold = THRESHOLDS[stringency].maxCLS;

        return {
          cls,
          passed: cls.value <= threshold,
          threshold
        };
      },

      monitorViewportStability: async (
        action: () => Promise<void>,
        options: { maxHeightDelta?: number } = {}
      ): Promise<ViewportStabilityResult> => {
        const { maxHeightDelta = 50 } = options;

        // Get initial viewport dimensions
        const initial = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth
        }));

        let heightChanges = 0;
        let widthChanges = 0;
        let maxDelta = 0;
        let lastHeight = initial.height;
        let lastWidth = initial.width;

        // Monitor during action
        const monitor = setInterval(async () => {
          try {
            const current = await page.evaluate(() => ({
              height: document.documentElement.scrollHeight,
              width: document.documentElement.scrollWidth
            }));

            if (current.height !== lastHeight) {
              heightChanges++;
              maxDelta = Math.max(maxDelta, Math.abs(current.height - lastHeight));
              lastHeight = current.height;
            }

            if (current.width !== lastWidth) {
              widthChanges++;
              lastWidth = current.width;
            }
          } catch {
            // Page might be navigating
          }
        }, 100);

        await action();

        clearInterval(monitor);

        // Final check
        const final = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth
        }));

        const result: ViewportStabilityResult = {
          stable: maxDelta <= maxHeightDelta,
          heightChanges,
          widthChanges,
          initialHeight: initial.height,
          finalHeight: final.height,
          maxHeightDelta: maxDelta
        };

        results.push({ type: 'viewportStability', data: result });
        return result;
      },

      checkAboveFoldDensity: async (maxInteractiveElements = 15) => {
        const data = await page.evaluate((viewportHeight) => {
          const selector = 'button, a, input, select, textarea, [role="button"], [onclick]';
          const elements = document.querySelectorAll(selector);

          const aboveFold = Array.from(elements).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.top < viewportHeight && rect.top >= 0;
          });

          return aboveFold.map(el => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().slice(0, 30) || undefined
          }));
        }, await page.viewportSize()?.height || 800);

        const result = {
          count: data.length,
          exceeds: data.length > maxInteractiveElements,
          elements: data
        };

        results.push({ type: 'aboveFoldDensity', data: result });
        return result;
      },

      checkHeadingHierarchy: async () => {
        const data = await page.evaluate(() => {
          const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

          return Array.from(headings).map(h => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent?.trim().slice(0, 50) || ''
          }));
        });

        const violations: string[] = [];
        let lastLevel = 0;

        for (const heading of data) {
          // Check if we skipped a level (e.g., H1 → H3)
          if (heading.level > lastLevel + 1 && lastLevel > 0) {
            violations.push(
              `Skipped heading level: H${heading.level} after H${lastLevel} ("${heading.text}")`
            );
          }
          lastLevel = heading.level;
        }

        // Check for multiple H1s
        const h1Count = data.filter(h => h.level === 1).length;
        if (h1Count > 1) {
          violations.push(`Multiple H1 elements found: ${h1Count}`);
        }

        // Check for no H1
        if (h1Count === 0 && data.length > 0) {
          violations.push('No H1 element found but other headings exist');
        }

        const result = {
          valid: violations.length === 0,
          violations,
          headings: data
        };

        results.push({ type: 'headingHierarchy', data: result });
        return result;
      },

      getThresholds: (stringency) => THRESHOLDS[stringency]
    };

    await use(fixture);

    // After test: attach visual results to artifacts
    if (results.length > 0) {
      const clsResults = results.filter(r => r.type === 'cls');
      const avgCLS = clsResults.length > 0
        ? clsResults.reduce((sum, r) => sum + (r.data as CLSResult).value, 0) / clsResults.length
        : null;

      const artifact = {
        testTitle: testInfo.title,
        testFile: testInfo.file,
        status: testInfo.status,
        summary: {
          checksPerformed: results.length,
          clsMeasurements: clsResults.length,
          averageCLS: avgCLS,
          clsRating: avgCLS !== null ? getCLSRating(avgCLS) : 'N/A'
        },
        results,
        capturedAt: new Date().toISOString()
      };

      await testInfo.attach('visual-results.json', {
        body: JSON.stringify(artifact, null, 2),
        contentType: 'application/json'
      });
    }
  }, { auto: false }]
});

// Re-export expect from Playwright
export { expect };

/**
 * Assert CLS is within acceptable range
 */
export function assertAcceptableCLS(
  result: CLSResult,
  stringency: 'strict' | 'standard' | 'relaxed' = 'standard'
): void {
  const threshold = THRESHOLDS[stringency].maxCLS;

  if (result.value > threshold) {
    throw new Error(
      `CLS ${result.value.toFixed(3)} exceeds threshold ${threshold} (${stringency})\n` +
      `Rating: ${result.rating}\n` +
      `Shifts: ${result.shifts}, Largest: ${result.largestShift.toFixed(3)}`
    );
  }
}

/**
 * Assert heading hierarchy is valid
 */
export function assertValidHeadingHierarchy(
  result: { valid: boolean; violations: string[] }
): void {
  if (!result.valid) {
    throw new Error(
      `Heading hierarchy violations:\n${result.violations.join('\n')}`
    );
  }
}

/**
 * Assert viewport remained stable during action
 */
export function assertViewportStable(result: ViewportStabilityResult): void {
  if (!result.stable) {
    throw new Error(
      'Viewport instability detected:\n' +
      `Height changes: ${result.heightChanges}\n` +
      `Max delta: ${result.maxHeightDelta}px\n` +
      `Initial: ${result.initialHeight}px, Final: ${result.finalHeight}px`
    );
  }
}
