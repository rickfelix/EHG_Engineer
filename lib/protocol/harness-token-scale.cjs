'use strict';
/**
 * THE ONE PLACE THAT KNOWS HOW MANY HARNESS TOKENS A FILE COSTS.
 * SD-LEO-INFRA-CONTRACT-READ-COVERAGE-001.
 *
 * *** WHY THIS FILE EXISTS: TWO CONSTANTS FOR ONE PHYSICAL QUANTITY. ***
 * Until now the repo carried two rival answers to "how big is this file to the Read tool":
 *   claude-md-generator/index.js  HARNESS_BYTES_PER_TOKEN = 2.4177   (bytes, blocking, correct)
 *   contract-read-coverage.cjs    CL100K_TO_HARNESS = 1.85           (cl100k on FRAMED text, wrong)
 * The second overshot by 43-61% on the phase-file family and manufactured false partial-read
 * verdicts that disarmed live seats. Two representations of one quantity is the condition; this
 * module collapses it to one, which is the point of the fix rather than a tidiness pass.
 *
 * PROVENANCE OF THE NUMBER, which is not mine and is deliberately not re-derived here: it comes
 * from the harness's own truncation notices on this file family — a padded CLAUDE_LEAD.md at
 * 64,613 bytes reported 26,722 tokens, agreeing to 0.1% with CLAUDE_PLAN.md at 92,184 bytes /
 * 38,166 tokens. Six byte-paired receipts put the spread at 2.3698-2.5820 B/token, max error 6.80%.
 *
 * *** THE HONEST LIMIT, STATED HERE BECAUSE IT IS INVISIBLE AT THE CALL SITE. ***
 * A CONSTANT CARRIES ITS CALIBRATION DOMAIN. This one is calibrated on PROSE-AND-TABLE protocol
 * documents. It is CONTENT-BLIND: SECURITY measured 1.32 B/token for random ASCII, 1.40 for base64
 * and 1.77 for minified text, so a contract that gains a base64 blob costs far more per byte than
 * this predicts and would be waved through as fitting while it truncates — the original defect,
 * restored by the fix. `cl100kRawLowerBound` below exists to close exactly that hole, and it needs
 * no calibration at all.
 *
 * NOT chosen because it is the most accurate model. On a single basis cl100k-on-RAW is about twice
 * as tight (+-3.0% against +-4.3%). It is chosen because it is already shipped, already validated,
 * and already the only blocking consumer — so reusing it yields one representation instead of a
 * third rival. That distinction is recorded because the earlier draft of this SD justified bytes by
 * comparing an ~8% spread against ~25%, which compared bytes-on-RAW against cl100k-on-FRAMED — two
 * different bases, the very defect class this SD closes.
 */

/** Bytes per harness token for prose-and-table protocol documents. See the domain warning above. */
const HARNESS_BYTES_PER_TOKEN = 2.4177;

/** The Read tool's hard per-call token cap. Not a budget, not a target — the wall. */
const SINGLE_READ_TOKEN_CAP = 25000;

/**
 * Predicted harness token cost of `bytes` of prose-and-table content.
 * Returns null for anything that is not a usable positive size, because a coverage verdict built on
 * a coerced zero is worse than one that says it cannot tell.
 */
function harnessTokensFromBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / HARNESS_BYTES_PER_TOKEN);
}

/**
 * A STRICTLY SOUND LOWER BOUND on harness tokens, with NO calibration constant.
 *
 * Every byte-paired receipt puts harness/cl100k_raw between 1.642 and 1.715, i.e. the harness always
 * charges MORE than cl100k does on raw content. So cl100k_raw exceeding the cap proves the file
 * exceeds the cap, whatever its content density. That makes this a one-sided VETO: it can only ever
 * turn a fits into a does-not-fit, never the reverse, so a wrong ratio cannot make it unsound.
 *
 * It is the density guard the bytes model cannot be: a base64 blob tokenizes densely in cl100k too,
 * so this fires on precisely the content that defeats a bytes calibration.
 *
 * Returns null when the tokenizer is unavailable — an absent veto must read as "no opinion", never
 * as "cleared".
 */
function cl100kRawLowerBound(text) {
  try {
    // eslint-disable-next-line global-require
    const enc = require('tiktoken').get_encoding('cl100k_base');
    try {
      // encode_ordinary, never encode: cl100k's `encode` THROWS on special-token literals such as
      // <|endoftext|>, and a contract that merely DOCUMENTS one would take the throw path and lose
      // its veto — silently, and on exactly the kind of file most worth checking.
      return enc.encode_ordinary(String(text)).length;
    } finally {
      if (typeof enc.free === 'function') enc.free();
    }
  } catch {
    return null;
  }
}

module.exports = {
  HARNESS_BYTES_PER_TOKEN,
  SINGLE_READ_TOKEN_CAP,
  harnessTokensFromBytes,
  cl100kRawLowerBound,
};
