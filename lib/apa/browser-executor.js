/**
 * APA Browser Executor — Layer B1 (docs/design/apa-automated-product-assessment-design.md
 * §2, §8 Phase-1 MVP). SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-C.
 *
 * Venture-agnostic engine that walks an injected sequence of journey steps
 * against an injected Playwright-like page, recording per-step outcomes.
 * Extracted from lib/eva/journey-walk-driver.js (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E)
 * to remove the MarketLens-specific step-executor coupling — journeySteps and
 * stepExecutors are now caller-injected, so any venture's step-executor set
 * can drive the same proven control flow (outcome-record shape, stop-at-
 * first-failure, ctx-merge semantics).
 *
 * Instance-acquisition contract (design §11.4 — Child A's responsibility,
 * not this module's): callers MUST inject {baseUrl, page} for an ALREADY-LIVE,
 * already-navigable instance. This module never boots, seeds, or tears down
 * an instance itself.
 *
 * Selector-drift resilience (design §5 T1 tier) is available via
 * createResilientPage(), wired from the existing deterministic
 * lib/uat/selector-drift-recovery.js — zero model cost. It is OPT-IN: wrap a
 * page before passing it to runJourneyWalk/executeJourneyStep to enable it.
 *
 * @module lib/apa/browser-executor
 */

import { recoverFromDrift } from '../uat/selector-drift-recovery.js';

/**
 * Best-effort DOM-capture-shaped metadata synthesized from a raw selector
 * string, for drift-recovery strategies that need attribute signal. This is
 * NOT a real capture (no live element was observed before the drift) — only
 * as much signal as the selector string itself declares (data-testid, id,
 * class). Selectors with no such signal (e.g. plain #id) yield zero matching
 * strategies and recovery legitimately reports not-recovered.
 * @param {string} selector
 * @returns {object} a domCapture shape accepted by recoverFromDrift()
 */
function domCaptureFromSelector(selector) {
  const attributes = {};
  const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/);
  if (testIdMatch) attributes['data-testid'] = testIdMatch[1];
  const classMatches = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  if (classMatches.length) attributes.class = classMatches.join(' ');

  return {
    primary_selector: selector,
    alternative_selectors: [],
    tag_name: null,
    text_content: null,
    attributes,
    bounding_box: null,
  };
}

/**
 * Attempt an action; on failure, attempt deterministic selector-drift
 * recovery and retry once with the recovered selector. Re-throws the
 * original error if recovery finds nothing (a genuinely broken flow should
 * fail, not be silently rescued).
 * @param {object} page
 * @param {string} selector
 * @param {(resolvedSelector: string) => Promise<*>} action
 * @param {(recovery: object) => void} [onRecovery]
 */
async function withDriftRecovery(page, selector, action, onRecovery) {
  try {
    return await action(selector);
  } catch (originalErr) {
    const domCapture = domCaptureFromSelector(selector);
    const recovery = await recoverFromDrift(page, domCapture);
    if (recovery.recovered) {
      onRecovery?.(recovery);
      return await action(recovery.new_selector);
    }
    throw originalErr;
  }
}

/**
 * Wrap a Playwright-like page so fill()/click() transparently attempt
 * deterministic selector-drift recovery before failing outright. All other
 * page methods pass through unchanged.
 * @param {object} page
 * @param {(recovery: object) => void} [onRecovery] - called with the
 *   recoverFromDrift() result whenever a drift is successfully recovered
 * @returns {object} a page-shaped object safe to pass to step executors
 */
export function createResilientPage(page, onRecovery) {
  return {
    ...page,
    async fill(selector, value, options) {
      return withDriftRecovery(page, selector, (s) => page.fill(s, value, options), onRecovery);
    },
    async click(selector, options) {
      return withDriftRecovery(page, selector, (s) => page.click(s, options), onRecovery);
    },
  };
}

/**
 * Execute one journey step against an injected page, using a caller-provided
 * step-executor map. Never lets a thrown error abort the whole walk uncaught
 * — captures the outcome instead. Any key on the executor's return value
 * other than url/renderedStateSummary propagates into ctxUpdates (only when
 * not undefined), generalizing journey-walk-driver.js's submissionId/email
 * carry-forward without hardcoding venture-specific key names.
 * @param {object} page - Playwright Page (optionally wrapped via createResilientPage)
 * @param {string} step - a key of stepExecutors
 * @param {Object<string, Function>} stepExecutors - {stepId: async (page, persona, ctx) => {url, renderedStateSummary, ...extra}}
 * @param {object} persona
 * @param {object} ctx - accumulated context, e.g. {baseUrl, ...priorStepExtras}
 * @returns {Promise<{step: string, url: string|null, renderedStateSummary: string|null, success: boolean, failureReason: string|null, ctxUpdates: object}>}
 */
export async function executeJourneyStep(page, step, stepExecutors, persona, ctx) {
  const executor = stepExecutors[step];
  if (!executor) throw new Error(`[browser-executor] executeJourneyStep: unknown step "${step}"`);

  try {
    const { url, renderedStateSummary, ...extra } = await executor(page, persona, ctx);
    const ctxUpdates = Object.fromEntries(
      Object.entries(extra).filter(([, value]) => value !== undefined)
    );
    return { step, url, renderedStateSummary, success: true, failureReason: null, ctxUpdates };
  } catch (err) {
    return { step, url: null, renderedStateSummary: null, success: false, failureReason: err.message, ctxUpdates: {} };
  }
}

/**
 * Walk journeySteps in order against an injected page, using stepExecutors.
 * Stops at the first failure and records the exact break point — never
 * silently continues past a broken step (a real user cannot proceed past a
 * broken journey step either), never crashes the whole run uncaught.
 * @param {object} page
 * @param {object} persona
 * @param {string[]} journeySteps
 * @param {Object<string, Function>} stepExecutors
 * @param {{baseUrl: string}} opts
 * @returns {Promise<{outcomes: Array, completedAllSteps: boolean, brokenAtStep: string|null}>}
 */
export async function runJourneyWalk(page, persona, journeySteps, stepExecutors, { baseUrl }) {
  const outcomes = [];
  let ctx = { baseUrl };

  for (const step of journeySteps) {
    const outcome = await executeJourneyStep(page, step, stepExecutors, persona, ctx);
    outcomes.push(outcome);
    if (!outcome.success) {
      return { outcomes, completedAllSteps: false, brokenAtStep: step };
    }
    ctx = { ...ctx, ...outcome.ctxUpdates };
  }

  return { outcomes, completedAllSteps: true, brokenAtStep: null };
}

export default {
  createResilientPage, executeJourneyStep, runJourneyWalk,
};
