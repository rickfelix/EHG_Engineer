'use strict';
/**
 * ensure-active-baseline — SD-FDBK-INFRA-AUTO-MAINTAIN-EXECUTION-001
 *
 * Auto-maintains the SD execution baseline so worker self-claim never silently idles
 * with a full queue. worker-checkin self-claim reads v_sd_next_candidates, which JOINs
 * sd_baseline_items of the baseline WHERE is_active=TRUE; with ZERO active baseline the
 * view returns 0 rows and EVERY /checkin reports "nothing claimable" — even with workable
 * draft SDs. (Verified: v_sd_next_candidates flipped 0->14 the instant `sd:baseline create`
 * ran.) This helper closes that gap: when no active baseline exists, it auto-creates one,
 * mirroring scripts/sd-baseline.js createBaseline (the proven manual fix).
 *
 * Contract: idempotent (creates AT MOST ONE baseline; SELECT short-circuits when one exists),
 * fail-open (NEVER throws — the whole body is wrapped; any error returns {created:false,
 * reason:'error:...'}), concurrency-safe (the partial unique index idx_sd_baselines_single_active
 * makes exactly one winner of a parallel-create race; the loser treats 23505 as a benign no-op).
 *
 * LIVE-VERIFIED facts (not migration files — those were stale):
 *  - sd_baseline_items.sd_id holds the sd_KEY string (e.g. "SD-EHG-WEBSITE-001"), and
 *    v_sd_next_candidates JOINs sd_baseline_items.sd_id = strategic_directives_v2.sd_key.
 *    => items MUST be inserted with sd_id = sd.sd_key (matching createBaseline).
 *  - The view computes deps_satisfied LIVE from dependencies_snapshot vs strategic_directives_v2
 *    .status and IGNORES the stored is_ready / dependency_health_score columns — so those are
 *    ornamental defaults here (true / 1.0); a later LEAD rebaseline recomputes them.
 *
 * @param {object} sb  an already-constructed supabase service client (injected; unit-testable)
 * @returns {Promise<{created:boolean, baselineId:string|null, itemCount:number, reason:string}>}
 */
async function ensureActiveBaseline(sb) {
  try {
    // 1) Short-circuit if an active baseline already exists (idempotent steady state).
    const { data: existing } = await sb
      .from('sd_execution_baselines')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();
    if (existing && existing.id) {
      return { created: false, baselineId: existing.id, itemCount: 0, reason: 'exists' };
    }

    // 2) Candidate SDs — SAME query as sd-baseline.js createBaseline (the proven fix).
    const { data: sds } = await sb
      .from('strategic_directives_v2')
      .select('id, sd_key, title, sequence_rank, priority, status, dependencies, metadata, progress_percentage')
      .not('sequence_rank', 'is', null)
      .in('status', ['draft', 'active', 'in_progress'])
      .order('sequence_rank')
      .limit(50);
    if (!sds || sds.length === 0) {
      // Genuine empty queue (or no SDs have sequence_rank) — a legitimate idle, not a failure.
      return { created: false, baselineId: null, itemCount: 0, reason: 'no_sds' };
    }

    // 3) Insert the baseline (is_active=true). The partial unique index resolves races.
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const { data: baseline, error: blErr } = await sb
      .from('sd_execution_baselines')
      .insert({
        baseline_name: `${today} Auto-Maintained Baseline`,
        baseline_type: 'auto_maintained',
        is_active: true,
        created_by: 'auto-maintain',
        approved_by: 'auto-maintain',
        approved_at: nowIso,
        notes: `Auto-created by worker-checkin to unblock self-claim (${sds.length} SDs).`,
      })
      .select('id')
      .maybeSingle();

    if (blErr) {
      // Lost the create race (peer won) — the active baseline now exists, which is our goal.
      const code = blErr.code || '';
      const msg = blErr.message || '';
      if (code === '23505' || /idx_sd_baselines_single_active|duplicate key/i.test(msg)) {
        const { data: winner } = await sb
          .from('sd_execution_baselines')
          .select('id')
          .eq('is_active', true)
          .maybeSingle();
        return { created: false, baselineId: winner ? winner.id : null, itemCount: 0, reason: 'race_lost' };
      }
      return { created: false, baselineId: null, itemCount: 0, reason: `error:${msg || 'baseline_insert_failed'}` };
    }
    if (!baseline || !baseline.id) {
      return { created: false, baselineId: null, itemCount: 0, reason: 'error:baseline_insert_no_id' };
    }

    // 4) Insert baseline items. sd_id MUST be sd.sd_key (the view JOIN key — live-verified).
    const items = sds.map((sd) => {
      const track = (sd.metadata && sd.metadata.execution_track) || 'UNASSIGNED';
      const trackKey = (track === 'Infrastructure' || track === 'Safety') ? 'A'
        : track === 'Feature' ? 'B'
        : track === 'Quality' ? 'C'
        : track === 'STANDALONE' ? 'STANDALONE' : null;
      const trackName = trackKey === 'A' ? 'Infrastructure/Safety'
        : trackKey === 'B' ? 'Feature/Stages'
        : trackKey === 'C' ? 'Quality'
        : trackKey === 'STANDALONE' ? 'Standalone' : 'Unassigned';
      return {
        baseline_id: baseline.id,
        sd_id: sd.sd_key, // JOIN key — see header note
        sequence_rank: sd.sequence_rank,
        track: trackKey,
        track_name: trackName,
        dependencies_snapshot: sd.dependencies != null ? sd.dependencies : null,
        dependency_health_score: 1.0, // ornamental — view ignores it (computes deps live)
        is_ready: true, // ornamental — view ignores it
        notes: (sd.metadata && sd.metadata.rationale) || null,
      };
    });

    const { error: itErr } = await sb.from('sd_baseline_items').insert(items);
    if (itErr) {
      // Never leave an active-but-empty baseline (it would itself re-cause silent-idle).
      // Best-effort rollback; the delete must NOT throw out of the helper.
      try {
        await sb.from('sd_execution_baselines').delete().eq('id', baseline.id);
      } catch (_) { /* swallow — orphan superseded by next rebaseline; fail-open */ }
      return { created: false, baselineId: null, itemCount: 0, reason: `items_failed:${itErr.message || 'items_insert_failed'}` };
    }

    // 5) Best-effort actuals (view LEFT-JOINs — non-fatal if this fails).
    try {
      const actuals = sds.map((sd) => ({
        sd_id: sd.sd_key,
        baseline_id: baseline.id,
        status: sd.progress_percentage > 0 ? 'in_progress' : 'not_started',
      }));
      await sb.from('sd_execution_actuals').insert(actuals);
    } catch (_) { /* swallow — actuals are display/burnrate only */ }

    // 6) Loud notice ONLY now (after baseline+items committed). stderr so it never
    //    corrupts the JSON-on-stdout that the /checkin skill parses. Never let logging throw.
    try {
      console.error(
        `[ensure-active-baseline] No active execution baseline found — auto-created `
        + `'${today} Auto-Maintained Baseline' (is_active=true) with ${items.length} SD(s) so worker `
        + `self-claim has a ranked queue. v_sd_next_candidates is now populated; run \`npm run sd:baseline\` to review or rebaseline.`
      );
    } catch (_) { /* swallow logging errors */ }

    return { created: true, baselineId: baseline.id, itemCount: items.length, reason: 'created' };
  } catch (e) {
    // Outer guard — the helper NEVER throws; degrades to today's behavior (worker idles).
    return { created: false, baselineId: null, itemCount: 0, reason: `error:${(e && e.message) || e}` };
  }
}

module.exports = { ensureActiveBaseline };
