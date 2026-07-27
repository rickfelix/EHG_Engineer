/**
 * Drain inventory — pure core (SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001)
 *
 * A detector whose output accumulates unread is indistinguishable, at every downstream surface,
 * from a detector that never fired. This module answers, per detector: WHO drains it, does a
 * closing path EXIST, and how old is the OLDEST UNDRAINED row — staleness measured on the DRAIN,
 * never on whether the detector fired.
 *
 * PURE BY DESIGN. All IO lives in the caller (scripts/drain-inventory.mjs), mirroring the
 * computeBreaches(rows, nowMs) / planSlaBreaches(supabase) split already used in
 * lib/coordinator/feedback-sla-gauge.cjs. This is not stylistic: the `db` vitest project currently
 * resolves to ZERO files (tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS is intentionally
 * empty), so a DB-tier test would never execute and its green would be indistinguishable from
 * having no coverage. Keeping the logic pure keeps it testable in the `unit` tier.
 *
 * VERDICTS ARE SEPARATED BY PROVENANCE, NOT BY OUTCOME:
 *   STRUCTURAL (zero IO, computed from the descriptor alone) — UNDECLARED, NO_CONSUMER,
 *     NO_CLOSING_PATH, MEASURED_ELSEWHERE. These are identical whether or not the DB is reachable.
 *   OBSERVED (requires a read) — PASS, CLOSING_PATH_UNEXERCISED, UNAVAILABLE.
 * Without that split, a missing .claude/worktree-reaper-state.json reads as UNAVAILABLE (a failed
 * read) when it is really NO_CLOSING_PATH (a structural fact) — and the two differ in exit code.
 */

export const VERDICT = Object.freeze({
  PASS: 'PASS',
  NO_CONSUMER: 'NO_CONSUMER',
  NO_CLOSING_PATH: 'NO_CLOSING_PATH',
  CLOSING_PATH_UNEXERCISED: 'CLOSING_PATH_UNEXERCISED',
  MEASURED_ELSEWHERE: 'MEASURED_ELSEWHERE',
  UNDECLARED: 'UNDECLARED',
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * Verdicts that FAIL the inventory (HARDENING 1: a detector with no consumer or no expressible
 * terminal state must FAIL, not render a blank cell — a blank reads as "not yet filled in",
 * a failure reads as a finding).
 *
 * UNAVAILABLE is deliberately NOT a failure: it means we could not measure, which must never be
 * rendered as either health or a finding. It is reported separately so an unchecked error cannot
 * manufacture a clean bill of health.
 */
export const FAILING_VERDICTS = Object.freeze([
  VERDICT.NO_CONSUMER,
  VERDICT.NO_CLOSING_PATH,
  VERDICT.UNDECLARED,
]);

export const isFailing = (verdict) => FAILING_VERDICTS.includes(verdict);

/**
 * Oldest UNDRAINED row age, order-independent.
 *
 * Scans for the minimum timestamp rather than trusting rows[0] — a rows[0] implementation passes a
 * single-ordering test by accident and then under-reports whenever the caller's page arrives in a
 * different order. Under-reporting fails in the ALARM-SUPPRESSING direction, which is the exact
 * failure mode this inventory exists to detect.
 *
 * @param {Array<{created_at: string|number|Date}>} rows undrained rows only (caller applies the predicate)
 * @param {number} nowMs
 * @returns {{count:number, oldestAgeMs:number|null, oldestAt:string|null, unparsable:number}}
 */
export function computeOldestUndrainedAge(rows, nowMs) {
  const list = Array.isArray(rows) ? rows : [];
  let oldestMs = null;
  let unparsable = 0;

  for (const row of list) {
    const raw = row?.created_at;
    const ms = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
    // A row whose timestamp will not parse is COUNTED but cannot contribute an age. Silently
    // dropping it would shrink the population and read as a healthier drain than reality.
    if (!Number.isFinite(ms)) { unparsable += 1; continue; }
    if (oldestMs === null || ms < oldestMs) oldestMs = ms;
  }

  return {
    count: list.length,
    oldestAgeMs: oldestMs === null ? null : Math.max(0, nowMs - oldestMs),
    oldestAt: oldestMs === null ? null : new Date(oldestMs).toISOString(),
    unparsable,
  };
}

/**
 * STRUCTURAL verdict — computed from the descriptor alone, with ZERO IO.
 * Returns null when the descriptor is well-formed enough to require a read.
 */
export function classifyStructural(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return VERDICT.UNDECLARED;

  // Work whose value leaves no artifact is measured by a DIFFERENT instrument. Checked FIRST:
  // such an entry legitimately has no queue to drain, and must never be counted as neglect.
  // The SD forbids the cheap remedy of manufacturing artifacts so a counter can see the work.
  if (descriptor.measuredBy) return VERDICT.MEASURED_ELSEWHERE;

  if (!descriptor.consumer) return VERDICT.NO_CONSUMER;
  if (!descriptor.closingPath) return VERDICT.NO_CLOSING_PATH;
  return null;
}

/**
 * OBSERVED verdict — folds a live reading into a structurally-sound descriptor.
 * `reading` follows the {noData, reason} convention of lib/coordinator/drain-gauge.cjs.
 */
export function classifyObserved(descriptor, reading) {
  const structural = classifyStructural(descriptor);
  if (structural !== null) return structural; // structural findings are not overridden by a read

  if (!reading || reading.noData) return VERDICT.UNAVAILABLE;

  // A closing path that EXISTS but has NEVER been exercised is neither healthy nor missing.
  // Live case: gauge_finding_dispositions is a real table with zero rows ever written, against
  // 4,235 outstanding invariant_gauge_finding rows.
  if (reading.closingPathUses === 0 && (reading.count || 0) > 0) {
    return VERDICT.CLOSING_PATH_UNEXERCISED;
  }
  return VERDICT.PASS;
}

/**
 * Evidence-floor guard, adopted from assertThresholdsBelowEvidenceFloor() in
 * lib/adam/inbound-backlog-watchdog.js. If a staleness threshold exceeds the retention window,
 * rows age out before they can breach and the alarm clears by RETENTION instead of by DRAINAGE.
 * That is itself an instance of this SD's finding, so the inventory refuses to run.
 */
export function assertThresholdBelowRetention(thresholdMs, retentionMs) {
  if (!Number.isFinite(thresholdMs) || !Number.isFinite(retentionMs)) return null;
  if (thresholdMs >= retentionMs) {
    return `threshold ${thresholdMs}ms >= retention ${retentionMs}ms — the alarm could clear by retention instead of by drainage`;
  }
  return null;
}

export const PAGE_SIZE = 1000;

/**
 * Exhaustive pagination over an ORDERED page fetcher.
 *
 * Extracted from the CLI so it is testable: this is where an alarm-suppressing under-read would
 * originate. PostgREST caps a response at PAGE_SIZE, and the largest population inventoried here
 * is >4,000 rows — a wrong loop bound, a `<=` where `<` belongs, or a dropped ORDER BY silently
 * truncates and reports a YOUNGER oldest-age than reality. Reading young is the dangerous
 * direction: it suppresses the alarm rather than raising a false one.
 *
 * @param {(from:number, to:number) => Promise<{rows?:Array, error?:string}>} fetchPage
 * @returns {Promise<{rows:Array}|{noData:true, reason:string}>}
 */
export async function paginateAll(fetchPage, { pageSize = PAGE_SIZE, maxPages = 1000 } = {}) {
  const all = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const res = await fetchPage(from, from + pageSize - 1);
    if (!res || res.error) return { noData: true, reason: res?.error || 'page fetch returned nothing' };
    const rows = res.rows || [];
    all.push(...rows);
    // STRICTLY less-than: a full page means there may be more. Using <= here would stop one page
    // early on an exact multiple of pageSize and silently drop the tail.
    if (rows.length < pageSize) return { rows: all };
  }
  // Never silently truncate. Exhausting maxPages is reported, not rendered as a complete read.
  return { noData: true, reason: `pagination exceeded ${maxPages} pages — refusing to report a truncated population as complete` };
}

/** Exit code for a completed inventory: non-zero if ANY entry FAILS. */
export function exitCodeFor(verdicts) {
  return (Array.isArray(verdicts) ? verdicts : []).some(isFailing) ? 1 : 0;
}

/** Build one inventory row. Kept pure so the whole report is testable without a database. */
export function buildInventoryRow(id, descriptor, reading) {
  const verdict = reading === undefined
    ? (classifyStructural(descriptor) ?? VERDICT.UNAVAILABLE)
    : classifyObserved(descriptor, reading);

  return {
    id,
    verdict,
    failing: isFailing(verdict),
    consumer: descriptor?.consumer ?? null,
    closingPath: descriptor?.closingPath ?? null,
    predicate: descriptor?.predicate ?? null,
    shapeContract: descriptor?.shapeContract ?? null,
    accumulationSignal: descriptor?.accumulationSignal ?? null,
    fieldQuestion: descriptor?.fieldQuestion ?? null,
    measuredBy: descriptor?.measuredBy ?? null,
    // Declared naive-timestamp skew. quick_fixes / strategic_directives_v2 / sd_phase_handoffs /
    // product_requirements_v2 store naive timestamps, so a JS age reads ~4h YOUNGER — in the
    // alarm-suppressing direction (SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001). An undeclared skew on
    // such a table is itself reported, so an under-read is never mistaken for a healthy drain.
    timestampSkew: descriptor?.timestampSkew ?? null,
    count: reading?.count ?? null,
    oldestAgeMs: reading?.oldestAgeMs ?? null,
    reason: reading?.reason ?? null,
  };
}
