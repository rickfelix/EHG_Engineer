/**
 * Faucet-side gate for UAT filings. QF-20260807-594.
 *
 * MEASURED, twice and independently: every quick-fix arriving in the last 7 days was filed by
 * UAT_AGENT (96/96), and 58 of them (60%) came in at high or critical. The coordinator's own
 * count a few hours earlier was 85/85 at the same 60%. So this is not a spike — it is the
 * steady-state arrival shape, and the drain cannot outrun it.
 *
 * TWO RULES, BOTH AT THE FILING SITE. The drain side is deliberately untouched: re-grading the
 * existing backlog would rewrite history that people have already triaged against, and the
 * ratified ruling is explicit that the standing HIGH backlog stays as-is.
 *
 * RULE 1 — SEVERITY (ratified 2026-08-03). HIGH is for MEASURED harm to work or safety.
 * Everything else files medium and is still routed; nothing is dropped, nothing is silenced.
 *
 * RULE 2 — DEDUP KEYED ON FINDING IDENTITY, NEVER ON SURFACE ALONE. This is the whole design
 * risk and it is worth being explicit about. A fold keyed on "which file/page was this about"
 * silences every later finding on that surface forever — the first report about a page makes
 * the page permanently un-reportable. Ask what state would silence the alarm: with a
 * surface-key, the answer is "one filing, ever". So identity here is derived from WHAT THE
 * FINDING SAYS (title + expected + actual), not from where it was found, and a genuinely new
 * finding on an already-filed surface has a different identity and still arrives.
 *
 * ON THE HONESTY OF RULE 1. The severity test below is a HEURISTIC over free text, not a proof.
 * It cannot know whether harm was truly measured; it can only see whether the filing SHOWS a
 * measurement. It is built to fail toward `medium` — the recoverable direction, since a
 * medium that should have been high still arrives and is still routed, whereas a high that
 * should have been medium consumes the scarce attention this whole QF exists to protect.
 * The audited override exists precisely because the heuristic will be wrong sometimes.
 */

/** Severities this gate may downgrade. */
export const ELEVATED = Object.freeze(['high', 'critical']);

/** The severity everything else files at. Still routed — this is a downgrade, not a drop. */
export const DEFAULT_SEVERITY = 'medium';

/**
 * Harm that is harm BY CLASS. Data loss and security do not need a stopwatch to be serious, and
 * a gate that demanded one would push exactly the wrong findings down. Failing toward HIGH here
 * is the safe direction.
 */
const INTRINSIC_HARM = /\b(data[ -]?loss|corrupt(?:s|ed|ion)?|credential|secret|security|\brls\b|auth[a-z]*|privilege|leak(?:s|ed|ing)?|breach|unrecoverable|irreversible|destroy(?:s|ed)?|silently (?:wrong|drops?|discards?)|incorrect result)\b/i;

/**
 * Harm to WORK — real, but only countable harm distinguishes "this blocked a seat for an hour"
 * from "this is untidy". These require a quantity to hold HIGH.
 */
const WORK_HARM = /\b(block(?:s|ed|ing)?|stall(?:s|ed|ing)?|strand(?:s|ed|ing)?|wedge[ds]?|hang(?:s|ing)?|crash(?:es|ed|ing)?|stuck|outage|deadlock|cannot|unable|prevent(?:s|ed)?|breaks?|broken)\b/i;

/**
 * Evidence that something was actually COUNTED. This is what separates a measurement from an
 * adjective — "slow" is a feeling, "adds 40 min per handoff" is a measurement.
 */
const QUANTITY = /\b\d+(?:\.\d+)?\s*(?:%|percent|x\b|times|min(?:ute)?s?|hours?|hrs?|secs?|seconds?|days?|weeks?|rows?|files?|seats?|workers?|sessions?|runs?|prs?|sds?|qfs?|tests?|commits?|occurrences?|instances?|calls?|times per)\b/i;

/**
 * Does this filing SHOW measured harm to work or safety?
 * @param {string} text
 * @returns {{measured:boolean, basis:string}}
 */
export function hasMeasuredHarm(text) {
  const t = String(text || '');
  if (INTRINSIC_HARM.test(t)) return { measured: true, basis: 'intrinsic-harm-class (safety/data)' };
  const harm = WORK_HARM.test(t);
  const qty = QUANTITY.test(t);
  if (harm && qty) return { measured: true, basis: 'work-harm with a quantity' };
  if (harm) return { measured: false, basis: 'harm asserted but never quantified' };
  return { measured: false, basis: 'no harm to work or safety described' };
}

/**
 * Apply the ratified severity rule.
 *
 * Returns the severity to file at plus a REASON — the downgrade must be visible at the filing
 * site and recorded on the row. A gate that silently rewrites a field teaches nobody anything
 * and is indistinguishable, to the filer, from having been ignored.
 *
 * @param {{severity:string,title?:string,description?:string,expected?:string,actual?:string,steps?:string}} f
 * @param {{override?:string}} [opts] override = audited justification that keeps the elevated severity
 * @returns {{severity:string, downgraded:boolean, from:string, reason:string, basis:string}}
 */
export function applySeverityRule(f = {}, opts = {}) {
  const from = String(f.severity || '').toLowerCase();
  if (!ELEVATED.includes(from)) {
    return { severity: from, downgraded: false, from, reason: 'not an elevated severity', basis: 'n/a' };
  }
  const text = [f.title, f.description, f.expected, f.actual, f.steps].filter(Boolean).join('\n');
  const { measured, basis } = hasMeasuredHarm(text);
  if (measured) {
    return { severity: from, downgraded: false, from, reason: `measured harm shown: ${basis}`, basis };
  }
  if (opts.override) {
    return { severity: from, downgraded: false, from, reason: `audited override: ${opts.override}`, basis };
  }
  return {
    severity: DEFAULT_SEVERITY,
    downgraded: true,
    from,
    basis,
    reason: `filed ${DEFAULT_SEVERITY}, not ${from}: ${basis}. HIGH is reserved for MEASURED harm to work or safety (ratified 2026-08-03). Still routed — nothing is dropped. If harm WAS measured, say so with a number and re-file, or pass an audited justification.`
  };
}

/** Words too common to carry finding identity. Kept small on purpose — an aggressive stoplist
 *  erases the very nouns that distinguish two findings on one surface. */
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'when', 'then', 'than',
  'has', 'have', 'was', 'were', 'are', 'but', 'not', 'its', 'it', 'a', 'an', 'is', 'of', 'to',
  'in', 'on', 'at', 'by', 'be', 'as', 'or', 'if', 'so', 'we', 'you', 'should', 'would', 'could',
  'will', 'does', 'did', 'can', 'into', 'over', 'after', 'before', 'because']);

/**
 * Significant tokens of a text — lowercased, punctuation-stripped, stopworded, length>=3.
 *
 * NUMBERS ARE KEPT AT ANY LENGTH, and that exception is load-bearing rather than tidy-up. The
 * plain length>=3 filter silently ate "3" and "30", which made "gate allows 3 retries" and
 * "gate allows 30 retries" identical to this function — two different findings collapsing into
 * one, in the very code whose job is to tell findings apart. The control test caught it; the
 * docstring had already claimed digits were preserved while the filter was quietly dropping
 * them, which is the more useful half of the lesson.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function findingTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => (/^\d+$/.test(w) || w.length >= 3) && !STOP.has(w))
  );
}

/**
 * The identity of a finding: what it CLAIMS, not where it was found.
 * @param {{title?:string,expected?:string,actual?:string}} f
 * @returns {Set<string>}
 */
export function findingIdentity(f = {}) {
  return findingTokens([f.title, f.expected, f.actual].filter(Boolean).join(' '));
}

/**
 * Jaccard overlap of two token sets. 1 = identical vocabulary, 0 = disjoint.
 * @returns {number}
 */
export function similarity(a, b) {
  if (!a?.size || !b?.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Default fold threshold. Deliberately HIGH: the cost of folding a real new finding (it never
 * arrives, and nobody knows) is far worse than the cost of one near-duplicate getting through
 * (a human sees two similar rows and closes one).
 */
export const DUPLICATE_THRESHOLD = 0.82;

/**
 * Find an already-filed QF that is the SAME FINDING as this one.
 *
 * @param {{title?:string,expected?:string,actual?:string}} candidate
 * @param {Array<{id:string,title?:string,expected_behavior?:string,actual_behavior?:string,status?:string}>} rows
 * @param {{threshold?:number}} [opts]
 * @returns {{row:object, score:number}|null}
 */
export function findDuplicateFinding(candidate, rows, opts = {}) {
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DUPLICATE_THRESHOLD;
  const mine = findingIdentity(candidate);
  if (!mine.size) return null; // nothing to compare — never fold on an empty identity
  let best = null;
  for (const r of rows || []) {
    const theirs = findingIdentity({ title: r.title, expected: r.expected_behavior, actual: r.actual_behavior });
    const score = similarity(mine, theirs);
    if (score >= threshold && (!best || score > best.score)) best = { row: r, score };
  }
  return best;
}
