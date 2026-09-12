'use strict';
/**
 * lib/adam/measured-number-provenance.cjs — QF-20260912-901 (FIX SHAPE (a) of QF-20260912-079).
 *
 * A chairman-facing body citing a first-use number with no measured_by[] stamp reached the
 * pre-send hold unmeasured -- the Solomon grade was the ONLY probe, after composition (three of
 * four held packets on 2026-09-12 carried such a number). This makes the ratified rule a236d122
 * ("a number cited for the first time gets the 30-second probe BEFORE it ships") mechanical at
 * the point the number is BORN, rather than relying on a reviewer to catch it every time.
 *
 * DELIBERATELY COARSE, not exact-position matching: a number is "stamped" if ANY measured_by[]
 * entry's value stringifies to the same digit run, regardless of where in the body it appears.
 * Exact positional correlation would require the composer to thread structured references through
 * free-text prose -- brittle, and not how any composer works today. Presence-of-provenance for
 * EVERY first-use number in the body is the actual guarantee this closes.
 */

// Excludes a number embedded in a longer identifier (QF-20260912-901, #8788, 2026-09-12 dates):
// adjacency to a word char, '#', or '-' on either side means it's part of a larger token, not a
// standalone first-use claim. KNOWN LIMITATION: a genuinely bare first-use number immediately
// touching punctuation this regex treats as an id/date marker could slip through undetected --
// documented, not silently assumed complete.
const NUMBER_TOKEN_RE = /(?<![\w#-])\d{2,}(?![\w-])/g;

/**
 * @param {string} body
 * @returns {string[]} de-duplicated digit-run tokens found in body
 */
function extractNumberTokens(body) {
  if (typeof body !== 'string' || !body) return [];
  return Array.from(new Set(body.match(NUMBER_TOKEN_RE) || []));
}

function stampedValues(measuredBy) {
  const values = new Set();
  for (const entry of Array.isArray(measuredBy) ? measuredBy : []) {
    if (entry && entry.value !== undefined && entry.value !== null) values.add(String(entry.value));
  }
  return values;
}

/**
 * @param {string} body
 * @param {Array<{value, instrument?, row_ref?, measured_at?}>} [measuredBy]
 * @returns {{ok: true} | {ok: false, unstampedNumber: string}}
 */
function checkMeasuredByProvenance(body, measuredBy) {
  const numbers = extractNumberTokens(body);
  if (numbers.length === 0) return { ok: true };
  const stamped = stampedValues(measuredBy);
  for (const n of numbers) {
    if (!stamped.has(n)) return { ok: false, unstampedNumber: n };
  }
  return { ok: true };
}

module.exports = { checkMeasuredByProvenance, extractNumberTokens, NUMBER_TOKEN_RE };
