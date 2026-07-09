/**
 * Journey Walk Driver — drives a locally-served MarketLens checkout through the
 * land -> signup -> submit -> results -> feedback journey with a Playwright
 * page, recording per-step outcomes.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E. Routes/selectors below are read
 * directly from the real MarketLens repo (applications.local_path) — src/routes/
 * web.js (land, signup), src/routes/app.js (login/session, generate, results,
 * feedback), src/views/appViews.js (form field names) — not invented.
 *
 * MarketLens-specific local-serve scoping (FR-3): generalizing this driver to
 * arbitrary future ventures (unknown tech stack/port/startup time) is explicitly
 * OUT OF SCOPE for this child.
 *
 * @module lib/eva/journey-walk-driver
 */

// @wire-check-exempt: Child E library, same status as persona-generator.js — complete and
// unit-tested, but its orchestration entry point (a follow-up wiring step that drives
// startLocalMarketLensServer -> runJourneyWalk -> mergeJourneyEvidence in sequence) has not
// landed yet. Child D (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D) shipped without wiring this
// module in — its scope was Child C's convergence loop only.

import { JOURNEY_STEPS } from './persona-generator.js';
import {
  executeJourneyStep as genericExecuteJourneyStep,
  runJourneyWalk as genericRunJourneyWalk,
} from '../apa/browser-executor.js';

/** MarketLens-specific local-serve config (FR-3). Port/health path/command read
 *  directly from the real repo's src/app.js (PORT ?? 3001, GET /api/health) and
 *  package.json ("start": "node src/app.js"). */
export const MARKETLENS_SERVE_CONFIG = Object.freeze({
  startCommand: 'node',
  startArgs: ['src/app.js'],
  port: 3001,
  healthPath: '/api/health',
  readinessTimeoutMs: 20_000,
  readinessPollIntervalMs: 500,
});

/**
 * Poll a health endpoint until it responds 200, or the timeout elapses.
 * Injectable fetchFn for testability (default: global fetch).
 * @param {{baseUrl: string, healthPath: string, timeoutMs: number, pollIntervalMs: number, fetchFn?: Function, sleepFn?: Function}} opts
 * @returns {Promise<boolean>} true if the server became ready within the timeout
 */
export async function waitForServerReady(opts) {
  const {
    baseUrl, healthPath, timeoutMs, pollIntervalMs,
    fetchFn = globalThis.fetch, sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetchFn(`${baseUrl}${healthPath}`);
      if (res?.ok) return true;
    } catch {
      // Server not listening yet — expected during startup, keep polling.
    }
    await sleepFn(pollIntervalMs);
  }
  return false;
}

/**
 * Start the MarketLens local dev server. Injectable spawnFn for testability
 * (default: node:child_process spawn). Returns a could-not-verify outcome
 * (never throws, never a false pass) if the server never becomes ready.
 * @param {{repoPath: string, spawnFn?: Function, fetchFn?: Function, sleepFn?: Function}} opts
 * @returns {Promise<{ready: boolean, process: object|null, baseUrl: string}>}
 */
export async function startLocalMarketLensServer({ repoPath, spawnFn, fetchFn, sleepFn } = {}) {
  if (!repoPath) throw new Error('[journey-walk-driver] startLocalMarketLensServer requires repoPath');

  let spawn = spawnFn;
  if (!spawn) {
    ({ spawn } = await import('node:child_process'));
  }

  const baseUrl = `http://localhost:${MARKETLENS_SERVE_CONFIG.port}`;
  const proc = spawn(MARKETLENS_SERVE_CONFIG.startCommand, MARKETLENS_SERVE_CONFIG.startArgs, {
    cwd: repoPath,
    env: { ...process.env, PORT: String(MARKETLENS_SERVE_CONFIG.port) },
  });

  const ready = await waitForServerReady({
    baseUrl,
    healthPath: MARKETLENS_SERVE_CONFIG.healthPath,
    timeoutMs: MARKETLENS_SERVE_CONFIG.readinessTimeoutMs,
    pollIntervalMs: MARKETLENS_SERVE_CONFIG.readinessPollIntervalMs,
    fetchFn,
    sleepFn,
  });

  if (!ready) {
    try { proc?.kill?.(); } catch { /* best-effort cleanup */ }
    return { ready: false, process: null, baseUrl };
  }

  return { ready: true, process: proc, baseUrl };
}

/**
 * Per-step execute functions. Each receives (page, persona, ctx) where ctx
 * carries {baseUrl, submissionId} accumulated across steps, and returns
 * {url, renderedStateSummary, submissionId?} on success, throwing on failure
 * (executeJourneyStep wraps this into the outcome record).
 */
const STEP_EXECUTORS = {
  async land(page, _persona, ctx) {
    await page.goto(`${ctx.baseUrl}/`);
    const heading = await page.locator('h1').first().textContent();
    if (!heading) throw new Error('land: no <h1> hero content rendered');
    return { url: `${ctx.baseUrl}/`, renderedStateSummary: heading.trim() };
  },

  async signup(page, persona, ctx) {
    const email = `${persona.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@journey-walk.test`;
    const password = 'JourneyWalk-Test-Pass-1';

    await page.goto(`${ctx.baseUrl}/signup`);
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    // #signup-message is populated by an async fetch()-driven client script (not a
    // navigation or a plain DOM mutation Playwright auto-waits for) — poll until it
    // renders rather than reading it immediately after click() (live-run finding:
    // reading immediately raced the fetch and always saw the empty initial text).
    await page.waitForFunction(
      () => (document.getElementById('signup-message')?.textContent || '').trim().length > 0,
      { timeout: 5000 }
    );
    // Live-run finding: a re-run against a still-warm server (same in-memory user
    // store) re-derives the SAME email for a given persona and gets "already
    // registered" on the second+ run. The real goal of this sub-step is having
    // valid credentials to log in with, not proving first-time registration —
    // "already registered" is an equally acceptable outcome, only a genuine
    // validation/server error is a real failure.
    const message = await page.locator('#signup-message').textContent();
    const registeredOrAlreadyExists = message && (message.includes('welcome') || message.includes('already registered'));
    if (!registeredOrAlreadyExists) {
      throw new Error(`signup: expected a welcome confirmation or an already-registered notice, got "${message}"`);
    }

    await page.goto(`${ctx.baseUrl}/app/login`);
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app$/);

    return { url: `${ctx.baseUrl}/app`, renderedStateSummary: `logged in as ${email}`, email };
  },

  async submit(page, persona, _ctx) {
    await page.fill('#productDescription', persona.stepIntents.submit);
    await page.fill('#marketDescription', `Target market for ${persona.name}: ${persona.demographics?.industry || 'general'}`);
    // Live-run finding: the /app page renders TWO button[type="submit"] elements
    // (a "Sign out" form ships first in the markup, then the generate form) — a
    // generic selector clicked Sign out instead, logging the persona out and
    // hanging on waitForURL. Scope to the generate form specifically.
    await page.click('form[action="/app/generate"] button[type="submit"]');
    await page.waitForURL(/\/app\/results\/[^/]+$/);
    const url = page.url();
    const submissionId = url.split('/results/')[1];
    return { url, renderedStateSummary: `redirected to results/${submissionId}`, submissionId };
  },

  async results(page, _persona, ctx) {
    if (!ctx.submissionId) throw new Error('results: no submissionId from the submit step');
    await page.goto(`${ctx.baseUrl}/app/results/${ctx.submissionId}`);
    const bodyText = await page.locator('body').textContent();
    if (!bodyText || /not.?found/i.test(bodyText)) {
      throw new Error('results: submission not found');
    }
    if (/pending/i.test(bodyText)) {
      throw new Error('results: generation still pending — expected synchronous completion');
    }
    return { url: `${ctx.baseUrl}/app/results/${ctx.submissionId}`, renderedStateSummary: 'results ready' };
  },

  async feedback(page, persona, ctx) {
    await page.fill('#fb-title', `Feedback from ${persona.name}`);
    await page.fill('#fb-description', persona.stepIntents.feedback);
    await page.click('button[type="submit"]');
    const bodyText = await page.locator('body').textContent();
    if (!bodyText) throw new Error('feedback: no confirmation rendered');
    return { url: `${ctx.baseUrl}/app/results/${ctx.submissionId}`, renderedStateSummary: 'feedback submitted' };
  },
};

/**
 * Execute one journey step against an injected Playwright-like page, capturing
 * the outcome without letting a thrown error abort the whole walk uncaught.
 *
 * SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-C: delegates to the generic,
 * venture-agnostic engine in lib/apa/browser-executor.js (extraction, not a
 * rewrite) — the exact control flow and outcome-record shape are unchanged;
 * only STEP_EXECUTORS moved from being read off this module's closure to
 * being passed as an explicit argument to the generic engine. The live-run
 * finding this preserves (only propagate keys the executor actually
 * returned, never blanket-include as `undefined`) now lives generically in
 * browser-executor.js's executeJourneyStep().
 * @param {object} page - Playwright Page (or a test-injected mock with the same shape)
 * @param {string} step - one of JOURNEY_STEPS
 * @param {object} persona - a generatePersonaFromArtifact() descriptor
 * @param {object} ctx - accumulated context {baseUrl, submissionId, ...}
 * @returns {Promise<{step: string, url: string|null, renderedStateSummary: string|null, success: boolean, failureReason: string|null, ctxUpdates: object}>}
 */
export async function executeJourneyStep(page, step, persona, ctx) {
  return genericExecuteJourneyStep(page, step, STEP_EXECUTORS, persona, ctx);
}

/**
 * Walk all JOURNEY_STEPS in order against an injected Playwright page. Stops at
 * the first failure (a real user cannot proceed past a broken signup/submit
 * step) and records the exact break point — never silently continues as if a
 * broken step succeeded, never crashes the whole run uncaught.
 *
 * Delegates to lib/apa/browser-executor.js's generic runJourneyWalk (see
 * executeJourneyStep's docstring above). Intentionally does NOT wrap `page`
 * with createResilientPage — this preserves this driver's exact tested
 * behavior byte-for-byte; drift resilience is opt-in for new consumers of
 * the generic engine, not retrofitted onto this proven driver.
 * @param {object} page
 * @param {object} persona
 * @param {{baseUrl: string}} opts
 * @returns {Promise<{outcomes: Array, completedAllSteps: boolean, brokenAtStep: string|null}>}
 */
export async function runJourneyWalk(page, persona, { baseUrl }) {
  return genericRunJourneyWalk(page, persona, JOURNEY_STEPS, STEP_EXECUTORS, { baseUrl });
}

export default {
  MARKETLENS_SERVE_CONFIG, waitForServerReady, startLocalMarketLensServer,
  executeJourneyStep, runJourneyWalk,
};
