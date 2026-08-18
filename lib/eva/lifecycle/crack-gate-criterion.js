/**
 * SD-LEO-INFRA-ARM-BINDING-EXIT-001
 *
 * Crack-gate evidence-sufficiency mechanism. ARMED-BUT-INERT, mirroring the completed
 * SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 precedent: this reports a criterion verdict, it does
 * NOT gate anything live. lib/marketing/autonomy-gate.js and
 * lib/eva/lifecycle/crack-gate-evaluator.js are untouched by this SD (FR-5) -- this module
 * exists precisely so the new mechanism has somewhere to live without editing either.
 *
 * Reuses lib/eva/lifecycle/bind-criterion-checker.js's MIN_ROWS/MIN_SPAN_HOURS (FR-3) and
 * mirrors its evaluateExitGateCriterion() single-branch precedence-chain pattern: return on
 * the first failing condition, most severe first, one string|null reason.
 */

import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';
import { MIN_ROWS, MIN_SPAN_HOURS } from './bind-criterion-checker.js';

/** The two real production call sites gated on a real user/system action (FR-2). 'sweep' is
 * a periodic background check and does not count as chokepoint evidence on its own. */
const CHOKEPOINT_SOURCES = Object.freeze(['publish_gate', 'deploy_precondition']);
const KNOWN_SOURCES = Object.freeze(['sweep', 'publish_gate', 'deploy_precondition']);

/** True when a Supabase/PostgREST error means "the object does not exist yet" (PGRST205/42P01). */
function isMissingRelationError(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = String(error.message || '');
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(message);
}

function computeSpanHours(rows) {
  if (rows.length === 0) return 0;
  const timestamps = rows
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => Number.isFinite(t));
  if (timestamps.length === 0) return 0;
  return (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60);
}

/**
 * FR-2 AC1: count and most-recent timestamp per payload.source value, including an
 * 'other' bucket for any value outside the 3 known production sources.
 * @param {Array<{payload: {source?: string}, created_at: string}>} rows
 * @returns {Record<string, {count: number, most_recent: string|null}>}
 */
export function computeSourceBreakdown(rows) {
  const breakdown = {};
  for (const r of rows) {
    const source = KNOWN_SOURCES.includes(r.payload?.source) ? r.payload.source : 'other';
    if (!breakdown[source]) breakdown[source] = { count: 0, most_recent: null };
    breakdown[source].count += 1;
    if (!breakdown[source].most_recent || new Date(r.created_at) > new Date(breakdown[source].most_recent)) {
      breakdown[source].most_recent = r.created_at;
    }
  }
  return breakdown;
}

/**
 * FR-1/FR-2/FR-3/FR-4: pure evidence-sufficiency evaluator over the TRUE unbounded
 * VENTURE_CRACK_GATE_OBSERVE_ONLY history (never the 5-row sliding window). No DB access --
 * substrateSignals are pre-computed and injected (see fetchCrackGateSubstrateSignals) so
 * this stays unit-testable with synthetic data.
 *
 * Precedence (most severe first, mirrors evaluateExitGateCriterion): SUBSTRATE_EMPTY,
 * insufficient_rows, insufficient_span, missing_chokepoint_evidence, MEETS_CRITERION.
 *
 * @param {Array<{payload: {source?: string}, created_at: string}>} rows
 * @param {{attestationRowCount: number|null, pbnAvailable: boolean|null}} substrateSignals
 * @returns {{verdict: 'MEETS_CRITERION'|'NOT_MET', reason: string|null, row_count: number, span_hours: number, source_breakdown: object}}
 */
export function evaluateCrackGateCriterion(rows, substrateSignals = {}) {
  const { attestationRowCount = null, pbnAvailable = null } = substrateSignals;
  const rowCount = rows.length;
  const spanHours = computeSpanHours(rows);
  const sourceBreakdown = computeSourceBreakdown(rows);
  const chokepointCount = CHOKEPOINT_SOURCES.reduce((sum, s) => sum + (sourceBreakdown[s]?.count || 0), 0);

  // FR-4: highest precedence, checked before insufficient_rows/insufficient_span. Fails
  // conservatively (toward SUBSTRATE_EMPTY) on an unmeasured/null signal, same discipline as
  // bind-criterion-checker.js's flagship-veto check -- an ambiguous substrate is never CLEAN.
  const substrateEmpty = !(attestationRowCount > 0) || pbnAvailable !== true;
  if (substrateEmpty) {
    return { verdict: 'NOT_MET', reason: 'SUBSTRATE_EMPTY', row_count: rowCount, span_hours: spanHours, source_breakdown: sourceBreakdown };
  }
  if (rowCount < MIN_ROWS) {
    return { verdict: 'NOT_MET', reason: 'insufficient_rows', row_count: rowCount, span_hours: spanHours, source_breakdown: sourceBreakdown };
  }
  if (spanHours < MIN_SPAN_HOURS) {
    return { verdict: 'NOT_MET', reason: 'insufficient_span', row_count: rowCount, span_hours: spanHours, source_breakdown: sourceBreakdown };
  }
  // FR-2: must never read MEETS_CRITERION while BOTH real chokepoint sources are silent.
  if (chokepointCount === 0) {
    return { verdict: 'NOT_MET', reason: 'missing_chokepoint_evidence', row_count: rowCount, span_hours: spanHours, source_breakdown: sourceBreakdown };
  }
  return { verdict: 'MEETS_CRITERION', reason: null, row_count: rowCount, span_hours: spanHours, source_breakdown: sourceBreakdown };
}

/**
 * FR-1: fetches the TRUE unbounded VENTURE_CRACK_GATE_OBSERVE_ONLY history via
 * fetchAllPaginated (never a raw unbounded .select(), per the 2026-07-19 PostgREST-cap
 * incident this primitive exists to close). Throws on failure (TS-8) -- callers let this
 * propagate so the CLI's existing try/catch converts it to exit code 2, "could not determine".
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{payload: object, created_at: string}>>}
 */
export async function fetchAllCrackGateObserveRows(supabase) {
  return fetchAllPaginated(() =>
    supabase.from('system_events').select('payload, created_at').eq('event_type', 'VENTURE_CRACK_GATE_OBSERVE_ONLY')
  );
}

/**
 * FR-4: live substrate-sufficiency signals. Both reads treat "the object does not exist yet"
 * as the expected state of an unapplied chairman-gated migration (SUBSTRATE_EMPTY territory,
 * not an infra error) -- any OTHER failure (e.g. a genuine connection error) throws, per TS-8.
 *
 * The pbn_verdict probe is a coarse, fleet-wide "is the column readable at all" check -- a
 * schema-level absence errors identically for every row, so .limit(1) is sufficient. This is
 * deliberately coarser than venture_pbn_status(uuid)'s per-venture nuance (database/chairman-
 * gated/20260817_venture_pbn_status_read.sql): that RPC answers "can THIS venture's PBN be
 * read", this answers "does the substrate exist at all" -- the question FR-4 actually asks.
 * The exact error-message substring mirrors the already-shipped-to-production detection in
 * lib/eva/stage-zero/venture-nursery.js (parkVenture's own degrade-on-missing-column path).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{attestationRowCount: number, pbnAvailable: boolean}>}
 */
export async function fetchCrackGateSubstrateSignals(supabase) {
  const [attestationResult, pbnProbeResult] = await Promise.all([
    supabase.from('venture_gate_attestations').select('*', { count: 'exact', head: true }),
    supabase.from('venture_nursery').select('pbn_verdict').limit(1), // schema-lint-disable-line: column verified live via direct REST probe 2026-08-18 (SUPABASE_SERVICE_ROLE_KEY) after chairman-gated database/migrations/20260815_venture_nursery_pbn_verdict.sql applied to prod; database/schema-reference-snapshot.json (generated 2026-08-12) predates that migration and this session has no direct-Postgres credentials to regenerate it locally
  ]);

  let attestationRowCount;
  if (attestationResult.error) {
    if (isMissingRelationError(attestationResult.error)) attestationRowCount = 0;
    else throw new Error(`venture_gate_attestations count failed: ${attestationResult.error.message}`);
  } else {
    attestationRowCount = attestationResult.count ?? 0;
  }

  let pbnAvailable;
  if (pbnProbeResult.error) {
    if (String(pbnProbeResult.error.message || '').includes("Could not find the 'pbn_verdict' column")) pbnAvailable = false;
    else throw new Error(`venture_nursery pbn_verdict probe failed: ${pbnProbeResult.error.message}`);
  } else {
    pbnAvailable = true;
  }

  return { attestationRowCount, pbnAvailable };
}

export const CRACK_GATE_MIN_ROWS = MIN_ROWS;
export const CRACK_GATE_MIN_SPAN_HOURS = MIN_SPAN_HOURS;
