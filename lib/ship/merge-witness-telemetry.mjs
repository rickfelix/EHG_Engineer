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
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function writeMergeWitnessTelemetry(supabase, verdict, { repo = null, lane, logger = console }) {
  try {
    const { error } = await supabase.from('merge_witness_telemetry').insert({
      pr_number: Number(verdict.prNumber),
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
