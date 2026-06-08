/**
 * lib/sd-baseline/build-item.js
 *
 * Pure + dependency-injected helpers for the `sd-baseline add-item` subcommand
 * (SD-FDBK-INFRA-FLOW-IMPEDIMENT-COORDINATOR-001).
 *
 * Goal: let a coordinator APPEND a single sourced SD to the ACTIVE execution
 * baseline's sd_baseline_items WITHOUT a full LEAD-approval-gated rebaseline, so
 * the SD becomes a first-class candidate in v_sd_next_candidates (readiness 3)
 * and is self-claimable by a worker /checkin (step 6).
 *
 * This module has NO top-level side effects (no DB client, no CLI run), so unit
 * tests import it network-free. scripts/sd-baseline.js auto-runs its CLI on
 * import, so its orchestration lives here as the injectable `addItemCore`.
 *
 * LOAD-BEARING: sd_baseline_items.sd_id MUST be the sd_key STRING. The live view
 * v_sd_next_candidates JOINs `bi.sd_id = sd.sd_key` (def 20260606012331 line 63)
 * and there is NO foreign key to catch a UUID — writing sd.id is a silent view
 * drop (the exact defect of the live fn_sync_sd_to_baseline trigger).
 */

// sd_baseline_items.track CHECK whitelist. NULL is also accepted by the CHECK
// (createBaseline inserts null for unmapped tracks), so deriveTrack returns null
// for unknown metadata rather than guessing.
export const TRACK_WHITELIST = ['A', 'B', 'C', 'STANDALONE', 'DEFERRED'];

const TERMINAL_STATUSES = ['completed', 'cancelled', 'deferred'];

/**
 * Map metadata.execution_track (+ optional explicit --track flag) to a track code.
 * Mirrors scripts/sd-baseline.js createBaseline (unknown -> null, NOT STANDALONE).
 * An explicit --track flag wins but must be CHECK-safe or it throws (user error).
 */
export function deriveTrack(metadataExecutionTrack, trackFlag) {
  if (trackFlag !== undefined && trackFlag !== null && trackFlag !== '') {
    const t = String(trackFlag).toUpperCase();
    if (!TRACK_WHITELIST.includes(t)) {
      throw new Error(`Invalid --track "${trackFlag}": must be one of ${TRACK_WHITELIST.join(', ')}`);
    }
    return t;
  }
  const track = metadataExecutionTrack;
  return track === 'Infrastructure' || track === 'Safety' ? 'A'
    : track === 'Feature' ? 'B'
    : track === 'Quality' ? 'C'
    : track === 'STANDALONE' ? 'STANDALONE'
    : null;
}

export function trackName(trackKey) {
  return trackKey === 'A' ? 'Infrastructure/Safety'
    : trackKey === 'B' ? 'Feature/Stages'
    : trackKey === 'C' ? 'Quality'
    : trackKey === 'STANDALONE' ? 'Standalone'
    : 'Unassigned';
}

/**
 * Next sequence_rank: an explicit requestedRank (validated positive int) wins;
 * otherwise MAX(existingRanks)+1, or 1 when the baseline has no items.
 */
export function computeNextRank(existingRanks, requestedRank) {
  if (requestedRank !== undefined && requestedRank !== null && requestedRank !== '') {
    const n = Number(requestedRank);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`Invalid --rank "${requestedRank}": must be a positive integer`);
    }
    return n;
  }
  const ranks = (existingRanks || []).map(Number).filter((n) => Number.isFinite(n));
  return ranks.length === 0 ? 1 : Math.max(...ranks) + 1;
}

/**
 * Build one sd_baseline_items row. Pure. sd_id is ALWAYS sd.sd_key (never sd.id).
 */
export function buildBaselineItemRow({ sd, baselineId, sequenceRank, trackFlag, healthScore }) {
  if (!sd || !sd.sd_key) {
    throw new Error('buildBaselineItemRow: sd.sd_key is required (the v_sd_next_candidates JOIN key)');
  }
  const track = deriveTrack(sd.metadata && sd.metadata.execution_track, trackFlag);
  const score = typeof healthScore === 'number' ? healthScore : 1.0;
  return {
    baseline_id: baselineId,
    sd_id: sd.sd_key, // MUST be sd_key — a UUID here is a silent view drop (no FK)
    sequence_rank: sequenceRank,
    track,
    track_name: trackName(track),
    dependencies_snapshot: sd.dependencies == null ? null : sd.dependencies,
    dependency_health_score: score,
    is_ready: score >= 1.0,
    notes: `Coordinator-added (incremental, no rebaseline): ${sd.title || sd.sd_key}`,
  };
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Dependency-injected orchestration for `add-item`. Returns a structured result
 * (so tests assert without parsing logs) AND prints via the injected `log`.
 *
 * @param {object}   deps
 * @param {object}   deps.supabase   - Supabase-style client (real or fake).
 * @param {string}   deps.sdKey      - the sd_key to add.
 * @param {object}   [deps.opts]     - { track, rank }.
 * @param {function} deps.calcHealth - async (dependencies) => number (0..1).
 * @param {function} [deps.log]      - console.log-style sink.
 * @returns {Promise<{action:'added'|'noop'|'guidance'|'error', message:string, row?:object}>}
 */
export async function addItemCore({ supabase, sdKey, opts = {}, calcHealth, log = console.log }) {
  if (!sdKey) {
    const message = 'Usage: sd:baseline add-item <sd_key> [--track A|B|C|STANDALONE] [--rank N]';
    log(message);
    return { action: 'error', message };
  }

  // 1) Active baseline must exist (do NOT silently auto-create — that is ensure-active-baseline's job on /checkin).
  const { data: baseline } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name')
    .eq('is_active', true)
    .maybeSingle();
  if (!baseline) {
    const message = "No active baseline. Run 'npm run sd:baseline create' (or it auto-creates on the next worker /checkin), then retry.";
    log(message);
    return { action: 'guidance', message };
  }

  // 2) Fetch the SD; refuse terminal status.
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, priority, dependencies, metadata')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (sdErr || !sd) {
    const message = `SD not found: ${sdKey}`;
    log(message);
    return { action: 'error', message };
  }
  if (isTerminalStatus(sd.status)) {
    const message = `Refusing: ${sdKey} is ${sd.status} (terminal). add-item is for active/draft work.`;
    log(message);
    return { action: 'error', message };
  }

  // 3) Idempotency pre-check on UNIQUE(baseline_id, sd_id).
  const { data: existing } = await supabase
    .from('sd_baseline_items')
    .select('id')
    .eq('baseline_id', baseline.id)
    .eq('sd_id', sd.sd_key)
    .maybeSingle();
  if (existing) {
    const message = `${sdKey} is already in the active baseline (no-op).`;
    log(message);
    return { action: 'noop', message };
  }

  // 4) Build + insert with a single bounded retry on sequence_rank collision
  //    (re-reading MAX+1). A 23505 on sd_id is treated as an idempotent no-op.
  const healthScore = await calcHealth(sd.dependencies);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: rankRows } = await supabase
      .from('sd_baseline_items')
      .select('sequence_rank')
      .eq('baseline_id', baseline.id);
    const existingRanks = (rankRows || []).map((r) => r.sequence_rank);

    let row;
    try {
      const sequenceRank = computeNextRank(existingRanks, attempt === 0 ? opts.rank : undefined);
      row = buildBaselineItemRow({ sd, baselineId: baseline.id, sequenceRank, trackFlag: opts.track, healthScore });
    } catch (e) {
      log(e.message);
      return { action: 'error', message: e.message };
    }

    const { error: insErr } = await supabase.from('sd_baseline_items').insert(row);
    if (!insErr) {
      // best-effort actuals (matches createBaseline; swallow errors)
      try {
        await supabase.from('sd_execution_actuals').insert({ sd_id: sd.sd_key, baseline_id: baseline.id, status: 'not_started' });
      } catch { /* non-fatal */ }
      const message = `Added ${sdKey} to active baseline '${baseline.baseline_name}' (rank ${row.sequence_rank}, track ${row.track || 'Unassigned'}). It will appear in v_sd_next_candidates (readiness_priority 3 if deps satisfied + draft/active) and be self-claimable via worker /checkin.`;
      log(message);
      return { action: 'added', message, row };
    }

    if (insErr.code === '23505') {
      const blob = `${insErr.message || ''} ${insErr.details || ''}`;
      if (blob.includes('sequence_rank')) {
        continue; // rank race — retry with a freshly re-read MAX+1
      }
      // sd_id duplicate (concurrent add) — idempotent no-op
      const message = `${sdKey} already in the active baseline (concurrent add, no-op).`;
      log(message);
      return { action: 'noop', message };
    }

    const message = `Error adding item: ${insErr.message}`;
    log(message);
    return { action: 'error', message };
  }

  const message = 'sequence_rank collision after retry — another session is adding concurrently; re-run add-item.';
  log(message);
  return { action: 'error', message };
}
