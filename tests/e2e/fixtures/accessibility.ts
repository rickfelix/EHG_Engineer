/**
 * LEO v4.4 Accessibility Testing Fixture
 *
 * Integrates axe-core for automated WCAG accessibility testing.
 * Supports intelligent stringency levels for blocking vs warning.
 *
 * Part of Human-Like E2E Testing Enhancements
 *
 * Usage:
 * ```typescript
 * import { test, expect, checkAccessibility } from './fixtures/accessibility';
 *
 * test('page is accessible', async ({ page, a11y }) => {
 *   await page.goto('/');
 *   const results = await a11y.check();
 *   expect(results.violations).toHaveLength(0);
 * });
 * ```
 */

import { test as base, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility violation from axe-core
 */
interface A11yViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary: string;
  }>;
}

/**
 * Accessibility check result
 */
interface A11yResult {
  violations: A11yViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  shouldBlock: boolean;
  stringency: 'strict' | 'standard' | 'relaxed';
}

/**
 * Accessibility check options
 */
interface A11yOptions {
  /** WCAG tags to check (default: wcag2a, wcag2aa, wcag21aa) */
  tags?: string[];
  /** CSS selectors to exclude from checks */
  exclude?: string[];
  /** CSS selectors to include (if specified, only these are checked) */
  include?: string[];
  /** Override stringency for this check */
  stringency?: 'strict' | 'standard' | 'relaxed';
  /** Disable specific rules */
  disableRules?: string[];
}

/**
 * Accessibility fixture data exposed to tests
 */
interface AccessibilityFixture {
  /** Run accessibility check on current page */
  check: (options?: A11yOptions) => Promise<A11yResult>;
  /** Check specific element */
  checkElement: (selector: string, options?: A11yOptions) => Promise<A11yResult>;
  /** Get violations that should block based on stringency */
  getBlockingViolations: (result: A11yResult) => A11yViolation[];
}

/**
 * Determine if violations should block based on stringency
 */
function shouldBlockForStringency(
  violations: A11yViolation[],
  stringency: 'strict' | 'standard' | 'relaxed'
): boolean {
  if (stringency === 'relaxed') return false;

  const critical = violations.filter(v => v.impact === 'critical');
  const serious = violations.filter(v => v.impact === 'serious');

  if (stringency === 'strict') {
    return violations.length > 0;
  }

  // standard: block on critical or serious
  return critical.length > 0 || serious.length > 0;
}

/**
 * Get violations that should block
 */
function getBlockingViolations(
  violations: A11yViolation[],
  stringency: 'strict' | 'standard' | 'relaxed'
): A11yViolation[] {
  if (stringency === 'relaxed') return [];
  if (stringency === 'strict') return violations;

  // standard: only critical and serious
  return violations.filter(v =>
    v.impact === 'critical' || v.impact === 'serious'
  );
}

/**
 * Run axe-core accessibility check
 */
async function runA11yCheck(
  page: Page,
  options: A11yOptions = {},
  defaultStringency: 'strict' | 'standard' | 'relaxed' = 'standard'
): Promise<A11yResult> {
  const stringency = options.stringency || defaultStringency;
  const tags = options.tags || ['wcag2a', 'wcag2aa', 'wcag21aa'];

  let builder = new AxeBuilder({ page }).withTags(tags);

  if (options.exclude) {
    builder = builder.exclude(options.exclude);
  }

  if (options.include) {
    builder = builder.include(options.include);
  }

  if (options.disableRules) {
    builder = builder.disableRules(options.disableRules);
  }

  const results = await builder.analyze();

  const violations = results.violations.map(v => ({
    id: v.id,
    impact: v.impact as A11yViolation['impact'],
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map(n => ({
      html: n.html,
      target: n.target as string[],
      failureSummary: n.failureSummary || ''
    }))
  }));

  const criticalCount = violations.filter(v => v.impact === 'critical').length;
  const seriousCount = violations.filter(v => v.impact === 'serious').length;
  const moderateCount = violations.filter(v => v.impact === 'moderate').length;
  const minorCount = violations.filter(v => v.impact === 'minor').length;

  return {
    violations,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
    criticalCount,
    seriousCount,
    moderateCount,
    minorCount,
    shouldBlock: shouldBlockForStringency(violations, stringency),
    stringency
  };
}

/**
 * Extended test fixtures including accessibility
 */
type AccessibilityFixtures = {
  a11y: AccessibilityFixture;
};

/**
 * Extended test with accessibility fixture
 */
export const test = base.extend<AccessibilityFixtures>({
  a11y: [async ({ page }, use, testInfo) => {
    // Determine default stringency from test annotations or env
    const annotations = testInfo.annotations;
    let defaultStringency: 'strict' | 'standard' | 'relaxed' = 'standard';

    if (annotations.some(a => a.type === 'strict')) {
      defaultStringency = 'strict';
    } else if (annotations.some(a => a.type === 'relaxed')) {
      defaultStringency = 'relaxed';
    } else if (process.env.A11Y_STRINGENCY) {
      defaultStringency = process.env.A11Y_STRINGENCY as typeof defaultStringency;
    }

    const results: A11yResult[] = [];

    const fixture: AccessibilityFixture = {
      check: async (options?: A11yOptions) => {
        const result = await runA11yCheck(page, options, defaultStringency);
        results.push(result);
        return result;
      },

      checkElement: async (selector: string, options?: A11yOptions) => {
        const result = await runA11yCheck(
          page,
          { ...options, include: [selector] },
          defaultStringency
        );
        results.push(result);
        return result;
      },

      getBlockingViolations: (result: A11yResult) => {
        return getBlockingViolations(result.violations, result.stringency);
      }
    };

    await use(fixture);

    // After test: attach a11y results to test artifacts
    if (results.length > 0) {
      const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
      const totalCritical = results.reduce((sum, r) => sum + r.criticalCount, 0);
      const totalSerious = results.reduce((sum, r) => sum + r.seriousCount, 0);

      const artifact = {
        testTitle: testInfo.title,
        testFile: testInfo.file,
        status: testInfo.status,
        stringency: defaultStringency,
        summary: {
          checksPerformed: results.length,
          totalViolations,
          criticalCount: totalCritical,
          seriousCount: totalSerious,
          moderateCount: results.reduce((sum, r) => sum + r.moderateCount, 0),
          minorCount: results.reduce((sum, r) => sum + r.minorCount, 0),
          passedRules: results.reduce((sum, r) => sum + r.passes, 0)
        },
        violations: results.flatMap(r => r.violations),
        capturedAt: new Date().toISOString()
      };

      await testInfo.attach('accessibility-results.json', {
        body: JSON.stringify(artifact, null, 2),
        contentType: 'application/json'
      });

      // If there were blocking violations, create a separate summary
      if (totalCritical > 0 || totalSerious > 0) {
        await testInfo.attach('a11y-blocking-violations.json', {
          body: JSON.stringify({
            testTitle: testInfo.title,
            stringency: defaultStringency,
            blockingCount: totalCritical + totalSerious,
            violations: results
              .flatMap(r => r.violations)
              .filter(v => v.impact === 'critical' || v.impact === 'serious')
          }, null, 2),
          contentType: 'application/json'
        });
      }
    }
  }, { auto: false }]  // Not auto - must be explicitly used
});

// Re-export expect from Playwright
export { expect };

/**
 * Standalone accessibility check function
 */
export async function checkAccessibility(
  page: Page,
  options?: A11yOptions
): Promise<A11yResult> {
  return runA11yCheck(page, options);
}

/**
 * Assert no critical or serious a11y violations
 */
export function assertNoBlockingA11yViolations(result: A11yResult): void {
  const blocking = getBlockingViolations(result.violations, result.stringency);

  if (blocking.length > 0) {
    const messages = blocking.map(v =>
      `[${v.impact.toUpperCase()}] ${v.id}: ${v.help}\n` +
      `  ${v.helpUrl}\n` +
      v.nodes.map(n => `  - ${n.target.join(' > ')}`).join('\n')
    ).join('\n\n');

    throw new Error(
      `Accessibility violations detected (stringency: ${result.stringency}):\n\n${messages}`
    );
  }
}

/**
 * Common WCAG rule sets
 */
export const WCAG_TAGS = {
  /** WCAG 2.0 Level A */
  WCAG_2_0_A: ['wcag2a'],
  /** WCAG 2.0 Level AA */
  WCAG_2_0_AA: ['wcag2a', 'wcag2aa'],
  /** WCAG 2.1 Level AA (includes 2.0) */
  WCAG_2_1_AA: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  /** Best practices (not WCAG requirements) */
  BEST_PRACTICES: ['best-practice'],
  /** All rules */
  ALL: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']
};
