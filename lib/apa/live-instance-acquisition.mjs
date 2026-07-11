/**
 * APA live-instance acquisition — SD-LEO-INFRA-APA-PHASE-STANDING-001 (FR-1).
 *
 * Child A (sandbox-harness.mjs) boots a LOCAL `npm run dev` sandbox and is the
 * wrong shape for an already-deployed remote venture. Child C (browser-executor.js)
 * explicitly documents that it never boots an instance itself — callers must
 * inject {baseUrl, page} for an already-live, already-navigable instance. This
 * module is that injection layer for the live-remote-URL case: launch a
 * Playwright browser, navigate to the deployed URL, and hand back a page. No
 * sandbox, no boot config, no seeding — deliberately minimal (risk-agent:
 * this is the genuinely-new seam, kept as small as possible).
 *
 * @module lib/apa/live-instance-acquisition
 */

const PROBE_USER_AGENT = 'leo-apa-probe/1.0 (+standing-qa)';
const DEFAULT_NAV_TIMEOUT_MS = 15000;

// SSRF guard (adversarial review): venture_deployments.url is machine-written,
// not a hardened trust boundary. Reject non-http(s) schemes and literal
// private/loopback/link-local hosts BEFORE any fetch/navigation. This does
// NOT protect against a malicious *redirect target* (Playwright follows
// redirects transparently) -- full redirect-interception is out of scope for
// this fix; the residual risk is bounded because no response body is ever
// written to an attacker-readable sink, only structural pass/fail verdicts.
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local, incl. cloud metadata endpoints
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
];

export function isBlockedHost(hostname) {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Launch a browser and navigate to a live, already-deployed venture URL.
 * Never throws on a navigation/timeout failure — returns a typed result so
 * callers can distinguish self-fault (acquisition failure) from
 * venture-fault (structural assertion failure) per the SD's dampening
 * taxonomy requirement.
 *
 * @param {string} url - live, already-deployed venture URL
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=15000]
 * @param {{chromium: {launch: Function}}} [opts.playwright] - injectable for tests (default: dynamic import('playwright'))
 * @returns {Promise<{ok: true, page: object, browser: object, teardown: Function} | {ok: false, reason: string}>}
 */
export async function acquireLiveInstance(url, opts = {}) {
  const { timeoutMs = DEFAULT_NAV_TIMEOUT_MS } = opts;
  if (!url || typeof url !== 'string') {
    return { ok: false, reason: 'invalid_url' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'blocked_scheme' };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, reason: 'blocked_host' };
  }

  let playwright;
  try {
    playwright = opts.playwright || (await import('playwright'));
  } catch (err) {
    return { ok: false, reason: `playwright_unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }

  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: PROBE_USER_AGENT });
    page.setDefaultTimeout(timeoutMs);

    const response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
    const status = response ? response.status() : null;
    if (status !== null && status >= 400) {
      await browser.close();
      return { ok: false, reason: `http_${status}` };
    }

    const teardown = async () => {
      try {
        await browser.close();
      } catch {
        // best-effort: a teardown failure must never mask the assessment result
      }
    };

    return { ok: true, page, browser, teardown };
  } catch (err) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // best-effort close on the acquisition-failure path
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    const reason = /timeout/i.test(message) ? 'timeout' : `unreachable: ${message}`;
    return { ok: false, reason };
  }
}

export const _internal = { PROBE_USER_AGENT, DEFAULT_NAV_TIMEOUT_MS };
