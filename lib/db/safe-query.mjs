/**
 * safe-query.mjs — query-error discipline primitives
 * (SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-1/FR-2).
 *
 * THE DEFECT: a destructure that binds only `data` and discards `error` turns a bad column name
 * into a PERMANENT SILENT NO-OP. PostgREST rejects the WHOLE query on an unknown column, so `data`
 * is null forever, and code that never inspects `error` reports a plausible benign reason for
 * having done nothing. Live instance: a gate whose PRD lookup failed reached its
 * "No command configured — advisory pass" branch, so a broken query MADE THE GATE PASS.
 *
 * WHY A NULL RESULT IS UNDETECTABLE LOCALLY: zero rows is a legal answer. The failure is
 * indistinguishable from a legitimate empty result, which is why a convention ("always check the
 * error") decays and an enforcement point does not.
 *
 * *** THE SECOND SUB-SHAPE, WHICH A THROW-ON-ERROR WRAPPER ALONE WOULD MISS: ***
 * a head+count probe against a table that DOES NOT EXIST returns SUCCESS —
 *     .from('<missing>').select('*', { count: 'exact', head: true })  ->  error null, count null, 204
 *     same shape on a REAL table                                      ->  error null, count 1155, 206
 * There is no error to throw on. The ONLY discriminant is count===null (missing) vs count===0
 * (genuinely empty). safeCount() below encodes exactly that, so this class cannot survive inside
 * the fix meant to remove it.
 *
 * RELATIONSHIP TO ./fetch-all-paginated.mjs — deliberately complementary, NOT a competing
 * convention. That module owns COUNT/TRUNCATION discipline (bulk pagination, cap-truncation
 * tripwires, and renderCount for gauges); this module owns QUERY-ERROR discipline for SINGLE-SHOT
 * reads. The shared rule — a null count on an explicit count request means the MEASUREMENT
 * FAILED and must never be coerced to a healthy-looking 0 — is defined once, by renderCount(),
 * and consumed here rather than re-implemented. tools/gates/lib/db.ts::query() is the TypeScript
 * variant of this same seam; it runs under a different runtime (npx tsx via leo-gates.yml) and so
 * cannot import this file, but it must not diverge in behaviour.
 */
import { renderCount } from './fetch-all-paginated.mjs';

/**
 * PostgREST codes that mean a GENUINE ABSENCE rather than a fault.
 *
 * PGRST116 is what `.single()` returns when the query matched zero rows. That is a real answer
 * to a well-formed question, not a broken probe — and the whole point of this module is to
 * distinguish the two. Treating it as a fault would make the wrapper unusable at every
 * `.single()` call site and would train people to blanket-tolerate, which is the decay this
 * module exists to prevent.
 *
 * *** CALLER OBLIGATION, verified against the installed postgrest-js source (SECURITY 66c3911c):
 * PGRST116 means "0 OR MORE THAN 1 rows", not "0 rows". *** So on an UNBOUNDED `.single()` /
 * `.maybeSingle()`, a duplicate-row DATA-INTEGRITY fault would arrive here wearing the same code
 * as a genuine absence and be returned as null — this SD's own defect class, reached by a
 * different road.
 *
 * Pair every `.single()` with something that structurally bounds it to at most one row: a
 * `.limit(1)`, or a filter on a unique/primary key. The three call sites converted by this SD all
 * do (smoke-test-gate pairs `.single()` with `.limit(1)`; wiring-validation's `.maybeSingle()`
 * filters on the primary key). A future caller that does neither should NOT rely on this default.
 */
export const EXPECTED_ABSENCE_CODES = Object.freeze(['PGRST116']);

/**
 * Await a PostgREST query and THROW on error instead of yielding a null that reads as absence.
 *
 * @param {Promise<{data: any, error: any}>} queryPromise a supabase query (already built)
 * @param {{site?: string, tolerate?: string, expectedAbsenceCodes?: string[]}} [opts]
 *   site     - call-site label, so a thrown fault is diagnosable from the record
 *   tolerate - REASON STRING opting this call site out of throwing (FR-2). A boolean is REFUSED:
 *              a boolean opt-out is a convention with extra steps — it becomes the thing you add
 *              to make the checker stop complaining, and nobody can later tell a considered
 *              tolerance from a reflexive silencing. A required reason makes every silence
 *              auditable and makes the COUNT of silences a gauge in its own right.
 *   expectedAbsenceCodes - codes meaning "no rows", returned as null rather than thrown.
 *              Defaults to EXPECTED_ABSENCE_CODES. NARROW this list, never widen it to silence
 *              a fault: a code added here is indistinguishable from a genuine empty result
 *              forever after, which is precisely the defect.
 * @returns {Promise<any>} data on success or genuine absence; on a tolerated failure, null
 */
export async function safeQuery(
  queryPromise,
  { site = 'unknown-site', tolerate, expectedAbsenceCodes = EXPECTED_ABSENCE_CODES } = {}
) {
  const reason = assertToleranceReason(tolerate, site);
  const { data, error } = await queryPromise;
  // A genuine "no rows" is an ANSWER. Return it as such, before any fault handling.
  if (error && expectedAbsenceCodes.includes(error.code)) return null;
  if (error) {
    if (reason) {
      process.stderr.write(`[query-discipline] TOLERATED at ${site}: ${error.message} — reason: ${reason}\n`);
      return null;
    }
    const e = new Error(`QUERY_FAILED at ${site}: ${error.message}`);
    e.code = 'QUERY_FAILED';
    e.cause = error;
    throw e;
  }
  return data;
}

/**
 * Await an EXPLICIT count request and throw when the count could not be measured.
 *
 * A missing relation returns error=null with count=null, so `error` is not the discriminant —
 * this is the sub-shape safeQuery alone cannot catch. Reuses renderCount()'s definition of an
 * unmeasurable count rather than restating it, so the two modules cannot drift apart.
 *
 * @param {Promise<{count: number|null, error: any}>} queryPromise a query built with { count: 'exact' }
 * @param {{site?: string, tolerate?: string}} [opts]
 * @returns {Promise<number|null>} the count on success; on a tolerated failure, null
 */
export async function safeCount(queryPromise, { site = 'unknown-site', tolerate } = {}) {
  const reason = assertToleranceReason(tolerate, site);
  const { count, error } = await queryPromise;
  const rendered = renderCount(count);
  const failed = Boolean(error) || rendered === 'unavailable';
  if (failed) {
    // Name WHICH half failed: an errored count and an unmeasurable-but-errorless count are
    // different diagnoses, and collapsing them re-creates the ambiguity this module removes.
    const why = error ? error.message : 'count is null with no error — relation likely does not exist';
    if (reason) {
      process.stderr.write(`[query-discipline] TOLERATED at ${site}: ${why} — reason: ${reason}\n`);
      return null;
    }
    const e = new Error(`COUNT_UNMEASURABLE at ${site}: ${why}`);
    e.code = 'COUNT_UNMEASURABLE';
    if (error) e.cause = error;
    throw e;
  }
  return count;
}

/**
 * Enforce that an opt-out carries a REASON STRING (FR-2).
 * A boolean — the reflexive silencing shape — is refused loudly rather than ignored.
 * Exported so the refusal itself is directly testable.
 * @param {unknown} tolerate
 * @param {string} site
 * @returns {string|null} the trimmed reason, or null when no opt-out was requested
 */
export function assertToleranceReason(tolerate, site = 'unknown-site') {
  if (tolerate === undefined || tolerate === null) return null;
  if (typeof tolerate !== 'string' || tolerate.trim().length === 0) {
    const e = new Error(
      `TOLERATE_REASON_REQUIRED at ${site}: opting out of query-error discipline requires a REASON STRING, `
      + `got ${typeof tolerate}. A boolean opt-out cannot be audited and cannot be counted.`
    );
    e.code = 'TOLERATE_REASON_REQUIRED';
    throw e;
  }
  return tolerate.trim();
}

export default { safeQuery, safeCount, assertToleranceReason, EXPECTED_ABSENCE_CODES };
