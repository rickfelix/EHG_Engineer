/**
 * Adam-direct registry — SD-LEO-INFRA-SOURCING-ENGINE-ADAM-DIRECT-REGISTRY-001.
 *
 * Closes the gap where Adam-direct (chairman-directed) candidates and historically Adam-sourced SDs
 * bypass the roadmap entirely (no roadmap_wave_items row), so the sourcing-engine's register-first +
 * router + lane coherence never sees them.
 *
 * REUSE, do not re-derive (FR-3 — duplicate-SSOT is the recurring trap):
 *   - routeCandidate  (lib/sourcing-engine/router.js)  — the SHIPPED pure router → lane.
 *   - isValidLane     (lib/sourcing-engine/lane.js)     — the SHIPPED CHECK-constraint mirror.
 * This module adds only: a roadmap_wave_items.lane column probe (mirror of dedup-autostamp's
 * ledgerLaneColumnExists, but for roadmap_wave_items), a target-wave resolver, ghost enumeration,
 * and a dormant-safe register/backfill.
 *
 * DORMANT-SAFE BY CONSTRUCTION (two dormant deps): (1) roadmap_wave_items.lane is a DORMANT column
 * (LEDGER-LANE-COLUMN-001 migration not applied) and (2) the source_type CHECK does not yet admit
 * 'adam_direct' (this SD's own DORMANT migration). When either is absent the backfill runs DRY-RUN —
 * it computes exactly what it WOULD register but writes nothing — so this ships INERT and never
 * mutates the chairman-visible roadmap until an operator applies the migrations and passes --apply.
 *
 * @module lib/sourcing-engine/adam-direct-registry
 */

import { routeCandidate } from './router.js';
import { isValidLane } from './lane.js';
// FR-1 soft-warn: REUSE the shipped register-first nudge (do NOT re-derive the warn logic).
import { shouldWarnRegisterFirst } from './register-first.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — findAdamGhostSds enumerates
// ALL metadata.sourced_by='adam' SDs (strategic_directives_v2 is a growing table, and Adam
// is a high-volume sourcing channel) plus the matching roadmap_wave_items promoted-key set;
// a capped read on either side would silently miss real "ghost" SDs sitting past the
// PostgREST 1000-row cap, leaving them permanently un-backfilled into the roadmap.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/** The source_type this SD registers Adam-direct rows under (gated by the dormant CHECK extension). */
export const ADAM_DIRECT_SOURCE_TYPE = 'adam_direct';

/** The canonical roadmap Adam-direct items register into. */
export const ADAM_ROADMAP_TITLE = 'LEO Roadmap';

/**
 * Probe whether roadmap_wave_items.lane exists (the DORMANT lane column). Mirrors the
 * ledgerLaneColumnExists 42703/PGRST204 detection but for roadmap_wave_items. Throws on unrelated
 * (auth/network) errors so a real outage is never mistaken for "column missing".
 * @param {object} supabase
 * @returns {Promise<boolean>}
 */
export async function roadmapLaneColumnExists(supabase) {
  const { error } = await supabase.from('roadmap_wave_items').select('lane').limit(1);
  if (!error) return true;
  const code = error.code || '';
  const msg = String(error.message || '').toLowerCase();
  if (code === '42703' || code === 'PGRST204' || (msg.includes('column') && msg.includes('lane')) || msg.includes('does not exist') || msg.includes('could not find')) {
    return false;
  }
  throw new Error(`roadmapLaneColumnExists: unexpected error probing roadmap_wave_items.lane: ${error.message}`);
}

/**
 * Resolve the target wave id for Adam-direct registration: the highest sequence_rank wave of the
 * canonical "LEO Roadmap". Returns null fail-soft when no roadmap/wave can be resolved (the caller
 * then forces dry-run — never inserts an orphan row without a wave).
 * @param {object} supabase
 * @returns {Promise<string|null>}
 */
export async function resolveTargetWaveId(supabase) {
  try {
    const { data: roadmaps } = await supabase
      .from('strategic_roadmaps').select('id').eq('title', ADAM_ROADMAP_TITLE).eq('status', 'active').limit(1);
    const roadmapId = roadmaps && roadmaps[0] && roadmaps[0].id;
    if (!roadmapId) return null;
    const { data: waves } = await supabase
      .from('roadmap_waves').select('id,sequence_rank').eq('roadmap_id', roadmapId)
      .order('sequence_rank', { ascending: false }).order('created_at', { ascending: false }).limit(1);
    return (waves && waves[0] && waves[0].id) || null;
  } catch (_) {
    return null; // fail-soft: unresolved wave => dry-run
  }
}

/**
 * Enumerate Adam-sourced SDs (metadata.sourced_by='adam' — the canonical attribution, NOT a
 * top-level column or sd_key prefix) that have NO corresponding roadmap_wave_items row
 * (promoted_to_sd_key match). These are the "ghosts" FR-2 backfills.
 * @param {object} supabase
 * @returns {Promise<Array<{id:string, sd_key:string, title:string, status:string, disposition?:string}>>}
 */
export async function findAdamGhostSds(supabase) {
  let adam;
  try {
    adam = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id,sd_key,title,status,metadata')
      .eq('metadata->>sourced_by', 'adam')
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (error) {
    throw new Error(`findAdamGhostSds: SD query failed: ${error.message}`);
  }
  const keys = adam.map((r) => r.sd_key).filter(Boolean);
  if (keys.length === 0) return [];
  // Which of those keys already have a roadmap_wave_items row? Pre-FR-6 code destructured only
  // `data` here (never checked `error`), i.e. it was ALREADY fail-open: a read failure silently
  // yields registered=empty => every Adam SD looks like a ghost. Preserved verbatim (mirrors the
  // original error-direction policy) — downstream callers (backfillAdamGhosts) force dry-run via
  // the separate roadmapLaneColumnExists probe before any insert can occur on a real --apply run.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('roadmap_wave_items').select('promoted_to_sd_key').in('promoted_to_sd_key', keys)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (_guardErr) {
    rows = [];
  }
  const registered = new Set(rows.map((r) => r.promoted_to_sd_key).filter(Boolean));
  return (adam || [])
    .filter((sd) => sd.sd_key && !registered.has(sd.sd_key))
    .map((sd) => ({
      id: sd.id, sd_key: sd.sd_key, title: sd.title, status: sd.status,
      disposition: (sd.metadata && sd.metadata.disposition) || null,
    }));
}

/**
 * Compute the roadmap_wave_items insert payload for an Adam SD, routing it through the SHIPPED
 * router for its lane. PURE (no IO). Returns { payload, lane } — payload carries lane only when
 * lanePresent (dormant-safe: a missing column means the insert omits lane, which is nullable).
 * @param {{id,sd_key,title,disposition?}} sd
 * @param {{ waveId:string, lanePresent:boolean }} ctx
 */
export function buildAdamRoadmapItem(sd, { waveId, lanePresent }) {
  const routed = routeCandidate({ source_id: sd.sd_key, title: sd.title, disposition: sd.disposition || null });
  const lane = routed && routed.lane;
  const payload = {
    wave_id: waveId,
    source_type: ADAM_DIRECT_SOURCE_TYPE,
    source_id: sd.id, // the SD's own UUID (the originating "intake" for an Adam-direct candidate)
    title: sd.title || sd.sd_key,
    promoted_to_sd_key: sd.sd_key, // the uni-directional SD link the register-first guard reads
    metadata: { sourced_by: 'adam', registered_by: 'adam-direct-registry', dedup_match_sd_key: sd.sd_key },
  };
  if (lanePresent && isValidLane(lane)) payload.lane = lane;
  return { payload, lane };
}

/**
 * FR-1: register a SINGLE Adam-direct candidate as a roadmap_wave_items row, dormant-safe. Returns a
 * SOFT-WARN (never throws/blocks) when registration cannot proceed — mirroring the ratified
 * register-first=soft-warn decision via the SHIPPED shouldWarnRegisterFirst nudge. Idempotent: an SD
 * already represented by a roadmap row is a no-op.
 *
 * @param {object} supabase
 * @param {{id,sd_key,title,disposition?}} sd
 * @param {{ apply?:boolean }} [opts]
 * @returns {Promise<{registered:boolean, warn:boolean, reason:string|null, dry_run:boolean, lane:string|null}>}
 */
export async function registerAdamDirectCandidate(supabase, sd, opts = {}) {
  const out = { registered: false, warn: false, reason: null, dry_run: !opts.apply, lane: null };
  if (!sd || !sd.sd_key || !sd.id) {
    out.warn = shouldWarnRegisterFirst(sd || {}, false); out.reason = 'missing sd_key/id'; return out;
  }
  // Idempotency: already registered?
  const { data: existing } = await supabase
    .from('roadmap_wave_items').select('id').eq('promoted_to_sd_key', sd.sd_key).limit(1);
  if (existing && existing.length) { out.reason = 'already registered'; return out; }

  const waveId = await resolveTargetWaveId(supabase);
  if (!waveId) { out.warn = shouldWarnRegisterFirst(sd, false); out.reason = 'no target wave (soft-warn)'; out.dry_run = true; return out; }
  const lanePresent = await roadmapLaneColumnExists(supabase);
  if (!lanePresent) out.dry_run = true;

  const { payload, lane } = buildAdamRoadmapItem(sd, { waveId, lanePresent });
  out.lane = lane || null;
  if (out.dry_run) { out.reason = lanePresent ? 'dry-run (apply omitted)' : 'dry-run (lane column dormant)'; return out; }

  const { error } = await supabase.from('roadmap_wave_items').insert(payload);
  if (error) {
    // source_type CHECK not yet extended (dormant) => soft-warn, do not throw (register-first=soft-warn).
    out.warn = shouldWarnRegisterFirst(sd, false);
    out.reason = (error.code === '23514' || String(error.message || '').toLowerCase().includes('source_type'))
      ? 'source_type CHECK dormant (soft-warn)' : `insert failed: ${error.message}`;
    out.dry_run = true;
    return out;
  }
  out.registered = true;
  return out;
}

/**
 * Backfill roadmap_wave_items rows for Adam ghost SDs. DORMANT-SAFE + IDEMPOTENT + DRY-RUN-DEFAULT.
 *
 * Forces dry-run (writes nothing) whenever a precondition is unmet: no resolvable target wave, the
 * lane column is absent, OR a probe insert reveals the source_type CHECK does not yet admit
 * 'adam_direct' (PG 23514). On a real apply it inserts exactly one row per ghost (the
 * promoted_to_sd_key UNIQUE-by-construction enumeration makes a re-run a no-op — already-registered
 * SDs are excluded by findAdamGhostSds).
 *
 * @param {object} supabase
 * @param {{ apply?:boolean, cap?:number }} [opts] - apply defaults false (dry-run); cap bounds a run
 * @returns {Promise<{registered:number, candidates:number, dry_run:boolean, lane_column_missing:boolean, source_type_unsupported:boolean, wave_id:string|null, errors:Array}>}
 */
export async function backfillAdamGhosts(supabase, opts = {}) {
  const cap = Number.isInteger(opts.cap) && opts.cap > 0 ? opts.cap : 100;
  const result = { registered: 0, candidates: 0, dry_run: !opts.apply, lane_column_missing: false, source_type_unsupported: false, wave_id: null, errors: [] };

  const ghosts = (await findAdamGhostSds(supabase)).slice(0, cap);
  result.candidates = ghosts.length;
  if (ghosts.length === 0) return result;

  const waveId = await resolveTargetWaveId(supabase);
  result.wave_id = waveId;
  if (!waveId) { result.dry_run = true; return result; } // no wave => cannot insert; dry-run only

  const lanePresent = await roadmapLaneColumnExists(supabase);
  if (!lanePresent) { result.lane_column_missing = true; result.dry_run = true; }

  let dryRun = result.dry_run;
  for (const sd of ghosts) {
    let payload;
    try {
      ({ payload } = buildAdamRoadmapItem(sd, { waveId, lanePresent }));
    } catch (e) { result.errors.push({ sd_key: sd.sd_key, error: e.message }); continue; }

    if (dryRun) { result.registered++; continue; } // count what WOULD be registered

    const { error } = await supabase.from('roadmap_wave_items').insert(payload);
    if (error) {
      // source_type CHECK not yet extended (dormant) => 23514: downgrade the WHOLE run to dry-run.
      if (error.code === '23514' || (String(error.message || '').toLowerCase().includes('source_type'))) {
        result.source_type_unsupported = true; result.dry_run = true; dryRun = true; result.registered++;
        continue;
      }
      result.errors.push({ sd_key: sd.sd_key, error: error.message });
      continue;
    }
    result.registered++;
  }
  return result;
}
