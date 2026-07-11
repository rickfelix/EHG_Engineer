/**
 * Unit tests for epic #4 coordination detectors.
 * SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001
 *
 * Pure predicates over injected fixtures — no live DB. Each detector has a
 * positive and a negative case; the writer is tested fail-open.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  detectSplitBrain,
  detectThunderingHerd,
  detectReplyStarvation,
  detectStuckWorker,
  detectClaimHalfWrite,
  detectLoopExpiry,
  detectStalledLoop,
  stalledLoopSessionIds,
  detectEvaSchedulerStale,
  detectCompletionBoundaryExit,
  runDetectors,
} from '../../../lib/coordinator/detectors.cjs';
import {
  coordDetectorsEnabled,
  resolveThresholds,
  logCoordinationEvent,
  runAndLogDetectors,
  DETECTOR_VERSION,
} from '../../../lib/coordinator/coordination-events.cjs';

const NOW = 1_750_000_000_000; // fixed clock
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString();

describe('detectSplitBrain', () => {
  it('matches when more than one fresh coordinator', () => {
    const r = detectSplitBrain({ coordinatorCount: 2, coordinators: [{ session_id: 'a' }, { session_id: 'b' }] });
    expect(r.matched).toBe(true);
    expect(r.evidence.coordinator_count).toBe(2);
    expect(r.evidence.sessions).toEqual(['a', 'b']);
  });
  it('does not match with a single coordinator', () => {
    expect(detectSplitBrain({ coordinatorCount: 1 }).matched).toBe(false);
    expect(detectSplitBrain({ coordinatorCount: 0 }).matched).toBe(false);
  });
});

describe('detectThunderingHerd', () => {
  it('matches when idle workers exceed unclaimed items', () => {
    const r = detectThunderingHerd({ idleWorkers: 5, unclaimedItems: 2 });
    expect(r.matched).toBe(true);
    expect(r.evidence.surplus).toBe(3);
  });
  it('does not match when work supply covers idle workers', () => {
    expect(detectThunderingHerd({ idleWorkers: 2, unclaimedItems: 5 }).matched).toBe(false);
    expect(detectThunderingHerd({ idleWorkers: 0, unclaimedItems: 0 }).matched).toBe(false);
  });
});

describe('detectReplyStarvation', () => {
  it('matches an old unanswered worker signal', () => {
    const signals = [{ id: '1', sender_type: 'worker', sender_session: 'w1', created_at: minsAgo(45), acknowledged_at: null, read_at: null, payload: {} }];
    const r = detectReplyStarvation({ signals, now: NOW, thresholdMs: 30 * 60_000 });
    expect(r.matched).toBe(true);
    expect(r.evidence.starved_count).toBe(1);
  });
  it('does not match answered / read / non-worker / recent signals', () => {
    const base = { sender_type: 'worker', sender_session: 'w', created_at: minsAgo(45), acknowledged_at: null, read_at: null, payload: {} };
    const signals = [
      { ...base, id: 'a', acknowledged_at: minsAgo(40) },                 // acknowledged
      { ...base, id: 'b', payload: { routed_to_feedback_id: 'fb-1' } },   // routed (stampRouted)
      { ...base, id: 'c', read_at: minsAgo(40) },                          // read
      { ...base, id: 'd', sender_type: 'coordinator' },                   // not a worker ask
      { ...base, id: 'e', created_at: minsAgo(5) },                        // too recent
    ];
    expect(detectReplyStarvation({ signals, now: NOW, thresholdMs: 30 * 60_000 }).matched).toBe(false);
  });

  it('SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001: a correlated reply row excludes the original from starvation', () => {
    const original = { id: 'req-1', sender_type: 'worker', sender_session: 'w1', created_at: minsAgo(45), acknowledged_at: null, read_at: null, payload: {} };
    const reply = { id: 'reply-1', sender_type: 'coordinator', sender_session: 'c1', created_at: minsAgo(10), acknowledged_at: null, read_at: null, payload: { reply_to: 'req-1' } };
    expect(detectReplyStarvation({ signals: [original, reply], now: NOW, thresholdMs: 30 * 60_000 }).matched).toBe(false);
  });

  it('SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001: no correlated reply present still starves (genuine case preserved)', () => {
    const original = { id: 'req-2', sender_type: 'worker', sender_session: 'w1', created_at: minsAgo(45), acknowledged_at: null, read_at: null, payload: {} };
    const unrelated = { id: 'other', sender_type: 'coordinator', sender_session: 'c1', created_at: minsAgo(10), acknowledged_at: null, read_at: null, payload: { reply_to: 'not-req-2' } };
    const r = detectReplyStarvation({ signals: [original, unrelated], now: NOW, thresholdMs: 30 * 60_000 });
    expect(r.matched).toBe(true);
    expect(r.evidence.samples.some((s) => s.id === 'req-2')).toBe(true);
  });
});

describe('detectStuckWorker', () => {
  it('matches a claimed SD with no progress past threshold', () => {
    const claims = [{ session_id: 's1', sd_key: 'SD-X', current_phase: 'EXEC', heartbeat_at: minsAgo(120), sd_updated_at: minsAgo(130) }];
    const r = detectStuckWorker({ claims, now: NOW, thresholdMs: 60 * 60_000 });
    expect(r.matched).toBe(true);
    expect(r.evidence.samples[0].sd_key).toBe('SD-X');
  });
  it('does not match fresh, null-timing, or phase-advanced claims', () => {
    const fresh = [{ session_id: 's', sd_key: 'SD-A', current_phase: 'EXEC', heartbeat_at: minsAgo(5), sd_updated_at: minsAgo(5) }];
    expect(detectStuckWorker({ claims: fresh, now: NOW, thresholdMs: 60 * 60_000 }).matched).toBe(false);
    // null timing → emit nothing (null-tolerant, HB-1)
    const nullTiming = [{ session_id: 's', sd_key: 'SD-B', current_phase: 'EXEC', heartbeat_at: null, sd_updated_at: null }];
    expect(detectStuckWorker({ claims: nullTiming, now: NOW, thresholdMs: 60 * 60_000 }).matched).toBe(false);
    // stale but phase advanced since prior snapshot → not stuck
    const advanced = [{ session_id: 's', sd_key: 'SD-C', current_phase: 'PLAN', heartbeat_at: minsAgo(120), sd_updated_at: minsAgo(120) }];
    expect(detectStuckWorker({ claims: advanced, now: NOW, thresholdMs: 60 * 60_000, priorPhases: { 'SD-C': 'LEAD' } }).matched).toBe(false);
  });
});

describe('detectClaimHalfWrite', () => {
  it('matches a bilateral mismatch (session holds sd_key but SD row claims nobody)', () => {
    const sessions = [{ session_id: 's1', sd_key: 'SD-X' }];
    const sdClaims = [{ sd_key: 'SD-X', claiming_session_id: null }];
    const r = detectClaimHalfWrite({ sessions, sdClaims });
    expect(r.matched).toBe(true);
    expect(r.evidence.mismatch_count).toBeGreaterThan(0);
  });
  it('does not match a consistent claim', () => {
    const sessions = [{ session_id: 's1', sd_key: 'SD-X' }];
    const sdClaims = [{ sd_key: 'SD-X', claiming_session_id: 's1' }];
    expect(detectClaimHalfWrite({ sessions, sdClaims }).matched).toBe(false);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (d) => new Date(NOW - d * DAY_MS).toISOString();

describe('detectLoopExpiry', () => {
  it('matches a loop session older than the warn threshold (active or awaiting_tick)', () => {
    const sessions = [
      { session_id: 'old-active', loop_state: 'active', created_at: daysAgo(7) },
      { session_id: 'old-parked', loop_state: 'awaiting_tick', created_at: daysAgo(6.5) },
    ];
    const r = detectLoopExpiry({ sessions, now: NOW });
    expect(r.matched).toBe(true);
    expect(r.evidence.expiring_count).toBe(2);
    expect(r.evidence.samples[0].session_id).toBe('old-active');
  });
  it('does not match young loops, non-loop states, or unknown created_at (fail-open)', () => {
    const sessions = [
      { session_id: 'young', loop_state: 'active', created_at: daysAgo(2) },        // within lifetime
      { session_id: 'exited', loop_state: 'exited', created_at: daysAgo(30) },       // not a live loop
      { session_id: 'no-anchor', loop_state: 'active', created_at: null },           // unknown start → skip
    ];
    expect(detectLoopExpiry({ sessions, now: NOW }).matched).toBe(false);
  });
  it('is env-tunable via opts.warnMs', () => {
    const sessions = [{ session_id: 'mid', loop_state: 'active', created_at: daysAgo(3) }];
    expect(detectLoopExpiry({ sessions, now: NOW }).matched).toBe(false);                  // default 6d → no
    expect(detectLoopExpiry({ sessions, now: NOW }, { warnMs: 2 * DAY_MS }).matched).toBe(true); // 2d → yes
  });
});

describe('detectStalledLoop', () => {
  const stalled = { session_id: 'w1', loop_state: 'active', sd_key: null, heartbeat_at: minsAgo(2), expected_silence_until: null };
  it('matches a live active loop holding no claim while work waits', () => {
    const r = detectStalledLoop({ sessions: [stalled], unclaimedItems: 3, now: NOW });
    expect(r.matched).toBe(true);
    expect(r.evidence.stalled_count).toBe(1);
    expect(r.evidence.samples[0].session_id).toBe('w1');
  });
  it('does not match when there is no unclaimed work', () => {
    expect(detectStalledLoop({ sessions: [stalled], unclaimedItems: 0, now: NOW }).matched).toBe(false);
  });
  it('excludes claimed, parked (awaiting_tick / future silence), and stale-heartbeat sessions', () => {
    const sessions = [
      { ...stalled, session_id: 'has-claim', sd_key: 'SD-X' },                                   // holds a claim
      { ...stalled, session_id: 'parked', loop_state: 'awaiting_tick' },                          // parked, not 'active'
      { ...stalled, session_id: 'silenced', expected_silence_until: new Date(NOW + 60_000).toISOString() }, // future silence window
      { ...stalled, session_id: 'stale', heartbeat_at: minsAgo(30) },                             // not fresh → looks dead
    ];
    expect(detectStalledLoop({ sessions, unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });

  // SD-LEO-INFRA-STALLED-POSTCOMPLETION-TAIL-FP-001: post-completion-tail exclusion
  it('excludes a worker running its post-completion tail (completed + recent released_at)', () => {
    const tail = { ...stalled, session_id: 'tail', released_reason: 'completed', released_at: minsAgo(3) };
    expect(detectStalledLoop({ sessions: [tail], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
  it('excludes a qf_completed tail within the grace window', () => {
    const tail = { ...stalled, session_id: 'qf-tail', released_reason: 'QF_COMPLETED', released_at: minsAgo(1) };
    expect(detectStalledLoop({ sessions: [tail], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
  it('STILL flags a completion release with no released_at (fail-open, no mask)', () => {
    const noTs = { ...stalled, session_id: 'no-ts', released_reason: 'completed', released_at: null };
    expect(detectStalledLoop({ sessions: [noTs], unclaimedItems: 5, now: NOW }).matched).toBe(true);
  });
  it('STILL flags when released_at is older than the grace window', () => {
    const old = { ...stalled, session_id: 'old-rel', released_reason: 'completed', released_at: minsAgo(20) };
    expect(detectStalledLoop({ sessions: [old], unclaimedItems: 5, now: NOW }).matched).toBe(true);
  });
  it('STILL flags a non-completion release (e.g. stale_cleanup) with a recent released_at', () => {
    const other = { ...stalled, session_id: 'other-rel', released_reason: 'stale_cleanup', released_at: minsAgo(2) };
    expect(detectStalledLoop({ sessions: [other], unclaimedItems: 5, now: NOW }).matched).toBe(true);
  });
});

// QF-20260705-817: the inverse of detectStalledLoop's post-completion-tail exclusion — a worker
// whose loop EXITED (heartbeat gone STALE) after the grace window elapsed, following a genuine
// completion release, while unclaimed work waits.
describe('detectCompletionBoundaryExit', () => {
  const exited = { session_id: 'w1', sd_key: null, released_reason: 'completed', released_at: minsAgo(20), heartbeat_at: minsAgo(15) };
  it('matches a session that loop-exited after completion, grace elapsed, heartbeat stale', () => {
    const r = detectCompletionBoundaryExit({ sessions: [exited], unclaimedItems: 3, now: NOW });
    expect(r.matched).toBe(true);
    expect(r.evidence.exited_count).toBe(1);
    expect(r.evidence.samples[0].session_id).toBe('w1');
  });
  it('does not match when there is no unclaimed work', () => {
    expect(detectCompletionBoundaryExit({ sessions: [exited], unclaimedItems: 0, now: NOW }).matched).toBe(false);
  });
  it('does not match a session that still holds a claim', () => {
    const claimed = { ...exited, session_id: 'has-claim', sd_key: 'SD-X' };
    expect(detectCompletionBoundaryExit({ sessions: [claimed], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
  it('does not match a non-completion release reason', () => {
    const other = { ...exited, session_id: 'other-rel', released_reason: 'stale_cleanup' };
    expect(detectCompletionBoundaryExit({ sessions: [other], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
  it('does not match while still inside the post-completion grace window', () => {
    const inGrace = { ...exited, session_id: 'in-grace', released_at: minsAgo(3), heartbeat_at: minsAgo(15) };
    expect(detectCompletionBoundaryExit({ sessions: [inGrace], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
  it('does not match when the heartbeat is still fresh (looks alive, not exited)', () => {
    const alive = { ...exited, session_id: 'alive', heartbeat_at: minsAgo(2) };
    expect(detectCompletionBoundaryExit({ sessions: [alive], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
  it('skips (fail-open) a session with no usable released_at', () => {
    const noTs = { ...exited, session_id: 'no-ts', released_at: null };
    expect(detectCompletionBoundaryExit({ sessions: [noTs], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
  it('skips (fail-open) a session with no usable heartbeat_at', () => {
    const noHb = { ...exited, session_id: 'no-hb', heartbeat_at: null };
    expect(detectCompletionBoundaryExit({ sessions: [noHb], unclaimedItems: 5, now: NOW }).matched).toBe(false);
  });
});

describe('stalledLoopSessionIds (SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001)', () => {
  const active = { session_id: 'w1', loop_state: 'active', sd_key: null, heartbeat_at: minsAgo(2), expected_silence_until: null };

  it('projects the flagged session_ids as a Set', () => {
    const ids = stalledLoopSessionIds({ sessions: [active], unclaimedItems: 3, now: NOW });
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has('w1')).toBe(true);
    expect(ids.size).toBe(1);
  });

  it('the capacity-forecast false positive is gone: a healthy idle /loop worker between ticks is NOT flagged', () => {
    // A parked worker (loop set awaiting_tick / a future silence window before ScheduleWakeup) with
    // claimable belt is exactly what the old heartbeat-age rule false-flagged "needs /loop re-arm".
    const parked = [
      { ...active, session_id: 'parked', loop_state: 'awaiting_tick' },
      { ...active, session_id: 'silenced', expected_silence_until: new Date(NOW + 600_000).toISOString() },
    ];
    expect(stalledLoopSessionIds({ sessions: parked, unclaimedItems: 5, now: NOW }).size).toBe(0);
  });

  it('empty belt → empty set (belt-empty guard preserved)', () => {
    expect(stalledLoopSessionIds({ sessions: [active], unclaimedItems: 0, now: NOW }).size).toBe(0);
  });
});

describe('detectEvaSchedulerStale', () => {
  const fresh = { id: 1, instance_id: 'eva-1', last_poll_at: minsAgo(1), status: 'running' };
  it('is quiet when the scheduler polled within the window (accepts a single row)', () => {
    const r = detectEvaSchedulerStale({ heartbeat: fresh, now: NOW });
    expect(r.matched).toBe(false);
    expect(r.reason).toBe('eva_scheduler_polling_within_window');
  });
  it('fires when last_poll_at is older than the threshold', () => {
    const aged = { id: 1, instance_id: 'eva-1', last_poll_at: minsAgo(45), status: 'running' };
    const r = detectEvaSchedulerStale({ heartbeat: aged, now: NOW });
    expect(r.matched).toBe(true);
    expect(r.reason).toBe('eva_scheduler_heartbeat_stale');
    expect(r.evidence.stale_count).toBe(1);
    expect(r.evidence.samples[0].instance_id).toBe('eva-1');
  });
  it('IGNORES the status="running" lie — a crashed scheduler freezes status but stops polling', () => {
    // The whole point: status reads "running" yet last_poll_at is 2h stale → MUST fire.
    const lying = { id: 1, instance_id: 'eva-1', last_poll_at: minsAgo(120), status: 'running' };
    const r = detectEvaSchedulerStale({ heartbeat: lying, now: NOW });
    expect(r.matched).toBe(true);
    expect(r.evidence.samples[0].reported_status).toBe('running'); // captured for the operator, not trusted
  });
  it('fail-open: no heartbeat row, or an unparseable last_poll_at, never flags', () => {
    expect(detectEvaSchedulerStale({ heartbeat: null, now: NOW }).matched).toBe(false);
    expect(detectEvaSchedulerStale({ heartbeat: [], now: NOW }).matched).toBe(false);
    expect(detectEvaSchedulerStale({ heartbeat: { id: 1, last_poll_at: null }, now: NOW }).matched).toBe(false);
  });
  it('accepts an array of rows and is env-tunable via opts.staleMs', () => {
    const rows = [{ id: 1, instance_id: 'eva-1', last_poll_at: minsAgo(8), status: 'running' }];
    expect(detectEvaSchedulerStale({ heartbeat: rows, now: NOW }).matched).toBe(false);                       // default 15m → no
    expect(detectEvaSchedulerStale({ heartbeat: rows, now: NOW }, { staleMs: 5 * 60 * 1000 }).matched).toBe(true); // 5m → yes
  });
});

describe('runDetectors', () => {
  it('returns only matched detectors with event_type + severity', () => {
    const data = {
      coordinatorCount: 2,
      idleWorkers: 0, unclaimedItems: 0,
      signals: [], claims: [], sessions: [], sdClaims: [],
    };
    const matches = runDetectors(data, { now: NOW });
    expect(matches.map((m) => m.event_type)).toEqual(['SPLIT_BRAIN']);
    expect(matches[0].severity).toBe('critical');
  });
  it('surfaces LOOP_EXPIRY_WARNING + STALLED_LOOP (both severity warning) when conditions hold', () => {
    const data = {
      coordinatorCount: 0, idleWorkers: 0, unclaimedItems: 2,
      signals: [], claims: [], sdClaims: [],
      sessions: [
        { session_id: 'old', loop_state: 'active', created_at: daysAgo(7), sd_key: null, heartbeat_at: minsAgo(1), expected_silence_until: null },
      ],
    };
    const byType = Object.fromEntries(runDetectors(data, { now: NOW }).map((m) => [m.event_type, m]));
    expect(byType.LOOP_EXPIRY_WARNING?.severity).toBe('warning');
    expect(byType.STALLED_LOOP?.severity).toBe('warning');
  });
  it('surfaces EVA_SCHEDULER_STALE (severity warning) when the heartbeat is dark', () => {
    const data = {
      coordinatorCount: 0, idleWorkers: 0, unclaimedItems: 0,
      signals: [], claims: [], sdClaims: [], sessions: [],
      evaSchedulerHeartbeat: { id: 1, instance_id: 'eva-1', last_poll_at: daysAgo(2), status: 'running' },
    };
    const byType = Object.fromEntries(runDetectors(data, { now: NOW }).map((m) => [m.event_type, m]));
    expect(byType.EVA_SCHEDULER_STALE?.severity).toBe('warning');
    expect(byType.EVA_SCHEDULER_STALE?.reason).toBe('eva_scheduler_heartbeat_stale');
  });
});

describe('coordDetectorsEnabled', () => {
  it('defaults OFF and turns on only for an explicit truthy flag', () => {
    expect(coordDetectorsEnabled({})).toBe(false);
    expect(coordDetectorsEnabled({ COORD_DETECTORS_V2: 'false' })).toBe(false);
    expect(coordDetectorsEnabled({ COORD_DETECTORS_V2: 'true' })).toBe(true);
  });
  it('resolveThresholds honors env overrides with safe defaults', () => {
    expect(resolveThresholds({}).replyStarvationMs).toBe(1800 * 1000);
    expect(resolveThresholds({ COORD_REPLY_STARVATION_T_SEC: '60' }).replyStarvationMs).toBe(60 * 1000);
    // SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001 thresholds: 6-day warn + 10-min freshness defaults, env-tunable.
    expect(resolveThresholds({}).loopExpiryWarnMs).toBe(8640 * 60 * 1000);
    expect(resolveThresholds({}).stalledLoopFreshMs).toBe(10 * 60 * 1000);
    expect(resolveThresholds({ COORD_LOOP_EXPIRY_WARN_MIN: '120' }).loopExpiryWarnMs).toBe(120 * 60 * 1000);
    expect(resolveThresholds({ COORD_STALLED_LOOP_FRESH_MIN: '5' }).stalledLoopFreshMs).toBe(5 * 60 * 1000);
    // SD-LEO-INFRA-REVIVE-EVA-HEARTBEAT-ALARM-001: 15-min EVA scheduler staleness default, env-tunable.
    expect(resolveThresholds({}).evaSchedulerStaleMs).toBe(15 * 60 * 1000);
    expect(resolveThresholds({ COORD_EVA_SCHEDULER_STALE_MIN: '30' }).evaSchedulerStaleMs).toBe(30 * 60 * 1000);
  });
});

describe('runAndLogDetectors (flag gate + fail-open writer)', () => {
  it('does nothing and reads nothing when the flag is OFF', async () => {
    const supabase = { from: vi.fn(() => { throw new Error('should not be called'); }) };
    const out = await runAndLogDetectors(supabase, { coordinatorCount: 5 }, { env: {}, now: NOW });
    expect(out).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('logs an event per match when the flag is ON', async () => {
    const inserted = [];
    const supabase = {
      from: () => ({ insert: (row) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'evt-1' }, error: null }) }) }; } }),
    };
    const out = await runAndLogDetectors(supabase, { coordinatorCount: 2 }, { env: { COORD_DETECTORS_V2: 'true' }, now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].event_type).toBe('SPLIT_BRAIN');
    expect(out[0].logged).toBe(true);
    expect(inserted[0].detector_version).toBe(DETECTOR_VERSION);
  });
  it('is FAIL-OPEN: a throwing insert never escapes', async () => {
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: async () => { throw new Error('db down'); } }) }) }) };
    const out = await runAndLogDetectors(supabase, { coordinatorCount: 2 }, { env: { COORD_DETECTORS_V2: 'true' }, now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].logged).toBe(false); // logged failed, but no throw
  });
  it('logCoordinationEvent returns {ok:false} on error rather than throwing', async () => {
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) };
    const res = await logCoordinationEvent(supabase, { event_type: 'SPLIT_BRAIN', severity: 'critical' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
  });
});
