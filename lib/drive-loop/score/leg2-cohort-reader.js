/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-2/FR-3/FR-4/TR-5) — reads the ranked-top-5 SNAPSHOT
 * cohort that scripts/coordinator-backlog-rank.mjs writes to drive_rank_snapshots, and refetches
 * FRESH strategic_directives_v2 rows for it, so scoreLeg2 (leg2-uptake.js) can measure uptake
 * even for SDs whose live metadata.dispatch_rank has since been cleared by claim.
 *
 * ── WHY THE NEAREST FULLY-ELAPSED COHORT, NOT THE LATEST ONE (R1) ────────────────────────────
 * coordinator-backlog-rank.mjs runs on a short cadence (~15min). The LATEST cohort is, by
 * construction, made of currently-CLAIMABLE (i.e. unclaimed) leaves — reading it would always
 * measure ~0% uptake, forever, while still reporting leg2 as MEASURED rather than unavailable.
 * Selecting the cohort whose ranked_at has fully elapsed the claim window (ranked_at <= nowMs -
 * windowMs) is what makes the window a real observation instead of a tautology.
 *
 * ── WHY THE WINDOW IS ANCHORED TO ranked_at, NOT TO nowMs (R2) ────────────────────────────────
 * drive-report-sweep.mjs self-heals across a 05:00-08:59 ET window, so report time can land
 * 21-27h after a cohort was ranked. Anchoring scoreLeg2's nowMs to the live report clock would
 * make the effective claim window drift with whichever tick happens to fire. The caller (buildGather)
 * is responsible for computing nowMs = Date.parse(cohort.rankedAt) + windowMs before calling
 * scoreLeg2 — this module only selects the cohort and refetches its rows.
 *
 * ── WHY THE REFETCH, NOT THE SNAPSHOT ROWS THEMSELVES (R3/R4) ─────────────────────────────────
 * The snapshot stores identity only (sd_id, sd_key, rank, ranked_at) — never metadata. Reusing a
 * frozen claim_history captured at snapshot time would read as permanently unclaimed. Explicit
 * column selection (id, sd_key, metadata) avoids a query shape that could otherwise degrade a
 * grain's sd_id to null.
 *
 * ── WHY cohortSize IS COMPARED AGAINST THE REFETCH COUNT (R8/TR-5) ────────────────────────────
 * scoreLeg2's denominator is rankedTop5.length. If the live refetch returns fewer rows than the
 * snapshot originally recorded (e.g. a snapshotted SD becomes unreadable/deleted), a caller that
 * silently used the refetched array as-is would score against a SMALLER denominator than the true
 * ranked-top-5 size — inflating the fraction. `integrityOk` names this explicitly so the caller
 * can refuse to score on mismatch rather than silently absorb it.
 */

/**
 * @param {object} supabase a supabase-js client
 * @param {number} nowMs the report's own clock — used ONLY to compute the elapsed-window
 *   boundary (nowMs - windowMs), never passed through to scoreLeg2
 * @param {number} windowMs the claim window (CLAIM_WINDOW_MS from leg2-uptake.js)
 * @returns {Promise<{rankedAt: string, rankedTop5: object[], cohortSize: number, integrityOk: boolean}|null>}
 *   null when no cohort has fully elapsed the window yet (nothing to measure).
 */
export async function readRankedTop5Cohort(supabase, nowMs, windowMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs)) {
    throw new Error('readRankedTop5Cohort(): nowMs and windowMs must be finite numbers');
  }
  const boundaryIso = new Date(nowMs - windowMs).toISOString();

  const { data: nearest, error: nearestErr } = await supabase
    .from('drive_rank_snapshots')
    .select('ranked_at')
    .lte('ranked_at', boundaryIso)
    .order('ranked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (nearestErr) throw new Error(`readRankedTop5Cohort(): cohort lookup failed: ${nearestErr.message}`);
  if (!nearest) return null; // no cohort has fully elapsed the window yet

  const { data: cohortRows, error: cohortErr } = await supabase
    .from('drive_rank_snapshots')
    .select('sd_id, sd_key, rank')
    .eq('ranked_at', nearest.ranked_at)
    .order('rank', { ascending: true });
  if (cohortErr) throw new Error(`readRankedTop5Cohort(): cohort rows fetch failed: ${cohortErr.message}`);
  if (!cohortRows || cohortRows.length === 0) return null;

  const cohortSize = cohortRows.length;
  const ids = cohortRows.map((r) => r.sd_id);

  // Explicit column selection (R4): never `select('*')`, which would let a schema change
  // silently widen what a citation grain can carry.
  const { data: liveRows, error: liveErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata')
    .in('id', ids);
  if (liveErr) throw new Error(`readRankedTop5Cohort(): live refetch failed: ${liveErr.message}`);

  // Preserve rank order (the refetch is not guaranteed to return rows in `ids` order).
  const byId = new Map((liveRows || []).map((r) => [r.id, r]));
  const rankedTop5 = cohortRows.map((r) => byId.get(r.sd_id)).filter(Boolean);

  return {
    rankedAt: nearest.ranked_at,
    rankedTop5,
    cohortSize,
    // R8/TR-5: a shortfall between the snapshot's original cohort size and what the live
    // refetch actually returned is a data-integrity condition, not a smaller-but-still-honest
    // ranked-top-5 — the caller must not silently score against the shrunk set.
    integrityOk: rankedTop5.length === cohortSize,
  };
}
