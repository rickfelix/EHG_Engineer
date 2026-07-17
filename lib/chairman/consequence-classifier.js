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

  // SD-LEO-INFRA-ADAM-PRE-SEND-001 (FR-2): Adam's pre-send consult rubric is the
  // 2nd consumer of this ONE shared decision-axis taxonomy (SMS bridge is the 1st).
  // Extend HIGH with the governance classes the rubric must always escalate, none of
  // which were covered above. Additive + fail-toward-HIGH: identical safe direction as
  // the existing SMS gate (more HIGH = more "authenticated console only", never less),
  // so this cannot loosen either consumer. Origin miss that motivated the SD: a
  // security webhook-deploy call was mis-classified as routine and shipped SOLO.
  // authority / permission / privilege / role changes:
  /\bauthorit(?:y|ies)\b/i,
  /\b(?:grant|revoke|escalat\w*)\b[\s\S]{0,30}\b(?:access|admin|privileg\w*|permission|role|authorit\w*)\b/i,
  // new-mechanism / precedent-setting designs:
  /\bprecedent\b/i,
  /\bnew\b[\s\S]{0,20}\b(?:mechanism|gate|policy|protocol|governance\s+rule)\b/i,
  // chairman control-surface changes:
  /\bchairman[\s-]?(?:control|surface|dashboard|config|approval)\b/i,
  /\bcontrol[\s-]surface\b/i,
  /\bkill[\s-]?gate\b/i,
  // security-sensitive integration (webhook) deploy targets — the origin-miss class:
  /\bwebhook\b[\s\S]{0,40}\b(?:deploy|endpoint|url|secret|config|host|target)\b/i,
  /\b(?:deploy|endpoint|url|secret|config|host|target)\b[\s\S]{0,40}\bwebhook\b/i,
  // SD-1 security-review follow-up (adversarial finding #2b): the original prod->X pattern
  // (line ~34) was ONE-directional, so "the deployment to production", "config change to
  // production", "endpoint wiring on prod host" escaped the fail-closed HIGH default via a
  // MEDIUM 'approve'/'proceed' keyword. Make prod<->{deploy,config,migrate,provision,
  // rollback,endpoint,integration,host} BIDIRECTIONAL (mirrors the kill<->venture fix), plus
  // migration rollbacks. Fail-toward-HIGH; safe for both the SMS gate and Adam's consult gate.
  /\b(deploy\w*|migrat\w*|config\w*|rollback|revert|provision\w*|endpoint|integration)\b[\s\S]{0,40}\bprod(uction)?\b/i,
  /\bprod(uction)?\b[\s\S]{0,40}\b(config\w*|rollback|revert|provision\w*|host)\b/i,
  /\b(rollback|revert|re-?run|re-?appl\w*)\b[\s\S]{0,20}\bmigrat\w*/i,
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

// KNOWN TRACKED LIMITATION (follow-up verification of PR #6093's adversarial-review
// fixes): a bare number with NO financial-context word at all — e.g. "Should I proceed
// with 6000?" — is not caught by extractDollarAmount (which requires a $ or a financial
// word per FR-3) and falls through to MEDIUM via the 'proceed' keyword rather than HIGH.
// This is narrower than the original findings (those all had an explicit financial word:
// USD/payment/spend) and genuinely underdetermined in the other direction — "6000" alone
// could be a user count, a step number, or an ID, not necessarily money. Left as a documented
// residual rather than adding an unscoped bare-large-number-anywhere-in-text rule, which
// would risk false-positiving on incidental numbers in the (JSON-stringified) `context`
// field. Tighten here if a real chairman-facing miss is observed.

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
