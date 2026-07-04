/**
 * Telemetry writer for the mergeWork() P1-P5 precondition ladder.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 FR-3. Persists one row per
 * evaluateMergeWorkLadder() result into the additive merge_witness_telemetry
 * table (database/migrations/20260703_merge_witness_telemetry.sql).
 *
 * Best-effort by design: a telemetry write failure must NEVER propagate into
 * a merge lane's control flow (FR-4's whole premise is that this substrate is
 * observe-only and cannot make a merge attempt behave differently than it did
 * before this SD). Callers should not await-and-throw on this; writeTelemetry
 * itself swallows and logs instead of rejecting.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ overall: string, prNumber: number|string, workKey: string|null, tier: string, rungs: Array }} verdict
 * @param {{ repo?: string, lane: string, logger?: { warn: Function } }} p
 * @returns {Promise<{ ok: boolean, error: string|null, skipped?: boolean }>}
 */
export async function writeMergeWitnessTelemetry(supabase, verdict, { repo = null, lane, logger = console }) {
  // SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-5: this insert used to be unconditional, so any
  // re-run for the same (repo, pr_number, lane) — the reconcile sweep (FR-1) and the retroactive
  // batch backfill (FR-2) both re-process merges across runs — double-wrote. lane is part of the
  // identity (not just repo+pr_number): mergework-observation and reconcile-sweep rows for the
  // SAME PR are two distinct, both-legitimate observations, not duplicates of each other.
  // The existence check is its OWN best-effort step, isolated from the insert's try/catch: any
  // failure here (network hiccup, a caller's minimal test-double lacking .select) must fall
  // through to attempting the insert exactly as before this SD, never silently skip a write.
  const prNumber = Number(verdict.prNumber);
  try {
    const { data: existing, error: existErr } = await supabase
      .from('merge_witness_telemetry')
      .select('id')
      .eq('repo', repo)
      .eq('pr_number', prNumber)
      .eq('lane', lane)
      .limit(1);
    if (!existErr && existing && existing.length) {
      return { ok: true, error: null, skipped: true };
    }
  } catch {
    /* existence check unavailable -- fall through to the insert attempt, unchanged behavior */
  }

  try {
    const { error } = await supabase.from('merge_witness_telemetry').insert({
      pr_number: prNumber,
      repo,
      work_key: verdict.workKey ?? null,
      tier: verdict.tier ?? null,
      lane,
      via_mergework: true,
      overall: verdict.overall,
      rungs: verdict.rungs,
    });
    if (error) {
      logger.warn?.(`⚠️  merge_witness_telemetry insert failed (non-fatal, observe-only): ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    logger.warn?.(`⚠️  merge_witness_telemetry insert threw (non-fatal, observe-only): ${e?.message || e}`);
    return { ok: false, error: e?.message || String(e) };
  }
}
