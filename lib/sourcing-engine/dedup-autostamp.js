/**
 * lib/sourcing-engine/dedup-autostamp.js
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-DEDUP-AUTOSTAMP-001 — sourcing-engine child 6/10.
 *
 * Automated dedup_match_sd_key stamping + the "infra-shipped != outcome-realized" re-emit rule.
 *
 * REUSE, don't reinvent: the shipped router (child 1, lib/sourcing-engine/router.js) already owns the
 * decision — routeCandidate() runs the keyword+semantic dedup match (findDedupMatch: exact-title OR
 * Jaccard>=threshold AND >=2 shared tokens) AND computes the re-emit flag
 * (re_emit = shippedInfraKeys.has(dup) && !outcomeRealizedKeys.has(dup)). Child 6 is the WIRING that
 * feeds the router its data inputs and PERSISTS the stamp:
 *   FR-1: build the `existing` SD set, call routeCandidate, stamp dedup_match_sd_key + lane.
 *   FR-2: derive `outcomeRealizedKeys` from the VDR gauge — an SD's capability is outcome-realized
 *         iff its VDR build status === 'built'. A matched-but-completed SD whose capability is still
 *         unbuilt/partial → re_emit (outcome_realized=false), NOT terminal-duplicate.
 *   FR-3: persist lane + dedup_match_sd_key on conversion_ledger (columns already shipped).
 *
 * HONESTY / SAFE DEFAULT (FR-2): when an SD's capability can't be resolved to a gauge status (no
 * delivers_capabilities link — true for ~all SDs today), it is treated as NOT realized, so re_emit
 * fires. That is the intent-aligned direction: never falsely CLOSE still-open realization work.
 *
 * The decision helpers here are PURE (no I/O) so they unit-test without a DB; the autostamp runner is
 * the thin I/O wrapper.
 */
import { routeCandidate, LANES } from './router.js';
import { isValidLane } from './lane.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — the dedup engine's WHOLE
// purpose is comparing new candidates against the FULL existing-SD corpus; a capped
// strategic_directives_v2 read (a growing table) would silently stop detecting duplicates
// past the PostgREST 1000-row cap, and a capped conversion_ledger candidates read would
// silently leave un-laned sourcing candidates un-stamped past the cap.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/**
 * PURE (FR-2): derive the set of sd_keys whose delivered capability is outcome-REALIZED, i.e. the
 * VDR gauge scores that capability 'built'. Used as routeCandidate's `outcomeRealizedKeys` so a
 * completed-but-not-yet-realized infra SD re-emits instead of terminally deduping.
 *
 * @param {Array<{sd_key:string, capability:string}>} sdCapabilityPairs - completed SDs and the VDR
 *   capability each delivers (from delivers_capabilities metadata; SDs without a link are simply
 *   absent → treated as not-realized by the caller, the safe direction).
 * @param {Array<{capability:string, status:string}>} gaugeComponents - computeBuildGauge().components
 * @returns {Set<string>} sd_keys whose capability status === 'built'
 */
export function deriveOutcomeRealizedKeys(sdCapabilityPairs, gaugeComponents) {
  const statusByCap = new Map(
    (Array.isArray(gaugeComponents) ? gaugeComponents : []).map((c) => [c.capability, c.status]),
  );
  const realized = new Set();
  for (const pair of Array.isArray(sdCapabilityPairs) ? sdCapabilityPairs : []) {
    if (!pair || !pair.sd_key || !pair.capability) continue;
    if (statusByCap.get(pair.capability) === 'built') realized.add(pair.sd_key);
  }
  return realized;
}

/**
 * PURE (FR-1/FR-2): stamp ONE candidate — call the shipped router and project only the dedup-relevant
 * persistence fields. A non-dedup lane yields dedup_match_sd_key=null / re_emit=false.
 *
 * RE-EMIT PERSISTENCE (FR-2, adversarial-review fix C2): the router computes `re_emit` for a matched-
 * but-not-yet-realized infra SD, but there is NO `re_emit`/`outcome_realized` column on
 * conversion_ledger to carry it. Storing such a candidate as lane='dedup' would make it
 * indistinguishable from a terminal duplicate — the FR-2 "still-open realization work" signal would be
 * silently lost. So we route a re-emit candidate to the EXISTING `outcome-gated` lane (a valid
 * FIXED_LANE, visibly OPEN) while preserving dedup_match_sd_key as the back-reference. Only a terminal
 * duplicate (shipped AND outcome-realized) stays on the `dedup` lane.
 *
 * @param {object} candidate - classified candidate (router's classifiedItem shape)
 * @param {object} ctx - routeCandidate context: { existing, shippedInfraKeys, outcomeRealizedKeys, jaccardThreshold }
 * @returns {{ lane:string, dedup_match_sd_key:(string|null), re_emit:boolean }}
 */
export function stampCandidate(candidate, ctx = {}) {
  const r = routeCandidate(candidate, ctx);
  const isDedup = r.lane === LANES.DEDUP;
  const reEmit = isDedup && r.re_emit === true;
  return {
    // A re-emit match is durable open work, not a terminal dup → outcome-gated lane (FR-2 / C2).
    lane: reEmit ? LANES.OUTCOME_GATED : r.lane,
    dedup_match_sd_key: isDedup ? r.dedup_match_sd_key ?? null : null,
    re_emit: reEmit,
  };
}

/**
 * PURE: probe whether conversion_ledger has the `lane` column yet (the lane migration is dormant /
 * may be unapplied). We select a single row's `lane` and inspect the error: PostgREST/PG report an
 * absent column with code 42703 / a "column ... does not exist" / "could not find the 'lane' column"
 * message. Returns true only when the column is confirmed present.
 *
 * @param {object} supabase - service-role client
 * @returns {Promise<boolean>}
 */
export async function ledgerLaneColumnExists(supabase) {
  const { error } = await supabase.from('conversion_ledger').select('lane').limit(1);
  if (!error) return true;
  const msg = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  if (error.code === '42703' || msg.includes('does not exist') || msg.includes('could not find') || msg.includes('column') && msg.includes('lane')) {
    return false;
  }
  // Some other error (auth, network) — don't silently assume the column is missing; surface it.
  throw new Error(`lane-column probe failed: ${error.message}`);
}

/**
 * I/O runner (FR-1/FR-2/FR-3): stamp un-deduped conversion_ledger candidates and persist lane +
 * dedup_match_sd_key. Fail-soft per row. Pass `dryRun` to compute without writing.
 *
 * DORMANT-SAFE (adversarial-review fix C1): the `conversion_ledger.lane` column ships via a TIER-2
 * migration that may not be applied yet. If the column is absent, every `.is('lane', null)` /
 * `.update({lane})` would throw. So we PROBE for the column first and, when absent, force dry-run
 * (compute the stamps, persist nothing) and flag `lane_column_missing` — the runner stays callable
 * and observable the moment the migration lands, with zero schema assumptions baked in.
 *
 * @param {object} opts
 * @param {object} opts.supabase - service-role client
 * @param {object} opts.io - { supabase, grep } for computeBuildGauge
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{ stamped:number, dedup:number, re_emit:number, dry_run:boolean, lane_column_missing:boolean, errors:Array }>}
 */
export async function autostampLedgerCandidates({ supabase, io, dryRun = false } = {}) {
  const { computeBuildGauge } = await import('../vision/vdr-registry.js');
  const result = { stamped: 0, dedup: 0, re_emit: 0, dry_run: dryRun, lane_column_missing: false, errors: [] };

  // C1: dormant-safe — if the lane column isn't applied yet, compute but never persist.
  const laneColumnPresent = await ledgerLaneColumnExists(supabase);
  if (!laneColumnPresent) {
    result.lane_column_missing = true;
    result.dry_run = true;
    dryRun = true;
    console.warn('   ⚠️  [dedup-autostamp] conversion_ledger.lane column is absent (migration dormant) — forcing dry-run; no writes.');
  }

  // Existing SDs to dedup against + completed set (shippedInfraKeys) + capability pairs (FR-2).
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, metadata')
      .order('sd_key', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (sdErr) {
    throw new Error(`load SDs failed: ${sdErr.message}`);
  }
  const existing = sds.map((s) => ({ sd_key: s.sd_key, title: s.title }));
  const shippedInfraKeys = new Set(sds.filter((s) => s.status === 'completed').map((s) => s.sd_key));
  const sdCapabilityPairs = [];
  for (const s of sds) {
    const caps = s.metadata && s.metadata.delivers_capabilities;
    for (const cap of Array.isArray(caps) ? caps : []) {
      if (typeof cap === 'string') sdCapabilityPairs.push({ sd_key: s.sd_key, capability: cap });
    }
  }

  // FR-2: VDR-derived realized set. Fail-soft — if the gauge can't be computed, treat NOTHING as
  // realized (safe direction: re_emit fires rather than falsely closing work).
  let outcomeRealizedKeys = new Set();
  try {
    const gauge = await computeBuildGauge({ io, visionSource: true });
    outcomeRealizedKeys = deriveOutcomeRealizedKeys(sdCapabilityPairs, gauge.components);
  } catch (err) {
    console.warn(`   ⚠️  [dedup-autostamp] VDR gauge unavailable — treating all as not-yet-realized (re-emit-safe): ${err?.message || err}`);
  }

  // Candidates needing a stamp. When the lane column exists, only un-laned rows; when it's dormant,
  // select without the lane column/filter (every row is un-laned by construction) for the dry-run.
  const buildCandidatesQuery = () => {
    let query = supabase.from('conversion_ledger');
    query = laneColumnPresent
      ? query.select('id, source_id, title, disposition, rung, lane, dedup_match_sd_key').is('lane', null)
      : query.select('id, source_id, title, disposition, rung, dedup_match_sd_key');
    return query.order('id', { ascending: true }); // unique tiebreaker: stable page boundaries (FR-6)
  };
  let candidates;
  try {
    candidates = await fetchAllPaginated(buildCandidatesQuery);
  } catch (cErr) {
    throw new Error(`load candidates failed: ${cErr.message}`);
  }

  for (const c of candidates) {
    try {
      const stamp = stampCandidate(
        { source_id: c.source_id, title: c.title, disposition: c.disposition, rung: c.rung },
        { existing, shippedInfraKeys, outcomeRealizedKeys },
      );
      // Count any dedup MATCH (terminal dups stay on the dedup lane; re-emits move to outcome-gated
      // but still carry dedup_match_sd_key), and re-emits as a subset.
      if (stamp.dedup_match_sd_key) result.dedup++;
      if (stamp.re_emit) result.re_emit++;
      // M2 defense: never persist a lane the CHECK constraint would reject.
      if (!isValidLane(stamp.lane)) {
        result.errors.push({ id: c.id, error: `invalid lane '${stamp.lane}' — skipped` });
        continue;
      }
      if (!dryRun) {
        const patch = { lane: stamp.lane };
        if (stamp.dedup_match_sd_key) patch.dedup_match_sd_key = stamp.dedup_match_sd_key;
        const { error: uErr } = await supabase.from('conversion_ledger').update(patch).eq('id', c.id);
        if (uErr) { result.errors.push({ id: c.id, error: uErr.message }); continue; }
      }
      result.stamped++;
    } catch (err) {
      result.errors.push({ id: c.id, error: err?.message || String(err) });
    }
  }
  return result;
}
