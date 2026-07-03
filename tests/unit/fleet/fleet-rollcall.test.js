// SD-LEO-FIX-POST-CRASH-FLEET-001 (from QF-20260703-958).
// Regression coverage for the two live specimens: (1) role-singleton matchers must not
// conflate adam/solomon with 'reasoner' just because all three carry metadata.non_fleet=true,
// and (2) a session with a stale updated_at but a recent outbound session_coordination send
// must verdict ALIVE, not DEAD/STALE (the exact false-negative that fooled Adam's coordinator
// liveness probe on 2026-07-03).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fmtAge, computeVerdict, ROLE_SINGLETONS, RECENT_SEND_MS, STALE_WINDOW_MS } =
  require('../../../scripts/fleet-rollcall.cjs');

describe('fleet-rollcall fmtAge', () => {
  const now = Date.parse('2026-07-03T20:00:00Z');
  it('returns "never" for a missing timestamp', () => {
    expect(fmtAge(null, now)).toBe('never');
  });
  it('formats sub-minute ages in seconds', () => {
    expect(fmtAge(new Date(now - 30_000).toISOString(), now)).toBe('30s ago');
  });
  it('formats sub-hour ages in minutes', () => {
    expect(fmtAge(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
  });
  it('formats multi-hour ages in hours', () => {
    expect(fmtAge(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3h ago');
  });
});

describe('fleet-rollcall computeVerdict', () => {
  const now = Date.parse('2026-07-03T20:00:00Z');
  const staleSession = { updated_at: new Date(now - 45 * 60_000).toISOString() };

  it('trusts an ALIVE isSessionAlive result as-is', () => {
    const result = computeVerdict(staleSession, { nowMs: now, liveResult: { alive: true, reason: 'fresh_heartbeat' } });
    expect(result).toEqual({ v: 'ALIVE', reason: 'fresh_heartbeat' });
  });

  it('Specimen 2 regression: a recent outbound coordination send overrides a dead isSessionAlive verdict', () => {
    const sentAt = new Date(now - 60_000).toISOString(); // 1 min ago, well within RECENT_SEND_MS
    const result = computeVerdict(staleSession, { nowMs: now, liveResult: { alive: false }, lastSentAt: sentAt });
    expect(result).toEqual({ v: 'ALIVE', reason: 'recent_coordination_send' });
  });

  it('does not credit a coordination send older than RECENT_SEND_MS', () => {
    const sentAt = new Date(now - RECENT_SEND_MS - 1000).toISOString();
    const result = computeVerdict(staleSession, { nowMs: now, liveResult: { alive: false }, lastSentAt: sentAt });
    expect(result.v).not.toBe('ALIVE');
  });

  it('falls to STALE when updated recently but no live signal fired', () => {
    const recentlyUpdated = { updated_at: new Date(now - 10 * 60_000).toISOString() }; // within STALE_WINDOW_MS
    const result = computeVerdict(recentlyUpdated, { nowMs: now, liveResult: { alive: false } });
    expect(result).toEqual({ v: 'STALE', reason: 'no_live_signal' });
  });

  it('falls to DEAD when outside the stale window with no live signal', () => {
    const oldSession = { updated_at: new Date(now - STALE_WINDOW_MS - 1000).toISOString() };
    const result = computeVerdict(oldSession, { nowMs: now, liveResult: { alive: false } });
    expect(result).toEqual({ v: 'DEAD', reason: null });
  });
});

describe('fleet-rollcall ROLE_SINGLETONS matchers', () => {
  const byKey = Object.fromEntries(ROLE_SINGLETONS.map(r => [r.key, r]));
  const adam = { session_id: 'a1', metadata: { role: 'adam', non_fleet: true } };
  const solomon = { session_id: 's1', metadata: { role: 'solomon', non_fleet: true } };
  const reasonerA = { session_id: 'r1', metadata: { role: 'sprint-reasoner-A', non_fleet: true } };
  const reasonerB = { session_id: 'r2', metadata: { role: 'sprint-reasoner-B', non_fleet: true } };
  const coordinator = { session_id: 'c1', metadata: { is_coordinator: true } };
  const worker = { session_id: 'w1', metadata: { fleet_identity: { callsign: 'Echo' } } };

  it('regression: reasoner does NOT match adam or solomon despite shared non_fleet=true', () => {
    expect(byKey.reasoner.match(adam)).toBe(false);
    expect(byKey.reasoner.match(solomon)).toBe(false);
  });

  it('reasoner matches sprint-reasoner-A/-B by role prefix', () => {
    expect(byKey.reasoner.match(reasonerA)).toBe(true);
    expect(byKey.reasoner.match(reasonerB)).toBe(true);
  });

  it('adam/solomon match only their own role, not each other or a plain worker', () => {
    expect(byKey.adam.match(adam)).toBe(true);
    expect(byKey.adam.match(solomon)).toBe(false);
    expect(byKey.solomon.match(solomon)).toBe(true);
    expect(byKey.solomon.match(worker)).toBe(false);
  });

  it('coordinator matches via metadata.is_coordinator or a session_id equal to the resolved coordinator id', () => {
    expect(byKey.coordinator.match(coordinator, 'someone-else')).toBe(true);
    expect(byKey.coordinator.match(worker, 'w1')).toBe(true);
    expect(byKey.coordinator.match(worker, 'someone-else')).toBe(false);
  });

  it('coordinator/adam/solomon are strict singletons; reasoner is not', () => {
    expect(byKey.coordinator.strict).toBe(true);
    expect(byKey.adam.strict).toBe(true);
    expect(byKey.solomon.strict).toBe(true);
    expect(byKey.reasoner.strict).toBe(false);
  });
});
