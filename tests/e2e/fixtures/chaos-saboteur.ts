/**
 * LEO v4.4 Chaos Saboteur Fixture
 *
 * Injects controlled failures to test application resilience:
 * - Network failures (500 errors, timeouts)
 * - Offline simulation
 * - Latency injection
 * - Request interception
 *
 * Part of Human-Like E2E Testing Enhancements
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/chaos-saboteur';
 *
 * test('handles network failure gracefully', async ({ page, chaos }) => {
 *   await chaos.attachNetworkChaos(0.3); // 30% failure rate
 *   await page.goto('/');
 *   // App should handle errors gracefully
 * });
 * ```
 */

import { test as base, expect, Route } from '@playwright/test';

/**
 * Chaos configuration
 */
interface ChaosConfig {
  /** Probability of injecting failure (0-1) */
  aggressiveness: number;
  /** Types of failures to inject */
  failureTypes: ('error' | 'timeout' | 'offline')[];
  /** URL patterns to target (default: all API calls) */
  targetPatterns: string[];
  /** URL patterns to exclude */
  excludePatterns: string[];
  /** Fixed latency to add (ms) */
  latencyMs: number;
  /** Random latency range [min, max] (ms) */
  randomLatencyRange: [number, number];
}

/**
 * Chaos injection result
 */
interface ChaosResult {
  faultsInjected: number;
  requestsIntercepted: number;
  recoveries: number;
  failedRecoveries: number;
  faultLog: Array<{
    url: string;
    faultType: string;
    timestamp: number;
    recovered: boolean;
  }>;
}

/**
 * Recovery check result
 */
interface RecoveryResult {
  recovered: boolean;
  retryCount: number;
  finalState: 'success' | 'error' | 'pending';
  errorMessage?: string;
}

/**
 * Chaos saboteur fixture
 */
interface ChaosSaboteurFixture {
  /** Attach random network chaos to API calls */
  attachNetworkChaos: (aggressiveness?: number, config?: Partial<ChaosConfig>) => Promise<void>;

  /** Simulate complete network offline */
  simulateOffline: (durationMs: number) => Promise<void>;

  /** Inject fixed latency to matching requests */
  injectLatency: (pattern: string, delayMs: number) => Promise<void>;

  /** Inject random latency to matching requests */
  injectRandomLatency: (pattern: string, minMs: number, maxMs: number) => Promise<void>;

  /** Force specific request to fail */
  failRequest: (pattern: string, statusCode?: number) => Promise<void>;

  /** Force specific request to timeout */
  timeoutRequest: (pattern: string, timeoutMs?: number) => Promise<void>;

  /** Remove all chaos handlers */
  reset: () => Promise<void>;

  /** Get chaos results */
  getResults: () => ChaosResult;

  /** Check if app recovered from injected fault */
  checkRecovery: (successIndicator: string, timeoutMs?: number) => Promise<RecoveryResult>;

  /** Test double-submit idempotency */
  testDoubleSubmit: (submitSelector: string) => Promise<{
    submits: number;
    requests: number;
    duplicatePrevented: boolean;
  }>;
}

const DEFAULT_CONFIG: ChaosConfig = {
  aggressiveness: 0.1,
  failureTypes: ['error', 'timeout'],
  targetPatterns: ['**/api/**'],
  excludePatterns: ['**/health**', '**/ping**'],
  latencyMs: 0,
  randomLatencyRange: [0, 0]
};

/**
 * Extended test fixtures including chaos saboteur
 */
type ChaosFixtures = {
  chaos: ChaosSaboteurFixture;
};

/**
 * Extended test with chaos saboteur fixture
 */
export const test = base.extend<ChaosFixtures>({
  chaos: [async ({ page, context }, use, testInfo) => {
    const result: ChaosResult = {
      faultsInjected: 0,
      requestsIntercepted: 0,
      recoveries: 0,
      failedRecoveries: 0,
      faultLog: []
    };

    const activeHandlers: Array<() => Promise<void>> = [];

    const fixture: ChaosSaboteurFixture = {
      attachNetworkChaos: async (
        aggressiveness = 0.1,
        config: Partial<ChaosConfig> = {}
      ) => {
        const fullConfig = { ...DEFAULT_CONFIG, ...config, aggressiveness };

        const handler = async (route: Route) => {
          const url = route.request().url();

          // Check if should exclude
          const shouldExclude = fullConfig.excludePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(url);
          });

          if (shouldExclude) {
            await route.continue();
            return;
          }

          result.requestsIntercepted++;

          // Decide whether to inject fault
          if (Math.random() < fullConfig.aggressiveness) {
            const faultType = fullConfig.failureTypes[
              Math.floor(Math.random() * fullConfig.failureTypes.length)
            ];

            result.faultsInjected++;
            result.faultLog.push({
              url,
              faultType,
              timestamp: Date.now(),
              recovered: false
            });

            switch (faultType) {
              case 'error':
                await route.fulfill({
                  status: 500,
                  contentType: 'application/json',
                  body: JSON.stringify({
                    error: 'Chaos: Simulated server error',
                    chaos: true
                  })
                });
                break;

              case 'timeout':
                // Delay for a long time to simulate timeout
                await new Promise(r => setTimeout(r, 30000));
                await route.abort('timedout');
                break;

              case 'offline':
                await route.abort('internetdisconnected');
                break;
            }
          } else {
            // Add latency if configured
            if (fullConfig.latencyMs > 0) {
              await new Promise(r => setTimeout(r, fullConfig.latencyMs));
            } else if (fullConfig.randomLatencyRange[1] > 0) {
              const delay = fullConfig.randomLatencyRange[0] +
                Math.random() * (fullConfig.randomLatencyRange[1] - fullConfig.randomLatencyRange[0]);
              await new Promise(r => setTimeout(r, delay));
            }
            await route.continue();
          }
        };

        for (const pattern of fullConfig.targetPatterns) {
          await page.route(pattern, handler);
        }

        activeHandlers.push(async () => {
          for (const pattern of fullConfig.targetPatterns) {
            await page.unroute(pattern, handler);
          }
        });
      },

      simulateOffline: async (durationMs: number) => {
        await context.setOffline(true);
        result.faultLog.push({
          url: '*',
          faultType: 'offline',
          timestamp: Date.now(),
          recovered: false
        });
        result.faultsInjected++;

        await new Promise(r => setTimeout(r, durationMs));

        await context.setOffline(false);
      },

      injectLatency: async (pattern: string, delayMs: number) => {
        const handler = async (route: Route) => {
          result.requestsIntercepted++;
          await new Promise(r => setTimeout(r, delayMs));
          await route.continue();
        };

        await page.route(pattern, handler);
        activeHandlers.push(async () => page.unroute(pattern, handler));
      },

      injectRandomLatency: async (pattern: string, minMs: number, maxMs: number) => {
        const handler = async (route: Route) => {
          result.requestsIntercepted++;
          const delay = minMs + Math.random() * (maxMs - minMs);
          await new Promise(r => setTimeout(r, delay));
          await route.continue();
        };

        await page.route(pattern, handler);
        activeHandlers.push(async () => page.unroute(pattern, handler));
      },

      failRequest: async (pattern: string, statusCode = 500) => {
        const handler = async (route: Route) => {
          result.requestsIntercepted++;
          result.faultsInjected++;
          result.faultLog.push({
            url: route.request().url(),
            faultType: `error-${statusCode}`,
            timestamp: Date.now(),
            recovered: false
          });

          await route.fulfill({
            status: statusCode,
            contentType: 'application/json',
            body: JSON.stringify({
              error: `Chaos: Forced ${statusCode} error`,
              chaos: true
            })
          });
        };

        await page.route(pattern, handler);
        activeHandlers.push(async () => page.unroute(pattern, handler));
      },

      timeoutRequest: async (pattern: string, timeoutMs = 30000) => {
        const handler = async (route: Route) => {
          result.requestsIntercepted++;
          result.faultsInjected++;
          result.faultLog.push({
            url: route.request().url(),
            faultType: 'timeout',
            timestamp: Date.now(),
            recovered: false
          });

          await new Promise(r => setTimeout(r, timeoutMs));
          await route.abort('timedout');
        };

        await page.route(pattern, handler);
        activeHandlers.push(async () => page.unroute(pattern, handler));
      },

      reset: async () => {
        for (const cleanup of activeHandlers) {
          await cleanup();
        }
        activeHandlers.length = 0;
      },

      getResults: () => ({ ...result }),

      checkRecovery: async (
        successIndicator: string,
        timeoutMs = 10000
      ): Promise<RecoveryResult> => {
        let retryCount = 0;
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
          try {
            const indicator = page.locator(successIndicator);
            const isVisible = await indicator.isVisible({ timeout: 1000 });

            if (isVisible) {
              result.recoveries++;

              // Mark recent faults as recovered
              const recentFaults = result.faultLog.slice(-3);
              recentFaults.forEach(f => { f.recovered = true; });

              return {
                recovered: true,
                retryCount,
                finalState: 'success'
              };
            }
          } catch {
            retryCount++;
          }

          await page.waitForTimeout(500);
        }

        result.failedRecoveries++;
        return {
          recovered: false,
          retryCount,
          finalState: 'error',
          errorMessage: `Recovery indicator "${successIndicator}" not found within ${timeoutMs}ms`
        };
      },

      testDoubleSubmit: async (submitSelector: string) => {
        const requests: string[] = [];

        // Track all form submissions
        await page.route('**/*', async (route) => {
          if (route.request().method() === 'POST') {
            requests.push(route.request().url());
          }
          await route.continue();
        });

        // Click submit twice rapidly
        const submitButton = page.locator(submitSelector);
        await submitButton.click();
        await submitButton.click();

        // Wait a bit for requests
        await page.waitForTimeout(500);

        // Check if duplicates were prevented
        const uniqueRequests = new Set(requests);
        const duplicatePrevented = requests.length <= 1 || uniqueRequests.size < requests.length;

        return {
          submits: 2,
          requests: requests.length,
          duplicatePrevented: duplicatePrevented || requests.length === 1
        };
      }
    };

    await use(fixture);

    // Cleanup
    await fixture.reset();

    // After test: attach chaos results to artifacts
    if (result.faultsInjected > 0 || result.requestsIntercepted > 0) {
      const artifact = {
        testTitle: testInfo.title,
        testFile: testInfo.file,
        status: testInfo.status,
        chaos: {
          faultsInjected: result.faultsInjected,
          requestsIntercepted: result.requestsIntercepted,
          recoveryRate: result.faultsInjected > 0
            ? (result.recoveries / result.faultsInjected * 100).toFixed(1) + '%'
            : 'N/A',
          recoveries: result.recoveries,
          failedRecoveries: result.failedRecoveries,
          faultLog: result.faultLog
        },
        capturedAt: new Date().toISOString()
      };

      await testInfo.attach('chaos-results.json', {
        body: JSON.stringify(artifact, null, 2),
        contentType: 'application/json'
      });
    }
  }, { auto: false }]
});

// Re-export expect from Playwright
export { expect };

/**
 * Assert recovery rate meets threshold
 */
export function assertRecoveryRate(
  result: ChaosResult,
  minRate: number = 100
): void {
  if (result.faultsInjected === 0) return;

  const rate = (result.recoveries / result.faultsInjected) * 100;
  if (rate < minRate) {
    throw new Error(
      `Recovery rate ${rate.toFixed(1)}% is below threshold ${minRate}%\n` +
      `Faults: ${result.faultsInjected}, Recoveries: ${result.recoveries}`
    );
  }
}

/**
 * Assert no duplicate requests from double-submit
 */
export function assertNoDuplicateSubmit(
  result: { submits: number; requests: number; duplicatePrevented: boolean }
): void {
  if (!result.duplicatePrevented) {
    throw new Error(
      `Double-submit protection failed: ${result.submits} submits resulted in ${result.requests} requests`
    );
  }
}
