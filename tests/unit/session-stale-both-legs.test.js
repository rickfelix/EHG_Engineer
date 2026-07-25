/**
 * QF-20260724-652 — the staleness sweep must never release a live worker.
 *
 * Witnessed live 2026-07-25: 3 of 16 workers sat in undispatchable limbo (Charlie
 * stale, Alpha-3/-4 released/STALE_CLEANUP) while their heartbeat_at was SECONDS
 * fresh. The PID leg reported PID_NOT_FOUND with process_alive_at frozen ~46min,
 * and the sweep trusted that leg alone. Releasing now requires BOTH a dead-PID
 * probe AND a stale heartbeat — heartbeat is the leg a stale PID probe cannot fake.
 *
 * Pure predicate only — no claude_sessions access, matching the convention in
 * stale-session-sweep-dormancy-gate.test.js.
 */
import { describe, it, expect } from 'vitest';
import { isSessionStale } from '../../lib/session-manager.mjs';

const STALE = 900; // lib/session-manager.mjs STALE_THRESHOLD_SECONDS

describe('isSessionStale — both-legs rule', () => {
  it('REGRESSION: does not release a seconds-fresh heartbeat on a dead PID probe alone', () => {
    // The exact Alpha-3/-4 shape: PID probe says gone, heartbeat says alive.
    expect(isSessionStale({ heartbeatAgeSeconds: 3, pidAlive: false })).toBe(false);
  });

  it('does not release when the PID is alive, however old the heartbeat', () => {
    expect(isSessionStale({ heartbeatAgeSeconds: STALE * 10, pidAlive: true })).toBe(false);
  });

  it('releases only when BOTH legs report dead', () => {
    expect(isSessionStale({ heartbeatAgeSeconds: STALE + 1, pidAlive: false })).toBe(true);
  });

  it('holds the session at exactly the threshold (strictly-greater boundary)', () => {
    expect(isSessionStale({ heartbeatAgeSeconds: STALE, pidAlive: false })).toBe(false);
  });

  it('fails safe when the heartbeat age is unknown — never releases on the PID leg alone', () => {
    // A missing/corrupt heartbeat_at yields NaN; that must not become a release.
    expect(isSessionStale({ heartbeatAgeSeconds: NaN, pidAlive: false })).toBe(false);
    expect(isSessionStale({ heartbeatAgeSeconds: Infinity, pidAlive: false })).toBe(false);
  });

  it('honours a caller-supplied threshold', () => {
    expect(isSessionStale({ heartbeatAgeSeconds: 60, pidAlive: false, staleThresholdSeconds: 30 })).toBe(true);
    expect(isSessionStale({ heartbeatAgeSeconds: 20, pidAlive: false, staleThresholdSeconds: 30 })).toBe(false);
  });
});
