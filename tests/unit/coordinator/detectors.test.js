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
