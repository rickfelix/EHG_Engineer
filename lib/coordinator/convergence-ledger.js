/**
 * Convergence ledger — the SSOT read/write helpers for the S19->S26 convergence-walk ledger.
 * SD-LEO-INFRA-CONVERGENCE-LEDGER-001 (FR-3..FR-6).
 *
 * Tables (database/migrations/20260630_convergence_ledger.sql):
 *   convergence_ledger_runs    (run_id PK, subject_venture_id, dummy_kind, sandbox_repo, started_at,
 *                               ended_at, status, harvest jsonb)
 *   convergence_ledger_stages  (UNIQUE(run_id, stage 0..26), fix_cycle_count, issues_found,
 *                               issues_resolved, stage_status)
 *
 * The 4 convergence circuit-breakers (SD-LEO-INFRA-CONVERGENCE-CIRCUIT-BREAKERS-001) read EXCLUSIVELY
 * through the getters here (getActiveRun / getStageChurn / getWalkSpawnedCount / getIssuesPerRunTrend),
 * so the breakers + dashboards share one SSOT and never touch raw rows.
 *
 * FR-3 walk-spawned-SD tagging is a strategic_directives_v2.metadata.convergence_walk_run_id marker
 * (NO schema change) — getWalkSpawnedCount queries it so walk-spawned SDs are cleanly separable from
 * organic infra SDs. The launcher (in the circuit-breakers SD) stamps the marker at spawn.
 */

export const RUNS_TABLE = 'convergence_ledger_runs';
export const STAGES_TABLE = 'convergence_ledger_stages';
export const WALK_RUN_MARKER = 'convergence_walk_run_id';

// ── pure helpers (DB-free, deterministic) ──────────────────────────────────

/**
 * FR-4: is the issues-per-run series trending DOWN? The churn-abort escalates+STOPs when this is FALSE
 * (issues are not converging). A series is trending down when its last value is strictly below its first
 * AND no later value exceeds an earlier one by the monotonic-decrease test (non-increasing, strictly
 * lower end). 0- or 1-length series are treated as "not enough evidence of churn" => trending down (true).
 * PURE/TOTAL.
 * @param {number[]} series  issues-per-run, oldest -> newest
 * @returns {boolean}
 */
export function isTrendingDown(series) {
  if (!Array.isArray(series)) return true;
  const xs = series.filter((n) => Number.isFinite(n));
  if (xs.length <= 1) return true;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] > xs[i - 1]) return false; // a later run had MORE issues than the prior -> not converging
  }
  return xs[xs.length - 1] < xs[0]; // and the end is strictly below the start
}

// ── write helpers ──────────────────────────────────────────────────────────

/** Start a run. Returns { run_id } (or { error }). */
export async function startRun(supabase, { subject_venture_id = null, dummy_kind = null, sandbox_repo = null } = {}) {
  if (!supabase) return { error: 'no_supabase' };
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .insert({ subject_venture_id, dummy_kind, sandbox_repo, status: 'active' })
    .select('run_id')
    .single();
  return error ? { error: error.message } : { run_id: data.run_id };
}

/** Upsert a per-stage row (one per run_id+stage). Pass deltas/values to set. */
export async function upsertStage(supabase, runId, stage, fields = {}) {
  if (!supabase) return { error: 'no_supabase' };
  const row = { run_id: runId, stage, ...fields };
  const { error } = await supabase.from(STAGES_TABLE).upsert(row, { onConflict: 'run_id,stage' });
  return error ? { error: error.message } : { ok: true };
}

/** FR-5: write the run-end dual-purpose harvest ({ defects, lessons }) + close the run. */
export async function recordHarvest(supabase, runId, harvest, { status = 'clean' } = {}) {
  if (!supabase) return { error: 'no_supabase' };
  const { error } = await supabase
    .from(RUNS_TABLE)
    .update({ harvest, status, ended_at: new Date().toISOString() })
    .eq('run_id', runId);
  return error ? { error: error.message } : { ok: true };
}

/** End a run with a terminal status (no harvest). */
export async function endRun(supabase, runId, status = 'clean') {
  if (!supabase) return { error: 'no_supabase' };
  const { error } = await supabase
    .from(RUNS_TABLE)
    .update({ status, ended_at: new Date().toISOString() })
    .eq('run_id', runId);
  return error ? { error: error.message } : { ok: true };
}

// ── read SSOT (consumed by the circuit-breakers + dashboards) ───────────────

/** The current active run (most recent status='active'), or null. */
export async function getActiveRun(supabase) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return error ? null : (data || null);
}

/** Breaker #2 input: the fix_cycle_count for (run_id, stage). 0 when no row. */
export async function getStageChurn(supabase, runId, stage) {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from(STAGES_TABLE)
    .select('fix_cycle_count')
    .eq('run_id', runId)
    .eq('stage', stage)
    .maybeSingle();
  return error || !data ? 0 : (Number(data.fix_cycle_count) || 0);
}

/**
 * Breakers #3/#4 input: count of walk-spawned fix-SDs, by run_id OR by day (UTC, default today).
 * Reads the strategic_directives_v2.metadata.convergence_walk_run_id marker.
 * @param {object} opts { run_id?:string, sinceIso?:string }  run_id scopes to one run; sinceIso scopes by created_at>=.
 */
export async function getWalkSpawnedCount(supabase, opts = {}) {
  if (!supabase) return 0;
  let q = supabase
    .from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true })
    .not(`metadata->>${WALK_RUN_MARKER}`, 'is', null);
  if (opts.run_id) q = q.eq(`metadata->>${WALK_RUN_MARKER}`, opts.run_id);
  if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso);
  const { count, error } = await q;
  return error ? 0 : (count || 0);
}

/**
 * FR-4: issues-per-run series over the last K runs (oldest -> newest), for the churn-abort.
 * Each run's issues = SUM(issues_found) across its stages. Returns number[].
 */
export async function getIssuesPerRunTrend(supabase, k = 5) {
  if (!supabase) return [];
  const { data: runs, error: rErr } = await supabase
    .from(RUNS_TABLE)
    .select('run_id, started_at')
    .order('started_at', { ascending: false })
    .limit(k);
  if (rErr || !runs || runs.length === 0) return [];
  const ordered = [...runs].reverse(); // oldest -> newest
  const series = [];
  for (const run of ordered) {
    const { data: stages, error: sErr } = await supabase
      .from(STAGES_TABLE)
      .select('issues_found')
      .eq('run_id', run.run_id);
    if (sErr) { series.push(0); continue; }
    series.push((stages || []).reduce((sum, s) => sum + (Number(s.issues_found) || 0), 0));
  }
  return series;
}

export default {
  RUNS_TABLE, STAGES_TABLE, WALK_RUN_MARKER,
  isTrendingDown,
  startRun, upsertStage, recordHarvest, endRun,
  getActiveRun, getStageChurn, getWalkSpawnedCount, getIssuesPerRunTrend,
};
