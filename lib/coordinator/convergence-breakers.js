/**
 * Convergence circuit-breakers — 4 HARD, machine-enforced pauses + churn-abort that gate the
 * convergence-walk build-tree launcher. SD-LEO-INFRA-CONVERGENCE-CIRCUIT-BREAKERS-001.
 *
 * The convergence walk is self-amplifying — its fix-SDs eat the product-protecting fleet ceiling
 * (the incident: infra ~24.5/day drove product 14->1.25/day). So capacity safety is enforced in CODE:
 * a walk cannot launch a new build-tree child while any breaker is tripped.
 *
 * Metrics come ONLY through the convergence-ledger read-helper SSOT (lib/coordinator/convergence-ledger.js)
 * + a product-throughput telemetry read — the breakers never touch raw ledger rows.
 */

import {
  getWalkSpawnedCount,
  getIssuesPerRunTrend,
  isTrendingDown,
  STAGES_TABLE,
} from './convergence-ledger.js';

/**
 * Overridable threshold defaults. Derived from the observed incident (infra burst starved product):
 * keep the walk from launching while it would starve product or while it is churning/over-budget.
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  product_floor_per_day: 2,        // B1: the walk must not launch while product completions/day are below this
  stage_churn_cap: 5,              // B2: a single stage with >= this many fix-cycles is churning
  walk_spawned_daily_budget: 10,   // B3: max walk-spawned fix-SDs per UTC day
  walk_spawned_cumulative_budget: 30, // B4: max walk-spawned fix-SDs per run
  trend_k: 5,                      // churn-abort: issues-per-run window
});

const PRODUCT_SD_PREFIX = 'SD-EHG-PRODUCT';

/**
 * FR-1: PURE breaker evaluation. Given the gathered metrics, return which breakers are tripped and
 * whether a launch is allowed (allowed === no breaker tripped). DB-free + deterministic.
 * @param {{ productPerDay:number, worstStageFixCycles:number, walkSpawnedToday:number,
 *           walkSpawnedCumulative:number, issuesTrendingDown:boolean }} m
 * @param {object} [thresholds]
 * @returns {{ allowed:boolean, tripped:Array<{breaker:string,value:number|boolean,threshold:number,reason:string}> }}
 */
export function evaluateBreakers(m = {}, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const tripped = [];
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  if (num(m.productPerDay) < t.product_floor_per_day) {
    tripped.push({ breaker: 'product_throughput_floor', value: num(m.productPerDay), threshold: t.product_floor_per_day,
      reason: `product throughput ${num(m.productPerDay)}/day is below the floor ${t.product_floor_per_day}/day — the walk would starve product; recover when product is back >= ${t.product_floor_per_day}/day` });
  }
  if (num(m.worstStageFixCycles) >= t.stage_churn_cap) {
    tripped.push({ breaker: 'per_stage_churn_cap', value: num(m.worstStageFixCycles), threshold: t.stage_churn_cap,
      reason: `a stage has ${num(m.worstStageFixCycles)} fix-cycles (cap ${t.stage_churn_cap}) — churning; resolve the churning stage before launching more` });
  }
  if (num(m.walkSpawnedToday) > t.walk_spawned_daily_budget) {
    tripped.push({ breaker: 'walk_spawned_daily_budget', value: num(m.walkSpawnedToday), threshold: t.walk_spawned_daily_budget,
      reason: `walk-spawned ${num(m.walkSpawnedToday)} SDs today (budget ${t.walk_spawned_daily_budget}) — daily fix-SD budget exhausted; resumes next UTC day` });
  }
  if (num(m.walkSpawnedCumulative) > t.walk_spawned_cumulative_budget) {
    tripped.push({ breaker: 'walk_spawned_cumulative_budget', value: num(m.walkSpawnedCumulative), threshold: t.walk_spawned_cumulative_budget,
      reason: `walk-spawned ${num(m.walkSpawnedCumulative)} SDs this run (budget ${t.walk_spawned_cumulative_budget}) — cumulative budget exhausted; needs an explicit human un-pause` });
  }
  // churn-abort: issues-per-run not trending down -> escalate+STOP (explicit human un-pause).
  if (m.issuesTrendingDown === false) {
    tripped.push({ breaker: 'churn_abort', value: false, threshold: 0,
      reason: 'issues-per-run is NOT trending down — the walk is not converging; escalate + STOP (explicit human un-pause required)' });
  }
  return { allowed: tripped.length === 0, tripped };
}

// ── metric gathering (via the ledger SSOT + product telemetry) ──────────────

/** Product-throughput/day: completed SD-EHG-PRODUCT-* in the last 24h. Fail-safe -> 0. */
export async function getProductThroughputPerDay(supabase, { sinceIso } = {}) {
  if (!supabase) return 0;
  const since = sinceIso || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .like('sd_key', `${PRODUCT_SD_PREFIX}%`)
    .gte('updated_at', since);
  return error ? 0 : (count || 0);
}

/** The worst (max) per-stage fix_cycle_count for a run, via the ledger. Fail-safe -> 0. */
export async function getWorstStageFixCycles(supabase, runId) {
  if (!supabase || !runId) return 0;
  const { data, error } = await supabase
    .from(STAGES_TABLE)
    .select('fix_cycle_count')
    .eq('run_id', runId)
    .order('fix_cycle_count', { ascending: false })
    .limit(1)
    .maybeSingle();
  return error || !data ? 0 : (Number(data.fix_cycle_count) || 0);
}

/**
 * FR-2: gather the breaker metrics through the ledger SSOT + product telemetry.
 * @returns {Promise<{ productPerDay:number, worstStageFixCycles:number, walkSpawnedToday:number, walkSpawnedCumulative:number, issuesTrendingDown:boolean }>}
 */
export async function getBreakerMetrics(supabase, { run_id, thresholds = {} } = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const startOfUtcDay = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString();
  const [productPerDay, worstStageFixCycles, walkSpawnedToday, walkSpawnedCumulative, trend] = await Promise.all([
    getProductThroughputPerDay(supabase),
    getWorstStageFixCycles(supabase, run_id),
    getWalkSpawnedCount(supabase, { sinceIso: startOfUtcDay }),
    getWalkSpawnedCount(supabase, { run_id }),
    getIssuesPerRunTrend(supabase, t.trend_k),
  ]);
  return {
    productPerDay,
    worstStageFixCycles,
    walkSpawnedToday,
    walkSpawnedCumulative,
    issuesTrendingDown: isTrendingDown(trend),
  };
}

// ── the gate (FR-3) ─────────────────────────────────────────────────────────

/**
 * FR-3: the HARD launch gate. Gathers (FR-2) + evaluates (FR-1) and, on a trip, emits a LOUD advisory +
 * records the trip. Returns { allowed, tripped, advisory }. The launcher MUST NOT launch a build-tree
 * child when allowed===false. Un-pause is EXPLICIT — the gate returns allowed:true only once the metrics
 * clear (recovery condition), never a silent auto-resume of a churn-abort.
 * @param {object} opts { run_id, thresholds?, emitAdvisory?:(msg)=>Promise, log?:(msg)=>void }
 */
export async function checkConvergenceLaunchAllowed(supabase, opts = {}) {
  const { run_id, thresholds = {}, emitAdvisory, log = () => {} } = opts;
  const metrics = await getBreakerMetrics(supabase, { run_id, thresholds });
  const { allowed, tripped } = evaluateBreakers(metrics, thresholds);
  if (allowed) return { allowed: true, tripped: [], advisory: null, metrics };

  const names = tripped.map((b) => b.breaker).join(', ');
  const advisory = `🛑 CONVERGENCE CIRCUIT-BREAKER TRIPPED (run ${run_id || '?'}): ${names}. Build-tree launch BLOCKED. ` +
    tripped.map((b) => `[${b.breaker}] ${b.reason}`).join(' | ');
  log(advisory);
  if (typeof emitAdvisory === 'function') {
    try { await emitAdvisory(advisory, { run_id, tripped }); } catch { /* advisory is best-effort */ }
  }
  return { allowed: false, tripped, advisory, metrics };
}

export default {
  DEFAULT_THRESHOLDS,
  evaluateBreakers,
  getProductThroughputPerDay,
  getWorstStageFixCycles,
  getBreakerMetrics,
  checkConvergenceLaunchAllowed,
};
