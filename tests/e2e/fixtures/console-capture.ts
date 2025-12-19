/**
 * LEO v4.4 Console Capture Fixture
 *
 * Auto-captures console logs and page errors during E2E tests,
 * attaching them to test reports for Evidence Pack generation.
 *
 * Part of LEO Protocol v4.4 - Unified Test Evidence Architecture
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/console-capture';
 *
 * test('my test', async ({ page, consoleLogs }) => {
 *   await page.goto('/');
 *   // consoleLogs.logs and consoleLogs.errors are auto-populated
 * });
 * ```
 *
 * The fixture auto-attaches console output to test artifacts.
 */

import { test as base, expect } from '@playwright/test';

/**
 * Console message captured during test execution
 */
interface ConsoleMessage {
  type: 'log' | 'debug' | 'info' | 'error' | 'warning' | 'dir' | 'dirxml' | 'table' | 'trace' | 'clear' | 'startGroup' | 'startGroupCollapsed' | 'endGroup' | 'assert' | 'profile' | 'profileEnd' | 'count' | 'timeEnd';
  text: string;
  url?: string;
  lineNumber?: number;
  timestamp: number;
}

/**
 * Page error captured during test execution
 */
interface PageError {
  message: string;
  stack?: string;
  timestamp: number;
}

/**
 * Console capture data exposed to tests
 */
interface ConsoleCaptureData {
  logs: ConsoleMessage[];
  errors: PageError[];
  warnings: ConsoleMessage[];
  getErrorCount: () => number;
  getWarningCount: () => number;
  hasErrors: () => boolean;
  clear: () => void;
}

/**
 * Extended test fixtures including console capture
 */
type ConsoleFixtures = {
  consoleLogs: ConsoleCaptureData;
};

/**
 * Extended test with console capture fixture
 */
export const test = base.extend<ConsoleFixtures>({
  consoleLogs: [async ({ page }, use, testInfo) => {
    const logs: ConsoleMessage[] = [];
    const errors: PageError[] = [];
    const warnings: ConsoleMessage[] = [];

    // Capture console messages
    page.on('console', (msg) => {
      const entry: ConsoleMessage = {
        type: msg.type() as ConsoleMessage['type'],
        text: msg.text(),
        url: msg.location()?.url,
        lineNumber: msg.location()?.lineNumber,
        timestamp: Date.now()
      };

      logs.push(entry);

      // Separate warnings for easy access
      if (msg.type() === 'warning') {
        warnings.push(entry);
      }
    });

    // Capture page errors (uncaught exceptions)
    page.on('pageerror', (error) => {
      errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      });
    });

    // Capture request failures
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      if (failure) {
        logs.push({
          type: 'error',
          text: `Request failed: ${request.url()} - ${failure.errorText}`,
          url: request.url(),
          timestamp: Date.now()
        });
      }
    });

    // Provide fixture data to test
    const captureData: ConsoleCaptureData = {
      logs,
      errors,
      warnings,
      getErrorCount: () => errors.length,
      getWarningCount: () => warnings.length,
      hasErrors: () => errors.length > 0,
      clear: () => {
        logs.length = 0;
        errors.length = 0;
        warnings.length = 0;
      }
    };

    await use(captureData);

    // After test: attach console output to test artifacts
    const consoleArtifact = {
      testTitle: testInfo.title,
      testFile: testInfo.file,
      status: testInfo.status,
      logs: logs,
      errors: errors,
      warnings: warnings,
      summary: {
        totalLogs: logs.length,
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        errorMessages: errors.map(e => e.message),
        hasJSErrors: errors.length > 0
      },
      capturedAt: new Date().toISOString()
    };

    // Always attach console logs (they're part of Evidence Pack)
    await testInfo.attach('console-capture.json', {
      body: JSON.stringify(consoleArtifact, null, 2),
      contentType: 'application/json'
    });

    // If there were JS errors, create a separate error summary for visibility
    if (errors.length > 0) {
      await testInfo.attach('js-errors.json', {
        body: JSON.stringify({
          testTitle: testInfo.title,
          errorCount: errors.length,
          errors: errors.map(e => ({
            message: e.message,
            stack: e.stack
          }))
        }, null, 2),
        contentType: 'application/json'
      });
    }
  }, { auto: true }]  // auto: true means it runs for every test
});

// Re-export expect from Playwright
export { expect };

/**
 * Helper to assert no JS errors occurred during test
 *
 * Usage:
 * ```typescript
 * import { test, expect, assertNoJSErrors } from './fixtures/console-capture';
 *
 * test.afterEach(async ({ consoleLogs }) => {
 *   assertNoJSErrors(consoleLogs);
 * });
 * ```
 */
export function assertNoJSErrors(consoleLogs: ConsoleCaptureData): void {
  if (consoleLogs.hasErrors()) {
    const errorMessages = consoleLogs.errors.map(e => e.message).join('\n');
    throw new Error(`JavaScript errors detected:\n${errorMessages}`);
  }
}

/**
 * Helper to get console error count for assertions
 */
export function getConsoleErrorCount(consoleLogs: ConsoleCaptureData): number {
  return consoleLogs.getErrorCount();
}
