/**
 * Fail-closed LOW/MEDIUM/HIGH consequence classifier for chairman decisions.
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-3.
 *
 * This is NET-NEW — no prior consequence-taxonomy implementation exists anywhere in
 * this repo (verified by repo-wide grep before writing this file). It is a DIFFERENT,
 * unrelated axis from SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001's venture-lifecycle-stage
 * concept (that SD is unbuilt and classifies stages, not individual decisions).
 *
 * CRITICAL INVARIANT: default is HIGH. A phrase must be POSITIVELY recognized as
 * low-risk or bounded-risk to escape HIGH — unmatched/unrecognized input never
 * downgrades. This is what makes the SMS channel safe to expose unauthenticated:
 * classifyConsequence() gates lib/chairman/sms-bridge.js's send path (FR-4), and a
 * HIGH verdict there means "authenticated console only," never SMS.
 */

const HIGH_PATTERNS = [
  /\bkill\b[\s\S]{0,40}\bventure\b/i,
  /\bventure\b[\s\S]{0,40}\bkill\b/i,
  // "shut ... down" tolerates 0-3 intervening words ("shut it down", "shut this
  // venture down", "shut down") — bidirectional against 'venture', same as the
  // kill<->venture pair. Adversarial review finding (deep-tier PR #6093): the
  // original single-direction, no-intervening-word pattern let "Venture Zeta
  // pivot: shut it down?" escape to MEDIUM via the 'pivot' keyword.
  /\bshut\b(?:\s+\w+){0,3}\s+down\b[\s\S]{0,40}\bventure\b/i,
  /\bventure\b[\s\S]{0,40}\bshut\b(?:\s+\w+){0,3}\s+down\b/i,
  /\bgovernance\b/i,
  /\bsecrets?\b/i,
  /\bcredentials?\b/i,
  /\bapi[\s-]?key\b/i,
  /\bpassword\b/i,
  /\bcontracts?\b/i,
  /\birreversible\b/i,
  /\bprod(uction)?\b[\s\S]{0,40}\b(deploy|delete|drop|migrat\w*)\b/i,
  /\b(delete|drop)\b[\s\S]{0,20}\bprod(uction)?\b/i,
];

const LOW_PATTERNS = [
  /\bwhich (time|day|slot)\b/i,
  /\bschedul\w*\b/i,
  /\bpreference\b/i,
  /\bfyi\b/i,
  /\breminder\b/i,
  /\bconfirm\w* receipt\b/i,
  /\bwhat time\b/i,
];

// $5,000+ (any formatting: "$5000", "$5,000", "$10k", "5000 dollars", "5000 USD",
// "a $6,000 spend", "spend of 6000") is HIGH per FR-3; a smaller, real dollar amount is
// a bounded MEDIUM ask, not LOW and not HIGH.
//
// Adversarial review finding (deep-tier PR #6093): the original regex only matched a
// literal '$' prefix or a 'dollars' suffix, so "Approve 5000 USD" / "a 5,000 payment" /
// "proceed with a 6000 spend" fell through to MEDIUM_PATTERNS on 'approve'/'proceed'
// instead of being caught by the spend threshold. Broadened to also match a number
// adjacent to a financial-context word (usd, spend, budget, payment, invoice, cost,
// fee, expense) in EITHER order, not just $-prefixed/dollars-suffixed forms.
const FINANCIAL_WORD = 'usd|spend|budget|payment|invoice|cost|fee|expense';
const DOLLAR_AMOUNT_PATTERNS = [
  /\$\s?([\d,]+(?:\.\d+)?)\s?(k)?\b/i,
  new RegExp(`\\b([\\d,]+(?:\\.\\d+)?)\\s?(k)?\\s?(?:dollars|${FINANCIAL_WORD})\\b`, 'i'),
  new RegExp(`\\b(?:${FINANCIAL_WORD})s?\\s+(?:of\\s+)?\\$?([\\d,]+(?:\\.\\d+)?)\\s?(k)?\\b`, 'i'),
];
const HIGH_SPEND_THRESHOLD = 5000;

function extractDollarAmount(text) {
  for (const re of DOLLAR_AMOUNT_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const raw = (m[1] || '').replace(/,/g, '');
    const value = parseFloat(raw);
    if (Number.isNaN(value)) continue;
    return m[2] ? value * 1000 : value;
  }
  return null;
}

const MEDIUM_PATTERNS = [
  /\bapprove\b/i,
  /\bproceed\b/i,
  /\bpause\b/i,
  /\bdefer\b/i,
  /\bpivot\b/i,
];

/**
 * @param {{decisionType?: string, title?: string, context?: string|Object}} input
 * @returns {'low'|'medium'|'high'}
 */
export function classifyConsequence({ decisionType = '', title = '', context = '' } = {}) {
  const contextText = typeof context === 'string' ? context : JSON.stringify(context || '');
  const text = [decisionType, title, contextText].filter(Boolean).join(' ');

  if (HIGH_PATTERNS.some((re) => re.test(text))) return 'high';

  const amount = extractDollarAmount(text);
  if (amount !== null) {
    return amount >= HIGH_SPEND_THRESHOLD ? 'high' : 'medium';
  }

  if (LOW_PATTERNS.some((re) => re.test(text))) return 'low';

  if (MEDIUM_PATTERNS.some((re) => re.test(text))) return 'medium';

  // Fail-closed: unrecognized/unmatched input is never assumed safe.
  return 'high';
}

export { HIGH_SPEND_THRESHOLD };
