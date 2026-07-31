/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-5) — supply detectStuckWorker with the phase each
 * claim held at the START of the staleness window, so "alive but not moving" can be distinguished
 * from "alive and progressing".
 *
 * WHY THIS EXISTS. detectStuckWorker already implements the phase-unchanged guard
 * (detectors.cjs: `if (priorPhases && c.sd_key in priorPhases && priorPhases[c.sd_key] !== c.current_phase) continue;`)
 * and runDetectors already threads `priorPhases: opts.priorPhases` straight through. The predicate
 * was never broken — NO PRODUCTION CALLER EVER SUPPLIED THE DATA. Alpha-3 emitted ~40 heartbeats
 * over 19 hours with its phase frozen and every gauge read healthy, because liveness was
 * instrumented and progress was not. This module is the missing data feed, not a new detector.
 *
 * WHY sd_phase_handoffs AND NOT A SNAPSHOT TABLE. A naive implementation stores "phase at previous
 * tick" somewhere and diffs it, which needs new storage — and new storage is chairman-gated DDL.
 * But the transitions are ALREADY durably recorded: a phase change writes an sd_phase_handoffs row.
 * So the phase at the start of the window is derivable from history rather than remembered, which
 * also makes it correct across sweep restarts, host changes and missed ticks — a snapshot table
 * would silently lose its memory on any of those and report a moving claim as frozen.
 *
 * INERT ON ARRIVAL. runAndLogDetectors returns [] unless COORD_DETECTORS_V2 is truthy, and that flag
 * is absent from .env. Landing this now is a pure data-supply change; the ungate is a SEPARATE
 * deliberate step owned by the coordinator after the FR-3 observation window closes. Measured
 * reason for the split: runDetectors fires THIRTEEN detectors including two critical-severity ones,
 * and the flag is all-or-nothing by construction, so there is no way to activate this predicate
 * alone today.
 *
 * CommonJS to match lib/coordinator/*.cjs.
 */

'use strict';

/**
 * PURE/TOTAL. Given the claims bundle and the handoff rows written inside the window, return the
 * phase each claim held at the START of the window.
 *
 * SEMANTICS, stated because the detector's use of the map is easy to invert:
 *   - a claim WITH a transition in the window   -> map to the EARLIEST from_phase seen, which
 *     differs from current_phase, so the detector SKIPS it. Progress happened; not stuck.
 *   - a claim with NO transition in the window  -> map to its CURRENT phase, i.e. unchanged, so the
 *     detector proceeds to its staleness check. This is the alive-but-not-moving case.
 *
 * A claim is deliberately never OMITTED from the map: `sd_key in priorPhases` is what gates the
 * guard, so omitting a claim would silently disable the phase check for it and fall back to
 * pure staleness — the pre-existing behaviour this FR exists to improve on.
 *
 * @param {Array<object>} claims  bundle.claims — each { sd_key, sd_id?, current_phase }
 * @param {Array<object>} handoffs rows from sd_phase_handoffs created inside the window
 * @returns {Record<string,string|null>} sd_key -> phase at window start
 */
function buildPriorPhases(claims, handoffs) {
  const list = Array.isArray(claims) ? claims : [];
  const rows = Array.isArray(handoffs) ? handoffs : [];

  // Earliest transition per sd_id — its from_phase is the phase held at window start.
  const earliestBySdId = new Map();
  for (const h of rows) {
    if (!h || !h.sd_id) continue;
    const prev = earliestBySdId.get(h.sd_id);
    if (!prev || String(h.created_at) < String(prev.created_at)) earliestBySdId.set(h.sd_id, h);
  }

  const out = {};
  for (const c of list) {
    if (!c || !c.sd_key) continue;
    const moved = c.sd_id ? earliestBySdId.get(c.sd_id) : undefined;
    // from_phase may legitimately be null on a first transition; null !== current_phase still reads
    // as "moved", which is the correct verdict.
    out[c.sd_key] = moved ? (moved.from_phase ?? null) : (c.current_phase ?? null);
  }
  return out;
}

/**
 * IO seam. Fetch the window's handoffs and build the map. FAIL-OPEN: on any error return null so
 * the caller passes no priorPhases and the detector behaves exactly as it does today. A failure to
 * read history must never manufacture a stuck-worker alarm.
 *
 * @returns {Promise<Record<string,string|null>|null>}
 */
async function fetchPriorPhases(supabase, claims, { windowMs = 60 * 60 * 1000, nowMs = Date.now() } = {}) {
  try {
    if (!supabase || !Array.isArray(claims) || claims.length === 0) return null;
    const since = new Date(nowMs - windowMs).toISOString();
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .select('sd_id, from_phase, created_at')
      .gte('created_at', since);
    if (error) return null;
    return buildPriorPhases(claims, data || []);
  } catch {
    return null;
  }
}

module.exports = { buildPriorPhases, fetchPriorPhases };
