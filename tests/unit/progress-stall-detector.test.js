/**
 * Progress-stall detector (DUTY-8) tests — SD-LEO-INFRA-PROGRESS-STALL-DETECTION-001.
 * PURE: injected clock + injected canonical predicate (real detectStuckWorker for genuine integration; a stub
 * to prove the INJECTED predicate is what decides) + injected armed-silence check. Zero live DB.
 */
import { describe, it, expect, vi } from 'vitest';
import { detectProgressStall } from '../../lib/coordinator/charter-audit-detectors.mjs';
import detectorsPkg from '../../lib/coordinator/detectors.cjs';
import silenceCap from '../../lib/fleet/silence-cap.cjs';
const { detectStuckWorker } = detectorsPkg;
// Use the REAL canonical armed-silence check (NOT a loose inline stub) — it is hard-capped at ~30min, so tests
// exercise the production behavior, including that armed-silence canNOT cover a multi-hour stall threshold.
const { isWithinArmedSilenceWindow: isWithinArmedSilence } = silenceCap;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

const baseOpts = (over = {}) => ({
  nowMs: NOW,
  thresholdMs: HOUR,
  isWithinArmedSilence,
  detectStuck: detectStuckWorker,
  ...over,
});

// A live (fresh-heartbeat) session holding sd_key, not in armed-silence.
const liveSession = (sd_key, over = {}) => ({ session_id: 's-' + sd_key, sd_key, heartbeat_at: ago(1 * MIN), expected_silence_until: null, ...over });
const sd = (sd_key, updatedMsAgo, phase = 'EXEC') => ({ sd_key, updated_at: ago(updatedMsAgo), current_phase: phase });

describe('detectProgressStall — fires on alive-but-frozen', () => {
  it('flags a fresh-heartbeat worker whose claimed SD is stale beyond threshold', () => {
    const r = detectProgressStall(baseOpts({ liveSessions: [liveSession('SD-A')], sds: [sd('SD-A', 2 * HOUR)] }));
    expect(r.violation).toBe(true);
    expect(r.stalledCount).toBe(1);
    expect(r.samples[0].sd_key).toBe('SD-A');
    expect(r.samples[0].phase).toBe('EXEC');
    expect(r.samples[0].ageHours).toBe(2);
    expect(r.remediation).toMatch(/checkpoint/i);
  });
});

describe('detectProgressStall — does NOT fire', () => {
  it('SD updated recently (within threshold) → progressing', () => {
    const r = detectProgressStall(baseOpts({ liveSessions: [liveSession('SD-A')], sds: [sd('SD-A', 10 * MIN)] }));
    expect(r.violation).toBe(false);
  });
  it('worker in a CURRENT armed-silence window (within the ~30min cap) is excluded even if SD is stale', () => {
    const parked = liveSession('SD-A', { expected_silence_until: new Date(NOW + 20 * MIN).toISOString() });
    expect(detectProgressStall(baseOpts({ liveSessions: [parked], sds: [sd('SD-A', 5 * HOUR)] })).violation).toBe(false);
  });
  it('PS-1: an EXPIRED armed-silence window does NOT protect a long stall (silence cap < threshold) → fires', () => {
    // armed-silence only covers the window duration (hard-capped ~30min); once expired it cannot shield a multi-hour
    // stall — so the conservative THRESHOLD (not armed-silence) is the real guard. A worker whose window lapsed and
    // whose SD has been frozen 5h is correctly flagged.
    const lapsed = liveSession('SD-A', { expected_silence_until: new Date(NOW - 10 * MIN).toISOString() });
    expect(detectProgressStall(baseOpts({ liveSessions: [lapsed], sds: [sd('SD-A', 5 * HOUR)] })).violation).toBe(true);
  });
  it('worker not ACTIVELY heartbeating (heartbeat older than freshMs) is excluded', () => {
    const stale = liveSession('SD-A', { heartbeat_at: ago(30 * MIN) });
    expect(detectProgressStall(baseOpts({ liveSessions: [stale], sds: [sd('SD-A', 5 * HOUR)] })).violation).toBe(false);
  });
  it('session with no sd_key, or claimed SD absent/terminal (not in sds), is excluded', () => {
    const noClaim = { session_id: 's-x', heartbeat_at: ago(1 * MIN) };
    expect(detectProgressStall(baseOpts({ liveSessions: [noClaim], sds: [sd('SD-A', 5 * HOUR)] })).violation).toBe(false);
    // claims SD-GONE but it is not in sds (terminal/absent) → excluded
    expect(detectProgressStall(baseOpts({ liveSessions: [liveSession('SD-GONE')], sds: [sd('SD-A', 5 * HOUR)] })).violation).toBe(false);
  });
});

describe('detectProgressStall — reuses the INJECTED canonical predicate (no re-derivation)', () => {
  it('an injected predicate returning matched:false suppresses the violation despite stale timestamps', () => {
    const stub = vi.fn(() => ({ matched: false, reason: 'stub', evidence: {} }));
    const r = detectProgressStall(baseOpts({ liveSessions: [liveSession('SD-A')], sds: [sd('SD-A', 9 * HOUR)], detectStuck: stub }));
    expect(stub).toHaveBeenCalledTimes(1);
    // the claim fed to the predicate carries heartbeat_at:null so the predicate keys purely on SD progress
    expect(stub.mock.calls[0][0].claims[0]).toMatchObject({ sd_key: 'SD-A', heartbeat_at: null });
    expect(r.violation).toBe(false);
  });
  it('PS-3: pins the relied-on detectStuckWorker contract — a heartbeat_at:null claim keys PURELY on sd_updated_at', () => {
    // The whole reuse trick depends on this: with heartbeat nulled, MAX(heartbeat,sd_updated) collapses to
    // sd_updated, so a STALE sd_updated_at matches and a FRESH one does not — regardless of any heartbeat.
    const stale = detectStuckWorker({ claims: [{ sd_key: 'SD-A', session_id: 's1', heartbeat_at: null, sd_updated_at: ago(3 * HOUR), current_phase: 'EXEC' }], now: NOW, thresholdMs: HOUR });
    expect(stale.matched).toBe(true);
    const fresh = detectStuckWorker({ claims: [{ sd_key: 'SD-A', session_id: 's1', heartbeat_at: null, sd_updated_at: ago(10 * MIN), current_phase: 'EXEC' }], now: NOW, thresholdMs: HOUR });
    expect(fresh.matched).toBe(false);
  });
  it('an injected predicate returning matched:true drives the violation (adapter maps evidence)', () => {
    const stub = vi.fn(() => ({ matched: true, reason: 'x', evidence: { stuck_count: 1, samples: [{ sd_key: 'SD-A', phase: 'EXEC', age_ms: 3 * HOUR }] } }));
    const r = detectProgressStall(baseOpts({ liveSessions: [liveSession('SD-A')], sds: [sd('SD-A', 3 * HOUR)], detectStuck: stub }));
    expect(r.violation).toBe(true);
    expect(r.samples[0]).toMatchObject({ sd_key: 'SD-A', ageHours: 3 });
  });
});

describe('detectProgressStall — fail-open', () => {
  it('no detectStuck predicate → no violation, never throws', () => {
    expect(detectProgressStall({ liveSessions: [liveSession('SD-A')], sds: [sd('SD-A', 5 * HOUR)], nowMs: NOW }).violation).toBe(false);
  });
  it('non-array sessions / NaN clock → no violation', () => {
    expect(detectProgressStall(baseOpts({ liveSessions: 'nope', sds: [] })).violation).toBe(false);
    expect(detectProgressStall(baseOpts({ liveSessions: [], sds: [], nowMs: NaN })).violation).toBe(false);
  });
  it('a predicate that THROWS is caught (fail-open)', () => {
    const boom = () => { throw new Error('predicate boom'); };
    expect(() => detectProgressStall(baseOpts({ liveSessions: [liveSession('SD-A')], sds: [sd('SD-A', 5 * HOUR)], detectStuck: boom }))).not.toThrow();
    expect(detectProgressStall(baseOpts({ liveSessions: [liveSession('SD-A')], sds: [sd('SD-A', 5 * HOUR)], detectStuck: boom })).violation).toBe(false);
  });
  it('empty inputs → no violation', () => {
    expect(detectProgressStall(baseOpts({ liveSessions: [], sds: [] })).violation).toBe(false);
  });
});
