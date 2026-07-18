/**
 * Shared pre-send rubric engine — SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-A.
 *
 * The single, reusable, side-effect-free pre-send evaluator that BOTH outbound gates call
 * (the chairman-SMS gate -C and the Adam-outbound gate -D). One source of truth for
 * pre-send validation so the two gates cannot drift.
 *
 * Layering (order is the contract, not a suggestion):
 *   1. Deterministic lint runs FIRST and can block. On a lint block the independent review
 *      is NEVER called — a malformed decision must be structurally unsendable (the F3 fix),
 *      not left to a judgment model.
 *   2. Only if the lint passes does the INDEPENDENT review run (a separate evaluation of the
 *      finished message; never the composer self-grading).
 *
 * evaluate() is pure: no I/O, no send, no credential handling (credential isolation is the
 * chairman-SMS gate -C's job). It returns a structured, JSON-serializable verdict the gates
 * and the durable send-log (-B/-E) consume uniformly.
 */

import { lint, effectiveType } from './lint.js';
import { reviewMessage } from './llm-review.js';

const CONSOLE_AUTHORITY = new Set(['spend', 'irreversible', 'chairman_only']);

/**
 * Authority-class routing: spend / irreversible / chairman-only decisions go to the console
 * (a human, ratifiable surface) — NEVER SMS-decided — regardless of whether they reduce to a
 * clean YES/NO. Reducibility is orthogonal to authority (PRD FR-4). Everything else is 'sms'.
 * @param {object} message
 * @returns {'console'|'sms'}
 */
export function authorityClass(message = {}) {
  return CONSOLE_AUTHORITY.has(message.authority) ? 'console' : 'sms';
}

/**
 * Evaluate a message against the full pre-send rubric.
 * @param {object} message - { type?, body, options?, replyInstruction?, replyId?, decisionCount?, authority?, noReplyConsequence? }
 * @param {object} context - { nowHourET?/now?, maxLength?, sentInWindow?, rateCap?, allowQuietHours? }
 * @param {object} opts - { reviewer? } injectable independent reviewer (production wires a real LLM)
 * @returns {Promise<{verdict:'pass'|'blocked', effectiveType:string, authorityClass:'console'|'sms', noReplyConsequence:string|null, lintFindings:Array, llmReview:object|null, blockedReasons:string[]}>}
 */
export async function evaluate(message = {}, context = {}, opts = {}) {
  const type = effectiveType(message);
  const isDecision = type === 'decision';
  const routing = authorityClass(message);
  const noReplyConsequence = typeof message.noReplyConsequence === 'string' && message.noReplyConsequence.trim().length > 0
    ? message.noReplyConsequence.trim()
    : null;

  const { findings, blocked: lintBlocked } = lint(message, context);

  // Rubric addition (consent integrity, PRD FR-4): a DECISION must state its no-reply
  // consequence so the ratified auto-default never operates invisibly. Treated as a
  // blocking pre-send finding alongside the lint.
  const consentFindings = [];
  if (isDecision && !noReplyConsequence) {
    consentFindings.push({
      check: 'no_reply_consequence', ok: false, blocking: true,
      detail: 'a decision must state its no-reply consequence (e.g. "no reply by <T> -> I proceed <default> (reversible)")',
    });
  }

  const lintFindings = [...findings, ...consentFindings];
  const blocked = lintBlocked || consentFindings.length > 0;

  if (blocked) {
    // Hard fail: do NOT run the independent review (structural F3 fix — no LLM on a block).
    return {
      verdict: 'blocked',
      effectiveType: type,
      authorityClass: routing,
      noReplyConsequence,
      lintFindings,
      llmReview: null,
      blockedReasons: lintFindings.filter((f) => f.blocking && !f.ok).map((f) => `${f.check}: ${f.detail}`),
    };
  }

  // Lint passed → run the independent review (separate call, never the composer).
  const llmReview = await reviewMessage(message, context, opts);

  return {
    verdict: 'pass',
    effectiveType: type,
    authorityClass: routing,
    noReplyConsequence,
    lintFindings,
    llmReview,
    blockedReasons: [],
  };
}

export { lint, effectiveType } from './lint.js';
export { reviewMessage, heuristicReviewer } from './llm-review.js';
export { findSecrets, SECRET_PATTERNS } from './secret-patterns.js';
