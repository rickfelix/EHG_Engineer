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

// SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: "merged != live" for already-running sessions.
// A long-lived coordinator/worker keeps its pre-merge code until it restarts, so a fix that
// merged hours ago is invisible to that running process. Flag (advisory) a session whose start
// time (claude_sessions.created_at, immutable) predates the latest merge that touched its role's
// code paths by more than the grace window, and recommend a restart.
const DEFAULT_DEPLOY_GAP_MS = 4 * 60 * 60 * 1000; // 4h grace — suppress churn from a merge landing just after a fresh boot
const ROLE_CODE_PATHS = Object.freeze({
  coordinator: ['lib/coordinator/', 'scripts/coordinator-audit.mjs', 'scripts/stale-session-sweep.cjs', 'scripts/hooks/coordination-inbox.cjs'],
  worker: ['lib/fleet/', 'scripts/worker-checkin.cjs', 'scripts/start-stage-worker.js'],
});

/** Pure: a session row's role from its metadata (coordinator vs worker). */
function sessionRole(s) {
  return (s && s.metadata && String(s.metadata.is_coordinator) === 'true') ? 'coordinator' : 'worker';
}

/**
 * DEPLOY_GAP — running sessions executing code older than the latest deploy to their paths.
 * PURE — no I/O. The latest-merge timestamps are INJECTED (mergesByRole), computed once per
 * sweep by the gatherer. Fail-open: a session is flagged ONLY when both anchors are known and
 * the gap exceeds the threshold; any unknown (missing created_at / merge time 0) is SKIPPED.
 * @param {{ sessions?: Array, mergesByRole?: {coordinator?:number, worker?:number} }} data
 * @param {{ now?: number, maxGapMs?: number }} [opts]
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectDeployGap(data, opts) {
  opts = opts || {};
  const maxGapMs = opts.maxGapMs ?? DEFAULT_DEPLOY_GAP_MS;
  const sessions = (data && data.sessions) || [];
  const merges = (data && data.mergesByRole) || {};
  const gapped = [];
  for (const s of sessions) {
    const startMs = toMs(s && s.created_at);
    if (!startMs) continue;                      // unknown start → skip (fail-open)
    const role = sessionRole(s);
    const latestMergeMs = Number(merges[role]) || 0;
    if (!latestMergeMs) continue;                // unknown latest merge → skip (fail-open)
    if (latestMergeMs <= startMs) continue;      // no merge after this session started
    const gapMs = latestMergeMs - startMs;
    if (gapMs < maxGapMs) continue;              // within the grace window
    if (gapped.length < 10) {
      gapped.push({ session_id: s.session_id, role, created_at: s.created_at, latest_merge_ms: latestMergeMs, gap_ms: gapMs });
    }
  }
  if (gapped.length === 0) {
    return { matched: false, reason: 'all_sessions_on_current_code', evidence: { threshold_ms: maxGapMs } };
  }
  const maxGap = gapped.reduce((m, g) => Math.max(m, g.gap_ms), 0);
  return {
    matched: true,
    reason: 'sessions_executing_old_code',
    evidence: { gapped_count: gapped.length, max_gap_ms: maxGap, threshold_ms: maxGapMs, samples: gapped, advisory: 'restart recommended (advisory; never auto-killed)' },
  };
}

// SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001: two read-only loop-liveness detectors so the
// supervisory layer gets programmatic warning before two silent-failure modes take it dark.
/** /loop sessions live in these loop_state values (active = looping, awaiting_tick = parked). */
const LOOP_ACTIVE_STATES = Object.freeze(['active', 'awaiting_tick']);
/** Default LOOP_EXPIRY_WARNING threshold (ms): 6 days — the verified hard-expiry is 7 days. */
const DEFAULT_LOOP_EXPIRY_WARN_MS = 6 * 24 * 60 * 60 * 1000;
/** Default STALLED_LOOP freshness window (ms): a heartbeat within 10 min "looks alive". */
const DEFAULT_STALLED_LOOP_FRESH_MS = 10 * 60 * 1000;

/**
 * LOOP_EXPIRY_WARNING — a /loop session (worker or coordinator cron) approaching the verified
 * 7-day hard-expiry, after which it fires once more and self-deletes with no warning. Flags
 * sessions whose (now - created_at) exceeds an env-tunable warn threshold (~6 days) AND whose
 * loop_state is active/awaiting_tick. Modeled on detectDeployGap (created_at is the immutable
 * session-start anchor). PURE — no I/O. Fail-open: a session with no usable created_at, or not
 * in a loop state, is SKIPPED (never a false flag).
 * @param {{ sessions?: Array, now?: number }} data
 * @param {{ warnMs?: number }} [opts]
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectLoopExpiry(data, opts) {
  opts = opts || {};
  const now = (data && data.now) ?? Date.now();
  const warnMs = opts.warnMs ?? DEFAULT_LOOP_EXPIRY_WARN_MS;
  const expiring = [];
  for (const s of ((data && data.sessions) || [])) {
    if (!s || !LOOP_ACTIVE_STATES.includes(s.loop_state)) continue; // not a live loop → skip
    const startMs = toMs(s.created_at);
    if (!startMs) continue;                  // unknown start → skip (fail-open)
    const ageMs = now - startMs;
    if (ageMs < warnMs) continue;            // not yet near the 7-day hard-expiry
    if (expiring.length < 10) {
      expiring.push({ session_id: s.session_id, loop_state: s.loop_state, created_at: s.created_at, age_ms: ageMs });
    }
  }
  if (expiring.length === 0) {
    return { matched: false, reason: 'all_loops_within_lifetime', evidence: { threshold_ms: warnMs } };
  }
  const maxAge = expiring.reduce((m, e) => Math.max(m, e.age_ms), 0);
  return {
    matched: true,
    reason: 'loop_sessions_approaching_hard_expiry',
    evidence: { expiring_count: expiring.length, max_age_ms: maxAge, threshold_ms: warnMs, samples: expiring, advisory: 're-launch the session before the 7-day hard-expiry self-deletes the loop' },
  };
}

/**
 * STALLED_LOOP — a session that LOOKS alive (loop_state 'active' + a fresh heartbeat) yet holds
 * NO claim while claimable work waits (unclaimedItems > 0). This is the heartbeat-masks-a-stall
 * mode documented at docs/protocol/fleet-coordinator-and-worker-behavior.md (a parked-at-a-decision
 * loop the staleness sweep never reaps). Complements detectStuckWorker (claim-bound; it skips
 * no-claim sessions). PURE — no I/O. Fail-open: skips sessions with no usable heartbeat; never
 * throws. Excludes legitimately-parked sessions: loop_state 'awaiting_tick' is not flagged, and a
 * future-dated expected_silence_until suppresses the flag (no false-positive on parked workers).
 * @param {{ sessions?: Array, unclaimedItems?: number, now?: number, freshMs?: number }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectStalledLoop(data) {
  const now = (data && data.now) ?? Date.now();
  const freshMs = (data && data.freshMs) ?? DEFAULT_STALLED_LOOP_FRESH_MS;
  const unclaimed = Number((data && data.unclaimedItems) ?? 0);
  if (unclaimed <= 0) {
    return { matched: false, reason: 'no_unclaimed_work', evidence: { unclaimed_items: unclaimed } };
  }
  const stalled = [];
  for (const s of ((data && data.sessions) || [])) {
    if (!s || s.loop_state !== 'active') continue;       // only actively-looping (parked awaiting_tick excluded)
    if (s.sd_key) continue;                               // holds a claim → not stalled (detectStuckWorker covers it)
    const silenceUntil = toMs(s.expected_silence_until);
    if (silenceUntil && silenceUntil > now) continue;     // legitimately parked with a future silence window
    const hbMs = toMs(s.heartbeat_at);
    if (!hbMs) continue;                                  // no usable heartbeat → skip (fail-open)
    const hbAge = now - hbMs;
    if (hbAge > freshMs) continue;                        // not fresh → looks dead, the staleness sweep handles it
    if (stalled.length < 10) {
      stalled.push({ session_id: s.session_id, loop_state: s.loop_state, heartbeat_age_ms: hbAge });
    }
  }
  if (stalled.length === 0) {
    return { matched: false, reason: 'no_stalled_loops', evidence: { unclaimed_items: unclaimed, fresh_ms: freshMs } };
  }
  return {
    matched: true,
    reason: 'live_loops_holding_no_claim_while_work_waits',
    evidence: { stalled_count: stalled.length, unclaimed_items: unclaimed, fresh_ms: freshMs, samples: stalled, advisory: 're-paste the wake prompt into these windows (alive but parked with claimable work waiting)' },
  };
}

/**
 * Run all detectors over an injected data bundle. PURE — no I/O.
 * @param {object} data
 * @param {object} [opts] - { now, replyStarvationMs, stuckWorkerMs, priorPhases, deployGapMs, loopExpiryWarnMs, stalledLoopFreshMs }
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
    // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: advisory (severity 'info' — coordination_events.severity
    // CHECK allows only info/warning/critical; DEPLOY_GAP is discriminated by event_type + payload).
    { event_type: 'DEPLOY_GAP', severity: 'info', res: detectDeployGap({ sessions: data && data.sessions, mergesByRole: data && data.mergesByRole, now }, { maxGapMs: opts.deployGapMs }) },
    // SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001: loop-liveness detectors (warning; advisory observability).
    { event_type: 'LOOP_EXPIRY_WARNING', severity: 'warning', res: detectLoopExpiry({ sessions: data && data.sessions, now }, { warnMs: opts.loopExpiryWarnMs }) },
    { event_type: 'STALLED_LOOP', severity: 'warning', res: detectStalledLoop({ sessions: data && data.sessions, unclaimedItems: data && data.unclaimedItems, now, freshMs: opts.stalledLoopFreshMs }) },
  ];
  return results
    .filter((r) => r.res.matched)
    .map((r) => ({ event_type: r.event_type, severity: r.severity, reason: r.res.reason, evidence: r.res.evidence }));
}

/** Default INERT_WORKER threshold (ms) — pending spawn-request age with no consumption (360 min). */
const DEFAULT_INERT_WORKER_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * INERT_WORKER_REVIVAL — pending worker_spawn_requests aged past threshold with no
 * consumption (fulfilled_at NULL). Surfaces that no spawn-execution layer consumes
 * revival requests on this host (SD-LEO-INFRA-SURFACE-INERT-WORKER-001). PURE;
 * read-only injected rows. Expired-but-still-pending rows COUNT (status never
 * transitions when the consumer is absent). Decoupled from runDetectors: its own
 * flag + emit target (operator alert), not coordination_events.
 * @param {{ requests: Array<object>, now?: number, thresholdMs?: number }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectInertWorkerRevival(data) {
  const now = (data && data.now) ?? Date.now();
  const thresholdMs = (data && data.thresholdMs) ?? DEFAULT_INERT_WORKER_AGE_MS;
  const aged = [];
  for (const r of ((data && data.requests) || [])) {
    if (!r || r.status !== 'pending') continue;
    if (r.fulfilled_at) continue;
    const ageMs = now - toMs(r.requested_at);
    if (ageMs > thresholdMs) {
      aged.push({ id: r.id, callsign: r.requested_callsign, age_ms: ageMs });
    }
  }
  if (aged.length > 0) {
    return {
      matched: true,
      reason: 'pending_spawn_requests_unconsumed_past_threshold',
      evidence: { aged_count: aged.length, threshold_ms: thresholdMs, samples: aged.slice(0, 10) },
    };
  }
  return { matched: false, reason: 'no_inert_spawn_requests', evidence: { threshold_ms: thresholdMs } };
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
  DEFAULT_INERT_WORKER_AGE_MS,
  detectInertWorkerRevival,
  // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001
  detectDeployGap,
  sessionRole,
  ROLE_CODE_PATHS,
  DEFAULT_DEPLOY_GAP_MS,
  // SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001
  detectLoopExpiry,
  detectStalledLoop,
  LOOP_ACTIVE_STATES,
  DEFAULT_LOOP_EXPIRY_WARN_MS,
  DEFAULT_STALLED_LOOP_FRESH_MS,
};
