/**
 * Diagnostic Test: Verify Event Listener Registration
 * Purpose: Test if 'test:complete-research' event listener is registered in VentureCreationPage
 * Component: VentureCreationPage.tsx (lines 263-286)
 *
 * PREREQUISITES:
 * - Dev server must be running on localhost:8080
 * - Run this test with: npx playwright test venture-creation-event-listener-diagnostic.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test';

test.describe('VentureCreationPage Event Listener Diagnostic', () => {
  test.beforeEach(async ({ page }) => {
    // Enable console logging to capture the test event message
    page.on('console', (msg) => {
      const text = msg.text();
      console.log(`[BROWSER CONSOLE] ${text}`);
    });
  });

  test('should verify event listener is registered and functional', async ({ page }) => {
    const consoleLogs: string[] = [];

    // Capture console logs
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    // Navigate to the venture creation page
    console.log('[TEST] Navigating to http://localhost:8080/ventures/new');
    await page.goto('http://localhost:8080/ventures/new');

    // Wait for the component to mount (look for a known element)
    console.log('[TEST] Waiting for page to load...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give React time to mount and run useEffect

    // DIAGNOSTIC 1: Check if we can access window object
    const windowCheck = await page.evaluate(() => {
      return typeof window !== 'undefined';
    });
    console.log(`[DIAGNOSTIC] Window object accessible: ${windowCheck}`);
    expect(windowCheck).toBe(true);

    // DIAGNOSTIC 2: Manually dispatch the event and monitor console
    console.log('[TEST] Dispatching test:complete-research event...');

    const eventDispatched = await page.evaluate(() => {
      try {
        const event = new CustomEvent('test:complete-research');
        console.log('[TEST] About to dispatch event');
        window.dispatchEvent(event);
        console.log('[TEST] Event dispatched successfully');
        return { success: true, error: null };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('[TEST] Event dispatch result:', eventDispatched);
    expect(eventDispatched.success).toBe(true);

    // Wait for console log to appear and any state updates
    await page.waitForTimeout(2000);

    // DIAGNOSTIC 3: Check if the expected console log appeared
    const expectedLog = '[TEST EVENT] Completing research for E2E test';
    const logFound = consoleLogs.some(log => log.includes(expectedLog));

    console.log('[TEST] All console logs captured:');
    consoleLogs.forEach(log => console.log(`  - ${log}`));
    console.log(`[TEST] Expected log found: ${logFound}`);

    if (!logFound) {
      console.error('[ERROR] Event listener may not be registered!');
      console.error('[POSSIBLE CAUSES]:');
      console.error('  1. Component not mounted yet');
      console.error('  2. useEffect not executed');
      console.error('  3. Event listener syntax error');
      console.error('  4. Component unmounted before event dispatched');
    } else {
      console.log('[SUCCESS] Event listener is working!');
    }

    // This assertion will show us if the listener is working
    expect(logFound, 'Event listener should log to console when event is dispatched').toBe(true);
  });

  test('alternative: check listener registration via monkey-patch', async ({ page }) => {
    // Intercept addEventListener BEFORE the page loads
    await page.evaluateOnNewDocument(() => {
      const originalAddEventListener = window.addEventListener;
      (window as any).__testListeners = [];

      window.addEventListener = function(type: string, listener: any, options?: any) {
        console.log(`[INTERCEPT] Event listener registered: ${type}`);
        (window as any).__testListeners.push({
          type,
          hasListener: typeof listener === 'function'
        });
        return originalAddEventListener.call(this, type, listener, options);
      };
    });

    console.log('[TEST] Navigating to page with addEventListener interceptor');
    await page.goto('http://localhost:8080/ventures/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check if our event was registered
    const listeners = await page.evaluate(() => {
      return (window as any).__testListeners || [];
    });

    console.log('[TEST] All registered event listeners:');
    listeners.forEach((l: any) => {
      console.log(`  - Type: ${l.type}, Has listener: ${l.hasListener}`);
    });

    const testEventListener = listeners.find((l: any) =>
      l.type === 'test:complete-research'
    );

    if (testEventListener) {
      console.log('[SUCCESS] test:complete-research listener IS registered');
    } else {
      console.error('[ERROR] test:complete-research listener NOT found');
      console.error('[REGISTERED TYPES]:', listeners.map((l: any) => l.type));
    }

    expect(testEventListener, 'test:complete-research listener should be registered').toBeDefined();
  });

  test('verify component renders and check DOM structure', async ({ page }) => {
    console.log('[TEST] Navigating to venture creation page');
    await page.goto('http://localhost:8080/ventures/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take a screenshot for manual inspection
    await page.screenshot({ path: 'test-results/venture-creation-page.png', fullPage: true });
    console.log('[TEST] Screenshot saved to test-results/venture-creation-page.png');

    // Check if the page has expected content
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('[TEST] Page content preview:', bodyText.substring(0, 500));

    // Try to find any venture-related text
    const hasVentureContent = bodyText.toLowerCase().includes('venture');
    console.log(`[TEST] Page contains 'venture' text: ${hasVentureContent}`);
  });
});
