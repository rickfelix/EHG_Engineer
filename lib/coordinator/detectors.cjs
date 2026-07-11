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

const { hasCorrelatedReply } = require('./reply-correlation.cjs');

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
 * MULTIPLE_ADAMS — more than one live Adam role-session (the Adam analogue of SPLIT_BRAIN).
 * SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1). PURE: takes a PRE-COMPUTED count of
 * fresh metadata.role=adam sessions (the I/O is done upstream by lib/coordinator/adam-identity.cjs
 * countFreshAdams / fetchFreshAdams, mirroring how detectSplitBrain takes a pre-computed
 * coordinatorCount). Keeps this module strictly read-only + no-I/O.
 * @param {{ adamCount: number, adams?: Array<object> }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectMultipleAdams(data) {
  const count = Number((data && data.adamCount) ?? 0);
  if (count > 1) {
    return {
      matched: true,
      reason: 'multiple_live_adams',
      evidence: {
        adam_count: count,
        sessions: ((data && data.adams) || []).map((a) => a.session_id).filter(Boolean).slice(0, 10),
        advisory: 'a single-Adam guard should refuse the 2nd Adam (fresh prior) or retire a stale prior; see adam-register single-Adam guard',
      },
    };
  }
  return { matched: false, reason: 'single_or_no_adam', evidence: { adam_count: count } };
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
  const allSignals = (data && data.signals) || [];
  for (const sig of allSignals) {
    if ((sig && sig.sender_type) !== 'worker') continue;
    // SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001 (closure map class C6): a reply
    // routinely arrives as a fresh correlated row, not an update to acknowledged_at.
    const answered = !!sig.acknowledged_at || !!(sig.payload && sig.payload.routed_to_feedback_id)
      || hasCorrelatedReply(sig, allSignals);
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
 * SD-LEO-INFRA-STALLED-POSTCOMPLETION-TAIL-FP-001: a worker that JUST shipped an SD releases its
 * claim (released_reason='completed') but keeps running its post-completion tail
 * (document/heal/learn/capture-flags) with loop_state still 'active' and a fresh heartbeat. That is
 * legitimately FINISHING a just-shipped SD, NOT a parked stall. Exclude it for a short grace window
 * after the release (matches the fresh-heartbeat window). A worker still claimless past the grace is
 * re-flagged on the next sweep, so genuine post-completion stalls are not masked.
 */
const DEFAULT_COMPLETION_GRACE_MS = 10 * 60 * 1000;
const COMPLETION_RELEASE_REASONS = Object.freeze(['completed', 'qf_completed']);
/** True when a release reason denotes a real SD/QF completion (case-insensitive). */
function isCompletionRelease(reason) {
  return typeof reason === 'string' && COMPLETION_RELEASE_REASONS.includes(reason.trim().toLowerCase());
}

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
 * Also excludes a worker in its POST-COMPLETION TAIL (released_reason='completed'/'qf_completed' with
 * a released_at inside the completion-grace window) — it shipped an SD and is legitimately running
 * document/heal/learn/capture-flags, not stalled (SD-LEO-INFRA-STALLED-POSTCOMPLETION-TAIL-FP-001).
 * @param {{ sessions?: Array, unclaimedItems?: number, now?: number, freshMs?: number, completionGraceMs?: number }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectStalledLoop(data) {
  const now = (data && data.now) ?? Date.now();
  const freshMs = (data && data.freshMs) ?? DEFAULT_STALLED_LOOP_FRESH_MS;
  const graceMs = (data && data.completionGraceMs) ?? DEFAULT_COMPLETION_GRACE_MS;
  const unclaimed = Number((data && data.unclaimedItems) ?? 0);
  if (unclaimed <= 0) {
    return { matched: false, reason: 'no_unclaimed_work', evidence: { unclaimed_items: unclaimed } };
  }
  const stalled = [];
  for (const s of ((data && data.sessions) || [])) {
    if (!s || s.loop_state !== 'active') continue;       // only actively-looping (parked awaiting_tick excluded)
    if (s.sd_key) continue;                               // holds a claim → not stalled (detectStuckWorker covers it)
    // SD-LEO-INFRA-STALLED-POSTCOMPLETION-TAIL-FP-001: a just-shipped worker running its
    // post-completion tail (claim released_reason='completed', loop_state still 'active', fresh hb,
    // belt deep) is FINISHING, not stalled — exclude within the grace window after release. Fail-open:
    // a completion release with no usable released_at is NOT excluded (still flagged), and a release
    // older than graceMs is still flagged, so genuine post-completion stalls are not masked.
    if (isCompletionRelease(s.released_reason)) {
      const releasedAtMs = toMs(s.released_at);
      if (releasedAtMs && (now - releasedAtMs) <= graceMs) continue;
    }
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
 * SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001: per-session projection of detectStalledLoop, for
 * surfaces that need to mark INDIVIDUAL stalled workers (e.g. the coordinator capacity forecast table)
 * rather than the aggregate verdict. Returns a Set of the flagged session_ids. PURE — no I/O.
 * Inherits every detectStalledLoop guard (parked-exclusion, belt-empty → empty set, claimed-exclusion,
 * stale-heartbeat-exclusion), so consumers cannot reintroduce the heartbeat-age false positive.
 * @param {{ sessions?: Array, unclaimedItems?: number, now?: number, freshMs?: number }} data
 * @returns {Set<string>}
 */
function stalledLoopSessionIds(data) {
  const r = detectStalledLoop(data);
  const samples = (r && r.evidence && r.evidence.samples) ? r.evidence.samples : [];
  return new Set(samples.map(s => s.session_id));
}

/** Default tick-dead threshold (ms): the detached session-tick writes process_alive_at every 30s,
 *  so >5 min stale means the tick (and therefore the iterating loop) is dead, not merely between ticks. */
const DEFAULT_MASKED_STALL_PROCESS_STALE_MS = 5 * 60 * 1000;

/**
 * MASKED_STALL — the stall-after-completion attrition mode (SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001):
 * a worker whose PARENT still looks alive (fresh heartbeat_at — the PostToolUse hook keeps refreshing it)
 * but whose iterating loop is DEAD, proven by a stale process_alive_at (the detached 30s session-tick has
 * stopped). It holds no claim while ranked belt work waits. This is a strict, HIGHER-CONFIDENCE subset of
 * detectStalledLoop: detectStalledLoop reads heartbeat only and treats this as a re-paste advisory, but a
 * fresh heartbeat can MASK a dead loop. process_alive_at is the authoritative tick-liveness signal — when
 * it is stale beyond processStaleMs the loop is confirmed not iterating, which warrants a durable operator
 * escalation rather than a display-only flag. PURE — no I/O. Fail-open: a session missing process_alive_at
 * or heartbeat_at is SKIPPED (never falsely flagged), and a healthy worker (BOTH fresh) is never matched —
 * the action this feeds is escalation, never reaping a live-parent session.
 * RELIABILITY CAVEAT (validation b71d405b): this is only trustworthy when process_alive_at is actually
 * being written — the detached session-tick was found "fleet-broken" (stale for healthy workers), so the
 * sole consumer (coordinator-capacity-forecast) keeps this DORMANT behind LEO_MASKED_STALL_DETECT until
 * tick reliability is restored or a second liveness witness is added. The pure detector is correct in
 * isolation; the gating prevents false-positive escalations on the current broken tick.
 * @param {{ sessions?: Array, unclaimedItems?: number, now?: number, freshMs?: number, processStaleMs?: number }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectMaskedStall(data) {
  const now = (data && data.now) ?? Date.now();
  const freshMs = (data && data.freshMs) ?? DEFAULT_STALLED_LOOP_FRESH_MS;
  const processStaleMs = (data && data.processStaleMs) ?? DEFAULT_MASKED_STALL_PROCESS_STALE_MS;
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
    if (hbAge > freshMs) continue;                        // heartbeat NOT fresh → parent not proven alive; not a MASKED stall
    const aliveMs = toMs(s.process_alive_at);
    if (!aliveMs) continue;                               // no usable tick signal → skip (fail-open; can't prove a dead tick)
    const aliveAge = now - aliveMs;
    if (aliveAge <= processStaleMs) continue;             // tick is fresh → loop is iterating → healthy, never flag
    // MATCHED: parent alive (fresh hb) but the loop's tick is dead, holding no claim while work waits.
    if (stalled.length < 10) {
      stalled.push({ session_id: s.session_id, loop_state: s.loop_state, heartbeat_age_ms: hbAge, process_alive_age_ms: aliveAge });
    }
  }
  if (stalled.length === 0) {
    return { matched: false, reason: 'no_masked_stalls', evidence: { unclaimed_items: unclaimed, fresh_ms: freshMs, process_stale_ms: processStaleMs } };
  }
  return {
    matched: true,
    reason: 'fresh_heartbeat_masks_dead_loop_holding_no_claim_while_work_waits',
    evidence: { masked_count: stalled.length, unclaimed_items: unclaimed, fresh_ms: freshMs, process_stale_ms: processStaleMs, samples: stalled, advisory: 'CONFIRMED dead loops (live parent, dead tick) holding no claim while ranked work waits — operator must re-paste the wake prompt; the worker cannot self-revive and the coordinator cannot re-arm a loop' },
  };
}

/**
 * QF-20260705-817: the COMPLETION-boundary silent-exit attrition class — a worker whose loop
 * EXITED right after completing a phase/SD (4 instances in one day: post-probe-ship,
 * post-HOTSPOTS-LEAD-TO-PLAN, +2 earlier), discovered late by a coordinator investigation each
 * time. Distinct from detectStalledLoop/detectMaskedStall (both REQUIRE a fresh heartbeat — a
 * still-looping-but-parked worker); this detector is the inverse: the completion-grace window
 * (DEFAULT_COMPLETION_GRACE_MS) has ELAPSED (no longer legitimately finishing its post-completion
 * tail) AND the heartbeat has gone STALE (the loop actually stopped, not just parked-alive) AND
 * unclaimed work is waiting. PURE — no I/O. Fail-open: skips sessions with no usable
 * released_at/heartbeat_at, or whose last release wasn't a genuine completion, or that still hold
 * a claim (a different failure class).
 * @param {{ sessions?: Array, unclaimedItems?: number, now?: number, freshMs?: number, graceMs?: number }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectCompletionBoundaryExit(data) {
  const now = (data && data.now) ?? Date.now();
  const freshMs = (data && data.freshMs) ?? DEFAULT_STALLED_LOOP_FRESH_MS;
  const graceMs = (data && data.graceMs) ?? DEFAULT_COMPLETION_GRACE_MS;
  const unclaimed = Number((data && data.unclaimedItems) ?? 0);
  if (unclaimed <= 0) {
    return { matched: false, reason: 'no_unclaimed_work', evidence: { unclaimed_items: unclaimed } };
  }
  const exited = [];
  for (const s of ((data && data.sessions) || [])) {
    if (!s || s.sd_key) continue;                         // holds a claim -> a different failure class
    if (!isCompletionRelease(s.released_reason)) continue; // last release wasn't a genuine completion
    const releasedAtMs = toMs(s.released_at);
    if (!releasedAtMs) continue;                           // no usable release time -> skip (fail-open)
    if (now - releasedAtMs <= graceMs) continue;            // still inside the legitimate post-completion tail
    const hbMs = toMs(s.heartbeat_at);
    if (!hbMs) continue;                                    // no usable heartbeat -> skip (fail-open)
    if (now - hbMs <= freshMs) continue;                    // heartbeat still fresh -> not exited (detectStalledLoop's territory)
    if (exited.length < 10) {
      exited.push({ session_id: s.session_id, released_reason: s.released_reason, silent_ms: now - hbMs });
    }
  }
  if (exited.length === 0) {
    return { matched: false, reason: 'no_completion_boundary_exits', evidence: { unclaimed_items: unclaimed, fresh_ms: freshMs, grace_ms: graceMs } };
  }
  return {
    matched: true,
    reason: 'session_loop_exited_after_completion_while_work_waits',
    evidence: { exited_count: exited.length, unclaimed_items: unclaimed, fresh_ms: freshMs, grace_ms: graceMs, samples: exited, advisory: 're-paste the fleet-worker wake prompt into that window — the loop exited right after completing, no self-revival possible' },
  };
}

/**
 * Per-session projection of detectMaskedStall (mirrors stalledLoopSessionIds). Returns the flagged
 * session_id Set. PURE — inherits every detectMaskedStall guard. @returns {Set<string>}
 */
function maskedStallSessionIds(data) {
  const r = detectMaskedStall(data);
  const samples = (r && r.evidence && r.evidence.samples) ? r.evidence.samples : [];
  return new Set(samples.map(s => s.session_id));
}

/**
 * Run all detectors over an injected data bundle. PURE — no I/O.
 * @param {object} data
 * @param {object} [opts] - { now, replyStarvationMs, stuckWorkerMs, priorPhases, deployGapMs, loopExpiryWarnMs, stalledLoopFreshMs, evaSchedulerStaleMs }
 * @returns {Array<{ event_type: string, severity: string, reason: string, evidence: object }>}
 */
function runDetectors(data, opts) {
  opts = opts || {};
  const now = opts.now ?? Date.now();
  const results = [
    { event_type: 'SPLIT_BRAIN', severity: 'critical', res: detectSplitBrain(data) },
    // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1): the Adam analogue of SPLIT_BRAIN.
    { event_type: 'MULTIPLE_ADAMS', severity: 'critical', res: detectMultipleAdams(data) },
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
    // SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: the confirmed (dead-tick) subset of STALLED_LOOP — a live
    // parent (fresh heartbeat) whose iterating loop is dead (stale process_alive_at), warranting escalation.
    { event_type: 'MASKED_STALL', severity: 'warning', res: detectMaskedStall({ sessions: data && data.sessions, unclaimedItems: data && data.unclaimedItems, now, freshMs: opts.stalledLoopFreshMs, processStaleMs: opts.maskedStallProcessStaleMs }) },
    // SD-LEO-INFRA-REVIVE-EVA-HEARTBEAT-ALARM-001: EVA scheduler staleness (warning; keyed on last_poll_at age, ignores the status lie).
    { event_type: 'EVA_SCHEDULER_STALE', severity: 'warning', res: detectEvaSchedulerStale({ heartbeat: data && data.evaSchedulerHeartbeat, now }, { staleMs: opts.evaSchedulerStaleMs }) },
    // SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 (d): completed SDs with no accepted canonical
    // LFA row (v_sd_completion_integrity.is_ghost_completed) — any future regression of the
    // recorder's canonical write surfaces within one sweep cycle instead of accruing silently.
    { event_type: 'GHOST_COMPLETION', severity: 'warning', res: detectGhostCompletion(data) },
  ];
  return results
    .filter((r) => r.res.matched)
    .map((r) => ({ event_type: r.event_type, severity: r.severity, reason: r.res.reason, evidence: r.res.evidence }));
}

/**
 * GHOST_COMPLETION — recently completed SDs flagged is_ghost_completed by
 * v_sd_completion_integrity (completed without an accepted canonical LFA row in
 * sd_phase_handoffs). PURE over injected rows (the sweep performs the read).
 * SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 (d).
 * @param {{ ghostCompletions?: Array<{sd_key:string, updated_at?:string}> }} data
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectGhostCompletion(data) {
  const rows = (data && data.ghostCompletions) || [];
  if (rows.length > 0) {
    return {
      matched: true,
      reason: 'completed_sds_missing_accepted_canonical_lfa_row',
      evidence: {
        ghost_count: rows.length,
        samples: rows.slice(0, 10).map((r) => ({ sd_key: r.sd_key, updated_at: r.updated_at || null })),
        advisory: 'Recorder canonical LFA write may have regressed (see SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001); reconcile via the backfill script and investigate HandoffRecorder.',
      },
    };
  }
  return { matched: false, reason: 'no_recent_ghost_completions', evidence: { ghost_count: 0 } };
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

// SD-LEO-INFRA-REVIVE-EVA-HEARTBEAT-ALARM-001: a read-only alarm for the EVA dispatch
// scheduler going dark — the heartbeat row's status column freezes on its last value when
// the process dies, so age (not status) is the only trustworthy liveness signal.
/** Default EVA_SCHEDULER_STALE threshold (ms): 15 min. The scheduler polls every ~60s, so a
 *  last_poll_at older than 15 min is ~15 missed polls — down, not a transient hiccup. */
const DEFAULT_EVA_SCHEDULER_STALE_MS = 15 * 60 * 1000;

/**
 * EVA_SCHEDULER_STALE — the EVA dispatch scheduler (eva_scheduler_heartbeat) has stopped
 * polling. Keyed PURELY on last_poll_at AGE, deliberately IGNORING the status column: a
 * crashed scheduler leaves status='running' frozen (a stale lie) while last_poll_at stops
 * advancing, so trusting status would mask the outage entirely. Flags when (now -
 * last_poll_at) exceeds an env-tunable threshold (~15 min ≈ 15 missed ~60s polls). Modeled
 * on detectDeployGap (a timestamp anchor). PURE — no I/O. Fail-open: a row with no usable
 * last_poll_at, or no heartbeat row at all, is SKIPPED (never a false flag — a scheduler
 * that was never deployed has nothing to alarm on). Accepts a single row, an array of rows,
 * or nothing.
 * @param {{ heartbeat?: (object|Array), now?: number }} data
 * @param {{ staleMs?: number }} [opts]
 * @returns {{ matched: boolean, reason: string, evidence: object }}
 */
function detectEvaSchedulerStale(data, opts) {
  opts = opts || {};
  const now = (data && data.now) ?? Date.now();
  const staleMs = opts.staleMs ?? DEFAULT_EVA_SCHEDULER_STALE_MS;
  const raw = data && data.heartbeat;
  const rows = Array.isArray(raw) ? raw : (raw ? [raw] : []); // normalize row | rows | none
  const stale = [];
  for (const hb of rows) {
    if (!hb) continue;
    const pollMs = toMs(hb.last_poll_at);
    if (!pollMs) continue;                 // unknown/unparseable last_poll_at → skip (fail-open)
    const ageMs = now - pollMs;
    if (ageMs <= staleMs) continue;        // polling recently → healthy (regardless of status)
    if (stale.length < 10) {
      stale.push({ instance_id: hb.instance_id ?? hb.id ?? null, last_poll_at: hb.last_poll_at, age_ms: ageMs, reported_status: hb.status ?? null });
    }
  }
  if (stale.length === 0) {
    return { matched: false, reason: 'eva_scheduler_polling_within_window', evidence: { threshold_ms: staleMs } };
  }
  const maxAge = stale.reduce((m, e) => Math.max(m, e.age_ms), 0);
  return {
    matched: true,
    reason: 'eva_scheduler_heartbeat_stale',
    evidence: { stale_count: stale.length, max_age_ms: maxAge, threshold_ms: staleMs, samples: stale, advisory: 'EVA dispatch scheduler has stopped polling (the status column may falsely read "running"); restart the scheduler process' },
  };
}

module.exports = {
  DEFAULT_COORDINATOR_FRESH_MS,
  DEFAULT_REPLY_STARVATION_MS,
  DEFAULT_STUCK_WORKER_MS,
  detectSplitBrain,
  detectMultipleAdams,
  detectThunderingHerd,
  detectReplyStarvation,
  detectStuckWorker,
  detectClaimHalfWrite,
  detectGhostCompletion,
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
  stalledLoopSessionIds,
  // SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001
  detectMaskedStall,
  maskedStallSessionIds,
  DEFAULT_MASKED_STALL_PROCESS_STALE_MS,
  LOOP_ACTIVE_STATES,
  DEFAULT_LOOP_EXPIRY_WARN_MS,
  DEFAULT_STALLED_LOOP_FRESH_MS,
  isCompletionRelease,
  DEFAULT_COMPLETION_GRACE_MS,
  // QF-20260705-817
  detectCompletionBoundaryExit,
  // SD-LEO-INFRA-REVIVE-EVA-HEARTBEAT-ALARM-001
  detectEvaSchedulerStale,
  DEFAULT_EVA_SCHEDULER_STALE_MS,
};
