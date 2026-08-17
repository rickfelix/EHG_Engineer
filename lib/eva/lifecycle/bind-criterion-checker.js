/**
 * SD-LEO-INFRA-BIND-OBSERVE-ONLY-001
 *
 * Read-only checker for the 5 observe-only exit-gate strings + the symmetric VENTURE_STACK
 * check. Reports whether each has accumulated enough clean observation data to be safely
 * flipped to binding -- it does NOT flip anything itself. The actual bind (moving a string from
 * venture_stages.metadata.gates.exit_observe to gates.exit, or adding missing.length===0 to
 * lib/eva/bridge/venture-stack-agent.js:69's compliant computation) is a separate, later,
 * human-authored change, out of scope here (per this SD's own scope_reframe metadata:
 * ARMED-BUT-INERT ONLY -- flips nothing live, binds no gate).
 *
 * "venture-2 cohort" has no resolvable data mapping anywhere in the current schema (no cohort
 * column on ventures, no venture_cohorts/cohorts/venture_groups table -- measured 2026-08-17).
 * The flagship-veto check below is therefore scoped to MarketLens-by-venture-id only; the
 * cohort portion is an explicit, documented descope, not a silent gap.
 */

import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

export const MARKETLENS_VENTURE_IDS = Object.freeze([
  '4e710bb2-d521-4154-85f4-37300761b090',
  'ecbba50e-3c98-4493-9e77-1719cf6b6f00',
]);

export const CANDIDATE_GATE_STRINGS = Object.freeze([
  Object.freeze({ stage_number: 19, gate_string: 'stack descriptor valid' }),
  Object.freeze({ stage_number: 19, gate_string: 'deployment target provisioned' }),
  Object.freeze({ stage_number: 24, gate_string: 'pages url live' }),
  Object.freeze({ stage_number: 24, gate_string: 'compute deployed' }),
  Object.freeze({ stage_number: 24, gate_string: 'publish evidence recorded' }),
]);

const MIN_ROWS = 25;
const MIN_SPAN_HOURS = 48;

function computeSpanHours(rows) {
  if (rows.length === 0) return 0;
  const timestamps = rows
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => Number.isFinite(t));
  if (timestamps.length === 0) return 0;
  return (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60);
}

/**
 * FR-1: per-(stage_number, gate_string) bind-criterion evaluator.
 * FR-4: distinguishes CLEAN (evaluated, zero false-rejects) from UNTESTED (never evaluated)
 * for the MarketLens flagship-veto check, rather than treating absence-of-evidence as
 * evidence-of-cleanliness.
 *
 * Adversarial-review fix: the veto condition is `!== true`, not `=== false`. A MarketLens row
 * whose would_satisfy is null/undefined/malformed is NOT a confirmed pass, and this is the
 * highest-stakes check in the whole SD (per its own description: "a false-reject against the
 * flagship... blocks that string's bind indefinitely pending investigation") -- an ambiguous
 * result must fail conservatively toward blocking, never toward CLEAN.
 *
 * @param {Array<{venture_id:string|null, would_satisfy:boolean|null, created_at:string}>} rows
 *   Rows already filtered to ONE (stage_number, gate_string) pair.
 * @param {string[]} [marketLensVentureIds]
 * @returns {{verdict: 'MEETS_CRITERION'|'NOT_MET', reason: string|null, row_count: number, span_hours: number, marketlens_status: 'CLEAN'|'UNTESTED'|'FALSE_REJECT'}}
 */
export function evaluateExitGateCriterion(rows, marketLensVentureIds = MARKETLENS_VENTURE_IDS) {
  const rowCount = rows.length;
  const marketLensSet = new Set(marketLensVentureIds);
  const marketLensRows = rows.filter((r) => marketLensSet.has(r.venture_id));
  const marketLensFalseReject = marketLensRows.some((r) => r.would_satisfy !== true);
  const marketlensStatus =
    marketLensRows.length === 0 ? 'UNTESTED' : marketLensFalseReject ? 'FALSE_REJECT' : 'CLEAN';
  const spanHours = computeSpanHours(rows);

  if (marketLensFalseReject) {
    return { verdict: 'NOT_MET', reason: 'flagship_veto', row_count: rowCount, span_hours: spanHours, marketlens_status: marketlensStatus };
  }
  if (rowCount < MIN_ROWS) {
    return { verdict: 'NOT_MET', reason: 'insufficient_rows', row_count: rowCount, span_hours: spanHours, marketlens_status: marketlensStatus };
  }
  if (spanHours < MIN_SPAN_HOURS) {
    return { verdict: 'NOT_MET', reason: 'insufficient_span', row_count: rowCount, span_hours: spanHours, marketlens_status: marketlensStatus };
  }
  return { verdict: 'MEETS_CRITERION', reason: null, row_count: rowCount, span_hours: spanHours, marketlens_status: marketlensStatus };
}

/**
 * FR-5: symmetric VENTURE_STACK evaluator (report-only). VENTURE_STACK_OBSERVE_ONLY rows are
 * keyed by sd_id, not venture_id, so the MarketLens flagship-veto clause does not apply here --
 * this reports a fleet-wide false-positive-rate proxy instead (leaf SDs where missing.length>0
 * despite the current `compliant` computation already treating them as compliant).
 *
 * IMPORTANT: `false_positive_proxy_rate` is DELIBERATELY ADVISORY and does NOT gate `verdict`.
 * Unlike FR-1's exit-gate criterion (which has an explicit, numeric, zero-tolerance threshold
 * for MarketLens false-rejects), the SD's own description asks only that a human "confirm the
 * false-positive rate... is acceptably low" before binding -- "acceptably low" has no stated
 * numeric threshold anywhere in the SD, so this function reports the rate for a human (LEAD
 * reviewer) to judge rather than silently picking an unstated threshold on their behalf. The
 * CLI prints verdict and fp_rate together for exactly this reason -- see FR-6's "hand-verified"
 * discipline.
 *
 * @param {Array<{sd_id:string|null, missing:string[], created_at:string}>} rows
 * @returns {{verdict: 'MEETS_CRITERION'|'NOT_MET', reason: string|null, row_count: number, span_hours: number, false_positive_proxy_rate: number|null}}
 */
export function evaluateVentureStackCriterion(rows) {
  const rowCount = rows.length;
  if (rowCount === 0) {
    return { verdict: 'NOT_MET', reason: 'insufficient_rows', row_count: 0, span_hours: 0, false_positive_proxy_rate: null };
  }

  const spanHours = computeSpanHours(rows);
  const falsePositiveCount = rows.filter((r) => Array.isArray(r.missing) && r.missing.length > 0).length;
  const falsePositiveProxyRate = (falsePositiveCount / rowCount) * 100;

  if (rowCount < MIN_ROWS) {
    return { verdict: 'NOT_MET', reason: 'insufficient_rows', row_count: rowCount, span_hours: spanHours, false_positive_proxy_rate: falsePositiveProxyRate };
  }
  if (spanHours < MIN_SPAN_HOURS) {
    return { verdict: 'NOT_MET', reason: 'insufficient_span', row_count: rowCount, span_hours: spanHours, false_positive_proxy_rate: falsePositiveProxyRate };
  }
  return { verdict: 'MEETS_CRITERION', reason: null, row_count: rowCount, span_hours: spanHours, false_positive_proxy_rate: falsePositiveProxyRate };
}

/**
 * FR-2/TR-2: fetches ALL EXIT_GATE_OBSERVE_ONLY rows, filtered by event_type at the database
 * layer (never a post-fetch JS filter on the unfiltered 141k-row table). Per-gate grouping
 * happens in JS afterward (groupRowsByGateString).
 *
 * Adversarial-review fix: uses fetchAllPaginated (lib/db/fetch-all-paginated.mjs) rather than a
 * single unbounded .select() -- volume is single-digit rows today, but this tool's entire
 * premise is accumulating observation data over weeks/months, and a silent PostgREST cap
 * truncation (the exact incident that primitive was built to close, 2026-07-19) would corrupt
 * row_count/span_hours/marketlens_status without any error surfacing.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{venture_id:string|null, stage_number:number|null, gate_string:string|null, would_satisfy:boolean|null, created_at:string}>>}
 */
export async function fetchExitGateObserveRows(supabase) {
  const data = await fetchAllPaginated(() =>
    supabase.from('system_events').select('payload, created_at').eq('event_type', 'EXIT_GATE_OBSERVE_ONLY')
  );
  return data.map((r) => ({
    venture_id: r.payload?.venture_id ?? null,
    stage_number: r.payload?.stage_number ?? null,
    gate_string: r.payload?.gate_string ?? null,
    would_satisfy: r.payload?.would_satisfy ?? null,
    created_at: r.created_at,
  }));
}

/**
 * FR-2: fetches ALL VENTURE_STACK_OBSERVE_ONLY rows, filtered by event_type at the DB layer.
 * Paginated for the same reason as fetchExitGateObserveRows above.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{sd_id:string|null, missing:string[], would_fail:boolean|null, created_at:string}>>}
 */
export async function fetchVentureStackObserveRows(supabase) {
  const data = await fetchAllPaginated(() =>
    supabase.from('system_events').select('payload, created_at').eq('event_type', 'VENTURE_STACK_OBSERVE_ONLY')
  );
  return data.map((r) => ({
    sd_id: r.payload?.sd_id ?? null,
    missing: Array.isArray(r.payload?.missing) ? r.payload.missing : [],
    would_fail: r.payload?.would_fail ?? null,
    created_at: r.created_at,
  }));
}

/**
 * FR-2 (2nd AC): groups EXIT_GATE_OBSERVE_ONLY rows by (stage_number, gate_string). Rows
 * missing either field are excluded from grouping and returned separately as `malformed` --
 * never silently dropped without a count. Rows for a (stage_number, gate_string) pair outside
 * `candidates` are well-formed but simply not of interest to this checker, so they are neither
 * grouped nor counted as malformed.
 *
 * @param {ReturnType<typeof fetchExitGateObserveRows> extends Promise<infer T> ? T : never} rows
 * @param {typeof CANDIDATE_GATE_STRINGS} [candidates]
 * @returns {{groups: Map<string, Array>, malformed: Array}}
 */
export function groupRowsByGateString(rows, candidates = CANDIDATE_GATE_STRINGS) {
  const malformed = [];
  const groups = new Map();
  for (const c of candidates) groups.set(`${c.stage_number}::${c.gate_string}`, []);

  for (const r of rows) {
    if (r.stage_number == null || r.gate_string == null) {
      malformed.push(r);
      continue;
    }
    const key = `${r.stage_number}::${r.gate_string}`;
    if (groups.has(key)) groups.get(key).push(r);
  }
  return { groups, malformed };
}

/**
 * TR-4: cross-references CANDIDATE_GATE_STRINGS against the LIVE venture_stages.metadata.gates
 * config for stage 19/24, so a future SD adding/removing an observe-only string doesn't leave
 * this checker silently stale. Advisory only -- never throws on a config-shape surprise, and
 * never changes evaluation behavior; it only returns a diff for the CLI to print as a warning.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ok: boolean, missing_from_checker: Array, extra_in_checker: Array, error: string|null}>}
 */
export async function crossCheckCandidateGateStrings(supabase) {
  const stageNumbers = [...new Set(CANDIDATE_GATE_STRINGS.map((c) => c.stage_number))];
  try {
    const { data, error } = await supabase
      .from('venture_stages')
      .select('stage_number, metadata')
      .in('stage_number', stageNumbers);
    if (error) throw error;

    const live = new Set();
    for (const row of data || []) {
      const observeList = row?.metadata?.gates?.exit_observe;
      if (Array.isArray(observeList)) {
        for (const gateString of observeList) live.add(`${row.stage_number}::${gateString}`);
      }
    }

    const checkerSet = new Set(CANDIDATE_GATE_STRINGS.map((c) => `${c.stage_number}::${c.gate_string}`));
    const missingFromChecker = [...live].filter((k) => !checkerSet.has(k));
    const extraInChecker = [...checkerSet].filter((k) => !live.has(k));

    return { ok: missingFromChecker.length === 0 && extraInChecker.length === 0, missing_from_checker: missingFromChecker, extra_in_checker: extraInChecker, error: null };
  } catch (e) {
    return { ok: true, missing_from_checker: [], extra_in_checker: [], error: e?.message || String(e) };
  }
}
