/**
 * SD-REFILL-005M4BN9 — fleet-dashboard P(alive) gauge must factor authoritative liveness
 * (armed-silence / PID / process-tick) so a mid-operation worker is not shown as a false
 * 'dying worker' (P(alive)=0.00) that lures the coordinator into a force-release.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { reconcilePAliveWithLiveness } = require('../../../scripts/fleet-dashboard.cjs');

describe('reconcilePAliveWithLiveness() — FR-1/FR-3', () => {
  const lowWorker = () => ({ session_id: 'w1', p_alive: 0.0 });

  it('overrides P(alive) to 1.0 when within an armed-silence window', () => {
    const r = reconcilePAliveWithLiveness(lowWorker(), { silenceArmed: true });
    expect(r.p_alive).toBe(1);
    expect(r.p_alive_authoritative_override).toBe(true);
    expect(r.p_alive_override_reason).toBe('armed_silence');
  });

  it('overrides P(alive) to 1.0 when PID-alive', () => {
    const r = reconcilePAliveWithLiveness(lowWorker(), { pidAlive: true });
    expect(r.p_alive).toBe(1);
    expect(r.p_alive_override_reason).toBe('pid_alive');
  });

  it('overrides P(alive) to 1.0 when a fresh process-tick is present', () => {
    const r = reconcilePAliveWithLiveness(lowWorker(), { tickAlive: true });
    expect(r.p_alive).toBe(1);
    expect(r.p_alive_override_reason).toBe('process_tick');
  });

  it('FR-3: returns the worker UNCHANGED (raw p_alive preserved) when no authoritative signal', () => {
    const w = lowWorker();
    const r = reconcilePAliveWithLiveness(w, { pidAlive: false, tickAlive: false, silenceArmed: false });
    expect(r).toBe(w); // same reference — no override object created
    expect(r.p_alive).toBe(0.0);
    expect(r.p_alive_authoritative_override).toBeUndefined();
  });

  it('does not mutate the input worker (returns a new object on override)', () => {
    const w = lowWorker();
    const r = reconcilePAliveWithLiveness(w, { pidAlive: true });
    expect(w.p_alive).toBe(0.0); // original untouched
    expect(r).not.toBe(w);
  });

  it('reason precedence: pid_alive > process_tick > armed_silence when several are true', () => {
    expect(reconcilePAliveWithLiveness(lowWorker(), { pidAlive: true, tickAlive: true, silenceArmed: true }).p_alive_override_reason).toBe('pid_alive');
    expect(reconcilePAliveWithLiveness(lowWorker(), { tickAlive: true, silenceArmed: true }).p_alive_override_reason).toBe('process_tick');
    expect(reconcilePAliveWithLiveness(lowWorker(), { silenceArmed: true }).p_alive_override_reason).toBe('armed_silence');
  });

  it('null-safe: passes through null/undefined/non-object without throwing', () => {
    expect(reconcilePAliveWithLiveness(null, { pidAlive: true })).toBe(null);
    expect(reconcilePAliveWithLiveness(undefined, { pidAlive: true })).toBe(undefined);
    expect(() => reconcilePAliveWithLiveness(null)).not.toThrow();
  });

  it('preserves other MC fields while overriding p_alive', () => {
    const w = { session_id: 'w9', p_alive: 0.12, eta_minutes: 7, samples: 1000 };
    const r = reconcilePAliveWithLiveness(w, { silenceArmed: true });
    expect(r.session_id).toBe('w9');
    expect(r.eta_minutes).toBe(7);
    expect(r.samples).toBe(1000);
    expect(r.p_alive).toBe(1);
  });
});
