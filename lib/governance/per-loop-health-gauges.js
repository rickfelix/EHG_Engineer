/**
 * Per-loop health gauges (SD-LEO-INFRA-009-LEAF-PER-001)
 *
 * Two KPIs per self-improvement loop, computed from the leaf-1 spine
 * (v_improvement_ledger, SD-LEO-INFRA-009-LEAF-IMPROVEMENT-001): witnessesBeforePrevention (an
 * un-prevented RECORD backlog, target <=2) and recurrenceAfterClosure (a RECORD reappearing after
 * that cycle's own PREVENT, target 0). Read-only measurement feeding leaf-2 (FORMALIZE) enforcement
 * thresholds. Mirrors the pure-detector / I/O-fetch split established by work-boundary-gauges.js.
 *
 * @module lib/governance/per-loop-health-gauges
 */

export const LOOP_IDS = [
  'A_applied_rate',
  'B_signal_aggregation',
  'C_retro_learn',
  'D_convergence_clone',
  'E_role_self_review',
  'F_pat_registry',
];

// Per the frozen spine's documented per-loop stage coverage (docs/architecture/
// improvement-ledger-ssot-spine.md): B and C never emit a PREVENT stage by design (B is ephemeral
// with no FK to a closure event; C's PREVENT concept is covered by loop A/F). Hardcoded from the
// view definition, not a live row-count check, so a currently-empty-but-structurally-capable loop
// (e.g. D) is not misclassified as not-applicable.
const LOOPS_WITHOUT_PREVENT = new Set(['B_signal_aggregation', 'C_retro_learn']);

const WITNESSES_BEFORE_PREVENTION_TARGET = 2;

/**
 * Pure: computes both per-loop KPIs from pre-fetched spine rows restricted to one loop_id and
 * stage IN (RECORD, PREVENT). Returns applicable:false for loops that structurally never reach
 * PREVENT -- avoids the no-data-as-perfect-health trap (a loop that cannot close is not "healthy").
 * @param {string} loopId
 * @param {Array<{cycle_id: string, stage: ('RECORD'|'PREVENT'), entered_at: string}>} rows
 * @returns {{applicable: boolean, witnessesBeforePrevention: (number|null), recurrenceAfterClosure: (number|null), count: number}}
 */
export function computeLoopHealth(loopId, rows) {
  if (LOOPS_WITHOUT_PREVENT.has(loopId)) {
    return { applicable: false, witnessesBeforePrevention: null, recurrenceAfterClosure: null, count: 0 };
  }

  const earliestPreventByCycle = new Map();
  const recordTimesByCycle = new Map();
  for (const r of rows || []) {
    const t = new Date(r?.entered_at).getTime();
    if (!Number.isFinite(t) || !r?.cycle_id) continue;
    if (r.stage === 'PREVENT') {
      const prev = earliestPreventByCycle.get(r.cycle_id);
      if (prev === undefined || t < prev) earliestPreventByCycle.set(r.cycle_id, t);
    } else if (r.stage === 'RECORD') {
      if (!recordTimesByCycle.has(r.cycle_id)) recordTimesByCycle.set(r.cycle_id, []);
      recordTimesByCycle.get(r.cycle_id).push(t);
    }
  }

  let witnessesBeforePrevention = 0;
  let recurrenceAfterClosure = 0;
  for (const [cycleId, recordTimes] of recordTimesByCycle) {
    const preventTime = earliestPreventByCycle.get(cycleId);
    if (preventTime === undefined) {
      witnessesBeforePrevention += 1;
    } else if (recordTimes.some((t) => t > preventTime)) {
      recurrenceAfterClosure += 1;
    }
  }

  const breach = witnessesBeforePrevention > WITNESSES_BEFORE_PREVENTION_TARGET || recurrenceAfterClosure > 0;
  return { applicable: true, witnessesBeforePrevention, recurrenceAfterClosure, count: breach ? 1 : 0 };
}

/**
 * I/O: the one Supabase read for a single loop's health computation. Narrow column set (cycle_id,
 * stage, entered_at only) and stage-filtered to RECORD/PREVENT -- DECIDE/ACT/VERIFY are irrelevant
 * to these two KPIs. truncated is surfaced (never silently dropped) because loops B/C/F carry high
 * historical row counts that could exceed the limit.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} loopId
 * @param {{limit?: number}} [opts]
 * @returns {Promise<{rows: Array<object>, truncated: boolean}>}
 */
export async function fetchLoopStageRows(supabase, loopId, opts = {}) {
  const limit = opts.limit || 5000;
  // Descending order so a TRUNCATED read (row count >= limit) keeps the most recent activity, not
  // the oldest -- computeLoopHealth's per-cycle min/any-comparisons are order-independent, so this
  // only affects which rows survive truncation, and "current backlog" should reflect what's recent.
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: the old single .limit(5000) read was
  // silently clamped to the PostgREST 1000-row max, so the truncated flag (>= limit) could never
  // fire. Paginate to the DECLARED sampling cap (maxRows) instead; fail-loud policy preserved.
  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('v_improvement_ledger')
      .select('cycle_id, stage, entered_at')
      .eq('loop_id', loopId)
      .in('stage', ['RECORD', 'PREVENT'])
      .order('entered_at', { ascending: false })
      .order('cycle_id') // tiebreaker for stable pagination...
      .order('stage'), // ...+ stage makes the (entered_at, cycle_id, stage) sort total
    { maxRows: limit });
  } catch (e) {
    throw new Error(`fetchLoopStageRows failed for ${loopId}: ${(e && e.message) || String(e)}`);
  }
  return { rows, truncated: rows.length >= limit };
}
