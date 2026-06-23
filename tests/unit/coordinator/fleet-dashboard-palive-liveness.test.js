/**
 * SD-REFILL-005M4BN9 + SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 (FR-2) — the fleet-dashboard P(alive)
 * gauge must factor authoritative liveness (armed-silence / PID / process-tick) so a mid-operation
 * worker is not shown as a false 'dying worker' (P(alive)=0.00) that lures a force-release. The
 * reconcile is now a THIN WRAPPER over the shared isSessionAlive SSOT (session-based signature), so
 * the gauge override and the fleet-wide liveness definition can never diverge.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { reconcilePAliveWithLiveness } = require('../../../scripts/fleet-dashboard.cjs');

const NOW = 1_000_000_000_000;
const lowWorker = () => ({ session_id: 'w1', p_alive: 0.0 });

describe('reconcilePAliveWithLiveness() — SSOT-backed gauge override', () => {
  it('overrides P(alive) to 1.0 when within an armed-silence window', () => {
    const session = { expected_silence_until: new Date(NOW + 10 * 60 * 1000).toISOString() };
    const r = reconcilePAliveWithLiveness(lowWorker(), session, { nowMs: NOW });
    expect(r.p_alive).toBe(1);
    expect(r.p_alive_authoritative_override).toBe(true);
    expect(r.p_alive_override_reason).toBe('armed_silence');
  });

  it('overrides P(alive) to 1.0 when PID-alive (injected aliveCcPids)', () => {
    const session = { terminal_id: 'win-cc-1234-99999' };
    const r = reconcilePAliveWithLiveness(lowWorker(), session, { nowMs: NOW, aliveCcPids: new Set(['99999']) });
    expect(r.p_alive).toBe(1);
    expect(r.p_alive_override_reason).toBe('pid_alive');
  });

  it('overrides P(alive) to 1.0 when a fresh process-tick is present', () => {
    const session = { process_alive_at: new Date(NOW - 10 * 1000).toISOString() };
    const r = reconcilePAliveWithLiveness(lowWorker(), session, { nowMs: NOW });
    expect(r.p_alive).toBe(1);
    expect(r.p_alive_override_reason).toBe('process_tick');
  });

  it('returns the worker UNCHANGED (raw p_alive preserved) when no authoritative signal', () => {
    const w = lowWorker();
    const r = reconcilePAliveWithLiveness(w, {}, { nowMs: NOW });
    expect(r).toBe(w); // same reference — no override object created
    expect(r.p_alive).toBe(0.0);
    expect(r.p_alive_authoritative_override).toBeUndefined();
  });

  it('does NOT stamp an override when liveness is raw is_alive or fresh heartbeat (gauge already high)', () => {
    const rawAlive = reconcilePAliveWithLiveness(lowWorker(), { is_alive: true }, { nowMs: NOW });
    expect(rawAlive.p_alive_authoritative_override).toBeUndefined();
    const freshHb = reconcilePAliveWithLiveness(lowWorker(), { heartbeat_age_seconds: 5 }, { nowMs: NOW });
    expect(freshHb.p_alive_authoritative_override).toBeUndefined();
  });

  it('does not mutate the input worker (returns a new object on override)', () => {
    const w = lowWorker();
    const session = { expected_silence_until: new Date(NOW + 60 * 1000).toISOString() };
    const r = reconcilePAliveWithLiveness(w, session, { nowMs: NOW });
    expect(w.p_alive).toBe(0.0); // original untouched
    expect(r).not.toBe(w);
  });

  it('null-safe: passes through null/undefined/non-object without throwing', () => {
    expect(reconcilePAliveWithLiveness(null, {}, { nowMs: NOW })).toBe(null);
    expect(reconcilePAliveWithLiveness(undefined, {}, { nowMs: NOW })).toBe(undefined);
    expect(() => reconcilePAliveWithLiveness(null)).not.toThrow();
  });

  it('preserves other MC fields while overriding p_alive', () => {
    const w = { session_id: 'w9', p_alive: 0.12, eta_minutes: 7, samples: 1000 };
    const session = { expected_silence_until: new Date(NOW + 60 * 1000).toISOString() };
    const r = reconcilePAliveWithLiveness(w, session, { nowMs: NOW });
    expect(r.session_id).toBe('w9');
    expect(r.eta_minutes).toBe(7);
    expect(r.samples).toBe(1000);
    expect(r.p_alive).toBe(1);
  });
});
