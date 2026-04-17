/**
 * Stitch Browser Trigger — Playwright CDP
 *
 * Opens a Stitch project URL in the user's running Edge browser via
 * Chrome DevTools Protocol. This triggers Google's state-sync commit
 * (workaround for bug #123348) using the user's authenticated session.
 *
 * Requires Edge running with --remote-debugging-port=9222.
 * Falls back to exec("start ...") if CDP is unavailable.
 *
 * SD-S17-DESIGN-INTELLIGENCE-ORCH-001 (permanent Playwright CDP integration)
 * @module lib/eva/bridge/stitch-browser-trigger
 */

// Port 9223: real Edge browser (with user's authenticated Google session).
// Port 9222 is often claimed by LenovoVantage's embedded Chromium — connecting
// to it gives an unauthenticated browser without canvas rendering support.
// Edge must be launched with: msedge.exe --remote-debugging-port=9223 --user-data-dir="<profile>"
const CDP_ENDPOINT = process.env.STITCH_CDP_ENDPOINT || 'http://localhost:9223';
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Open a Stitch project URL in the user's authenticated Edge browser via CDP.
 * Navigates in a new tab, waits for state sync, then leaves the tab open.
 *
 * @param {string} url - Stitch project URL
 * @param {object} [options]
 * @param {number} [options.syncWaitMs=30000] - How long to wait for state sync
 * @param {boolean} [options.closeTab=false] - Close the tab after sync (default: leave open)
 * @param {string} [options.cdpEndpoint] - CDP endpoint override
 * @returns {Promise<{success: boolean, method: string, error?: string}>}
 */
export async function openStitchInBrowser(url, options = {}) {
  const {
    syncWaitMs = parseInt(process.env.STITCH_BROWSER_COMMIT_WAIT_MS || '30000', 10),
    closeTab = false,
    cdpEndpoint = CDP_ENDPOINT,
  } = options;

  // Try Playwright CDP first
  try {
    const result = await openViaCDP(url, { syncWaitMs, closeTab, cdpEndpoint });
    return result;
  } catch (cdpErr) {
    console.warn(`[stitch-browser-trigger] CDP failed: ${cdpErr.message}. Falling back to OS open.`);
  }

  // Fallback: exec-based open (works when Edge is the default browser but not in server context)
  try {
    const result = await openViaExec(url);
    return result;
  } catch (execErr) {
    return { success: false, method: 'none', error: `CDP: ${cdpErr?.message}; exec: ${execErr.message}` };
  }
}

/**
 * Open URL via Playwright CDP connection to running Edge instance.
 */
async function openViaCDP(url, { syncWaitMs, closeTab, cdpEndpoint }) {
  // Check CDP is reachable before importing Playwright (fast fail)
  const checkUrl = `${cdpEndpoint}/json/version`;
  try {
    const resp = await fetch(checkUrl, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) throw new Error(`CDP check returned ${resp.status}`);
  } catch (e) {
    throw new Error(`CDP not reachable at ${cdpEndpoint} — is Edge running with --remote-debugging-port=9222? (${e.message})`);
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.connectOverCDP(cdpEndpoint);

  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('No browser context found via CDP');

    // Create a new tab. setViewportSize() over CDP only applies CSS emulation —
    // it does NOT resize the actual browser window. Stitch detects the real
    // window width to decide between split layout (chat + canvas) vs chat-only.
    // We must resize the actual window via CDP Browser.setWindowBounds.
    const page = await context.newPage();

    // Resize the actual browser window via CDP so Stitch sees a wide viewport.
    // This is the key fix: setViewportSize only emulates CSS, but Stitch reads
    // the real window.innerWidth to decide whether to show the canvas panel.
    try {
      const cdpSession = await context.newCDPSession(page);
      const { windowId } = await cdpSession.send('Browser.getWindowForTarget');
      await cdpSession.send('Browser.setWindowBounds', {
        windowId,
        bounds: { width: VIEWPORT.width, height: VIEWPORT.height, windowState: 'normal' },
      });
      console.info(`[stitch-browser-trigger] Browser window resized to ${VIEWPORT.width}x${VIEWPORT.height} via CDP`);
    } catch (resizeErr) {
      console.warn(`[stitch-browser-trigger] Window resize failed (non-fatal): ${resizeErr.message}`);
      // Fallback: at least set CSS viewport emulation
      await page.setViewportSize(VIEWPORT);
    }

    // Bring to front BEFORE navigation — Stitch lazy-loads screen data
    // only when the tab is visible/focused. If the tab is backgrounded,
    // the canvas never initializes and screens don't appear.
    await page.bringToFront();

    console.info(`[stitch-browser-trigger] Opening ${url} via CDP (window ${VIEWPORT.width}x${VIEWPORT.height})`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    // Wait for Stitch app to fully initialize (canvas + screen thumbnails).
    // Stitch loads asynchronously — the React app hydrates after DOMContentLoaded.
    // networkidle + extra wait ensures the canvas panel and screen data are loaded.
    console.info(`[stitch-browser-trigger] Page loaded. Waiting ${syncWaitMs / 1000}s for state sync + canvas hydration...`);
    await page.waitForTimeout(syncWaitMs);

    if (closeTab) {
      await page.close();
      console.info('[stitch-browser-trigger] Tab closed after sync.');
    } else {
      console.info('[stitch-browser-trigger] Tab left open for manual review.');
    }

    return { success: true, method: 'playwright_cdp' };
  } finally {
    // Disconnect CDP — does NOT close Edge
    await browser.close();
  }
}

/**
 * Fallback: open URL via OS exec command.
 */
async function openViaExec(url) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  await execAsync(cmd);
  console.info(`[stitch-browser-trigger] Browser opened via exec: ${url}`);
  return { success: true, method: 'exec' };
}
