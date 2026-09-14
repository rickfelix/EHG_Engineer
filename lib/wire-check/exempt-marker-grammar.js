/**
 * Shared @wire-check-exempt marker grammar.
 *
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-C (P2.3). Consumed by BOTH readers of the
 * marker so they agree: scripts/modules/handoff/executors/lead-final-approval/
 * gates/wire-check-gate.js (LEAD-FINAL, blocking) and scripts/modules/handoff/
 * executors/exec-to-plan/gates/wire-check-advisory.js (EXEC-TO-PLAN, advisory) --
 * the latter did not check the marker at all before this change, a real parity
 * gap (a file exempted at LEAD-FINAL was still falsely flagged at EXEC-TO-PLAN).
 *
 * Two accepted marker formats, ADDITIVE -- the real corpus is 124 occurrences
 * across 91 files with non-uniform comment styles; this SD does not mass-rewrite
 * any of them:
 *
 *   DEPRECATED (bare):  // @wire-check-exempt: <reason>
 *   CURRENT (dated):    // @wire-check-exempt SD-KEY-001 expires:2026-12-01
 *
 * The bare format is accepted until BARE_MARKER_SUNSET below; after that date a
 * bare marker is no longer exempt at all -- no silent fail-open extension.
 *
 * TWO DELIBERATELY DIFFERENT FUNCTIONS, never one shared boolean (RISK sub-agent
 * finding, evidence c185874e-f8ed-4afc-9ae2-5480f032bb4d): flipping expiry
 * enforcement to fail-closed on a REQUIRED gate in one commit would un-exempt
 * every expired file at once and redden CI fleet-wide.
 *
 *   isExemptionActive  (gate-side, GRACE-WINDOWED)  -- suppresses the
 *     reachability check. Honors a grace period past an expired dated marker so
 *     the flip to fail-closed enforcement does not happen in a single commit.
 *   isExemptionCompliant (retire-check-side, STRICT FAIL-CLOSED, no grace) --
 *     decides whether a retire-check reports the marker overdue.
 */

/**
 * Comment-leading anchor (RISK sub-agent mitigation, evidence c185874e-f8ed-4afc-
 * 9ae2-5480f032bb4d: "anchored to comment-leading position, not allowlisting
 * exceptions"). Both marker regexes require the marker to sit immediately after
 * a `//`, `/*`, or JSDoc-continuation `*` at the START of its line (only
 * whitespace in between) -- never bare prose anywhere in the file. Without this,
 * a docblock merely ILLUSTRATING the marker syntax (as this file's own header
 * comment above does) would itself parse as a live exemption directive.
 */
const COMMENT_LEAD = '^[ \\t]*(?:\\/\\/|\\/\\*+|\\*)[ \\t]*';

export const DATED_MARKER = new RegExp(`${COMMENT_LEAD}@wire-check-exempt\\s+([\\w.-]+)\\s+expires:(\\d{4}-\\d{2}-\\d{2})`, 'm');
export const BARE_MARKER = new RegExp(`${COMMENT_LEAD}@wire-check-exempt\\b(?!\\s+[\\w.-]+\\s+expires:)`, 'm');

/** Bare (undated) marker acceptance sunsets on this date -- a fixed literal, not a flag. */
export const BARE_MARKER_SUNSET = '2027-03-13';

/** Grace period honored by isExemptionActive past an expired dated marker. */
export const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Parse a marker out of source text (typically the first 2KB of a file).
 * @returns {null | {kind:'bare'} | {kind:'dated', sdKey:string, expiresAt:string}}
 */
export function parseExemptMarker(sourceText) {
  const text = String(sourceText || '');
  const dated = DATED_MARKER.exec(text);
  if (dated) return { kind: 'dated', sdKey: dated[1], expiresAt: dated[2] };
  if (BARE_MARKER.test(text)) return { kind: 'bare' };
  return null;
}

function toMs(now) {
  return now instanceof Date ? now.getTime() : Date.parse(now);
}

/**
 * Strict YYYY-MM-DD parse -- rejects calendar-invalid dates that `Date.parse`
 * silently rolls over (e.g. '2026-04-31' would otherwise normalize to
 * 2026-05-01 instead of failing closed). Returns NaN for anything malformed,
 * out-of-range, or calendar-invalid.
 */
function parseStrictDateMs(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return NaN;
  const [, yStr, moStr, dStr] = m;
  const y = Number(yStr), mo = Number(moStr), d = Number(dStr);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
  return dt.getTime();
}

/** Gate-side: does this marker currently suppress the reachability check? Grace-windowed. */
export function isExemptionActive(marker, now = new Date()) {
  if (!marker) return false;
  const nowMs = toMs(now);
  if (marker.kind === 'bare') return nowMs < Date.parse(BARE_MARKER_SUNSET);
  if (marker.kind === 'dated') {
    const expiresMs = parseStrictDateMs(marker.expiresAt);
    if (!Number.isFinite(expiresMs)) return false; // malformed/calendar-invalid expiry -- fail closed, no grace
    return nowMs <= expiresMs + GRACE_PERIOD_MS;
  }
  return false;
}

/** Retire-check-side: is this marker in good standing? Strict fail-closed, no grace window. */
export function isExemptionCompliant(marker, now = new Date()) {
  if (!marker) return false;
  const nowMs = toMs(now);
  if (marker.kind === 'bare') return nowMs < Date.parse(BARE_MARKER_SUNSET);
  if (marker.kind === 'dated') {
    const expiresMs = parseStrictDateMs(marker.expiresAt);
    if (!Number.isFinite(expiresMs)) return false; // malformed/calendar-invalid expiry -- fail closed
    return nowMs <= expiresMs;
  }
  return false;
}
