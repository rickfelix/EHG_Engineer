/**
 * Coordination Observability — pure anomaly-detection primitives (epic #4).
 *
 * SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001
 *
 * Each detector is a PURE function over INJECTED data (the sweep performs the
 * live DB I/O; fleet-dashboard printQA maps its existing aggregates into the
 * same predicate inputs — single source, not a third parallel detection path).
 * Every detector returns the same shape:
 *   { matched: boolean, reason: string, evidence: object }
 *
 * CommonJS (.cjs) to match the lib/coordinator convention (resolve.cjs,
 * signal-router.cjs) and be require()-able by scripts/stale-session-sweep.cjs.
 * Mirrors the doctrine of lib/worktree-reaper/detectors.js. Strictly READ-ONLY:
 * nothing here writes any claim state — no collision with the atomic work-leasing
 * machinery (epic #2). Events are persisted by lib/coordinator/coordination-events.cjs.
 *
 * Schema notes from the prospective testing-agent (893f6eeb):
 *  - SPLIT_BRAIN counts sessions whose metadata.is_coordinator==='true' AND fresh
 *    (reuse resolve.cjs queryDbForCoordinator upstream). Distinct from
 *    detectIdentityCollisions (multiple PIDs sharing one session_id).
 *  - STUCK_WORKER must NOT use claude_sessions.last_progress_at (NULL ~99.98%);
 *    it keys off heartbeat/SD-updated staleness + current_phase. Distinct from
 *    status-stuck STUCK_100/STUCK_APPROVAL.
 *  - REPLY_STARVATION: no signal_type column; a worker ask is sender_type==='worker';
 *    "answered" = acknowledged_at set OR payload.routed_to_feedback_id set.
 *
 * @module lib/coordinator/detectors
 */

'use strict';

/** Default freshness window (ms) for "is this session a live coordinator". */
const DEFAULT_COORDINATOR_FRESH_MS = 10 * 60 * 1000;
/** Default REPLY_STARVATION threshold (ms) — unanswered worker signal age. */
const DEFAULT_REPLY_STARVATION_MS = 30 * 60 * 1000;
/** Default STUCK_WORKER threshold (ms) — no progress on a claimed SD. */
const DEFAULT_STUCK_WORKER_MS = 60 * 60 * 1000;

function toMs(ts) {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  // Treat naive (no-TZ) timestamps as UTC (PostgREST returns naive strings).
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(String(ts));
  const d = new Date(hasTZ ? ts : ts + 'Z');
  const n = d.getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * SPLIT_BRAIN — more than one live coordinator.
 * @param {{ coordinatorCount: number, coordinators?: Array<object> }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectSplitBrain(data) {
  const count = Number((data && data.coordinatorCount) ?? 0);
  if (count > 1) {
    return {
      matched: true,
      reason: 'multiple_live_coordinators',
      evidence: {
        coordinator_count: count,
        sessions: ((data && data.coordinators) || []).map((c) => c.session_id).filter(Boolean).slice(0, 10),
      },
    };
  }
  return { matched: false, reason: 'single_or_no_coordinator', evidence: { coordinator_count: count } };
}

/**
 * THUNDERING_HERD — more idle workers than there is distinct unclaimed work.
 * @param {{ idleWorkers: number, unclaimedItems: number }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectThunderingHerd(data) {
  const idle = Number((data && data.idleWorkers) ?? 0);
  const unclaimed = Number((data && data.unclaimedItems) ?? 0);
  if (idle > 0 && idle > unclaimed) {
    return {
      matched: true,
      reason: 'idle_workers_exceed_unclaimed_items',
      evidence: { idle_workers: idle, unclaimed_items: unclaimed, surplus: idle - unclaimed },
    };
  }
  return { matched: false, reason: 'workers_within_supply', evidence: { idle_workers: idle, unclaimed_items: unclaimed } };
}

/**
 * REPLY_STARVATION — a worker signal left unanswered beyond threshold T.
 * "answered" = acknowledged_at set OR payload.routed_to_feedback_id set.
 * @param {{ signals: Array<object>, now?: number, thresholdMs?: number }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectReplyStarvation(data) {
  const now = (data && data.now) ?? Date.now();
  const thresholdMs = (data && data.thresholdMs) ?? DEFAULT_REPLY_STARVATION_MS;
  const starved = [];
  for (const sig of ((data && data.signals) || [])) {
    if ((sig && sig.sender_type) !== 'worker') continue;
    const answered = !!sig.acknowledged_at || !!(sig.payload && sig.payload.routed_to_feedback_id);
    if (answered) continue;
    if (sig.read_at) continue; // read counts as a soft answer here (no separate reply table)
    const ageMs = now - toMs(sig.created_at);
    if (ageMs > thresholdMs) {
      starved.push({ id: sig.id, sender: sig.sender_session, age_ms: ageMs });
    }
  }
  if (starved.length > 0) {
    return {
      matched: true,
      reason: 'worker_signals_unanswered_past_threshold',
      evidence: { starved_count: starved.length, threshold_ms: thresholdMs, samples: starved.slice(0, 10) },
    };
  }
  return { matched: false, reason: 'no_starved_signals', evidence: { threshold_ms: thresholdMs } };
}

/**
 * STUCK_WORKER — a claimed SD shows no progress for > threshold.
 * Progress proxy: max(session heartbeat, SD updated_at) staleness. If a prior
 * snapshot is supplied, ALSO require current_phase unchanged since then.
 * Avoids last_progress_at (NULL ~99.98% — testing-agent HB-1).
 * @param {{ claims: Array<object>, now?: number, thresholdMs?: number, priorPhases?: object }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectStuckWorker(data) {
  const now = (data && data.now) ?? Date.now();
  const thresholdMs = (data && data.thresholdMs) ?? DEFAULT_STUCK_WORKER_MS;
  const priorPhases = (data && data.priorPhases) || null;
  const stuck = [];
  for (const c of ((data && data.claims) || [])) {
    if (!c || !c.sd_key) continue;
    const progressMs = Math.max(toMs(c.heartbeat_at), toMs(c.sd_updated_at));
    if (progressMs === 0) continue; // no usable timing signal → emit nothing (null-tolerant)
    const ageMs = now - progressMs;
    if (ageMs <= thresholdMs) continue;
    if (priorPhases && c.sd_key in priorPhases && priorPhases[c.sd_key] !== c.current_phase) continue;
    stuck.push({ sd_key: c.sd_key, session_id: c.session_id, phase: c.current_phase || null, age_ms: ageMs });
  }
  if (stuck.length > 0) {
    return {
      matched: true,
      reason: 'claimed_sd_no_progress_past_threshold',
      evidence: { stuck_count: stuck.length, threshold_ms: thresholdMs, samples: stuck.slice(0, 10) },
    };
  }
  return { matched: false, reason: 'all_claims_progressing', evidence: { threshold_ms: thresholdMs } };
}

/**
 * CLAIM_HALF_WRITE — bilateral mismatch between a session's sd_key and the
 * SD-row's claiming_session_id. OBSERVE + LOG only (the sweep already remediates
 * earlier in main(); by the post-sweep hook only RESIDUAL mismatches remain —
 * testing-agent C-2). Read-only; never repairs.
 * @param {{ sessions: Array<object>, sdClaims: Array<object> }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectClaimHalfWrite(data) {
  const sessions = (data && data.sessions) || [];
  const sdClaims = (data && data.sdClaims) || [];
  const sdByKey = new Map(sdClaims.map((s) => [s.sd_key, s]));
  const sessionBySd = new Map(sessions.filter((s) => s.sd_key).map((s) => [s.sd_key, s]));
  const mismatches = [];

  for (const sess of sessions) {
    if (!sess || !sess.sd_key) continue;
    const sd = sdByKey.get(sess.sd_key);
    const claimingId = sd ? sd.claiming_session_id : null;
    if (claimingId !== sess.session_id) {
      mismatches.push({ kind: 'session_without_sd_claim', session_id: sess.session_id, sd_key: sess.sd_key, sd_claiming_session_id: claimingId ?? null });
    }
  }
  for (const sd of sdClaims) {
    if (!sd || !sd.claiming_session_id) continue;
    const sess = sessionBySd.get(sd.sd_key);
    if (!sess || sess.session_id !== sd.claiming_session_id) {
      mismatches.push({ kind: 'sd_claim_without_session', sd_key: sd.sd_key, claiming_session_id: sd.claiming_session_id });
    }
  }

  if (mismatches.length > 0) {
    return {
      matched: true,
      reason: 'residual_claim_half_write',
      evidence: { mismatch_count: mismatches.length, samples: mismatches.slice(0, 10) },
    };
  }
  return { matched: false, reason: 'claims_consistent', evidence: {} };
}

/**
 * Run all five detectors over an injected data bundle. PURE — no I/O.
 * @param {object} data
 * @param {object} [opts] - { now, replyStarvationMs, stuckWorkerMs, priorPhases }
 * @returns {Array<{ event_type: string, severity: string, reason: string, evidence: object }>}
 */
function runDetectors(data, opts) {
  opts = opts || {};
  const now = opts.now ?? Date.now();
  const results = [
    { event_type: 'SPLIT_BRAIN', severity: 'critical', res: detectSplitBrain(data) },
    { event_type: 'THUNDERING_HERD', severity: 'warning', res: detectThunderingHerd(data) },
    { event_type: 'REPLY_STARVATION', severity: 'warning', res: detectReplyStarvation({ signals: data && data.signals, now, thresholdMs: opts.replyStarvationMs }) },
    { event_type: 'STUCK_WORKER', severity: 'warning', res: detectStuckWorker({ claims: data && data.claims, now, thresholdMs: opts.stuckWorkerMs, priorPhases: opts.priorPhases }) },
    { event_type: 'CLAIM_HALF_WRITE', severity: 'info', res: detectClaimHalfWrite(data) },
  ];
  return results
    .filter((r) => r.res.matched)
    .map((r) => ({ event_type: r.event_type, severity: r.severity, reason: r.res.reason, evidence: r.res.evidence }));
}

module.exports = {
  DEFAULT_COORDINATOR_FRESH_MS,
  DEFAULT_REPLY_STARVATION_MS,
  DEFAULT_STUCK_WORKER_MS,
  detectSplitBrain,
  detectThunderingHerd,
  detectReplyStarvation,
  detectStuckWorker,
  detectClaimHalfWrite,
  runDetectors,
};
