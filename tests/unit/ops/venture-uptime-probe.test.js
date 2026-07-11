/**
 * SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 FR-4
 * Pure-logic tests for the uptime probe's threshold state machine (no network/DB).
 */
import { describe, it, expect, vi } from 'vitest';
import { checkReachability, computeNextProbeState, CONSTANTS } from '../../../lib/ops/venture-uptime-probe.js';

describe('computeNextProbeState (pure state machine)', () => {
  it('starts at 0 consecutive failures on a first successful check with no prior state', () => {
    const { probe, justSurfacedUnreachable } = computeNextProbeState(null, { reachable: true, statusCode: 200, error: null }, '2026-07-11T00:00:00Z');
    expect(probe.consecutive_failures).toBe(0);
    expect(probe.surfaced).toBe(false);
    expect(justSurfacedUnreachable).toBe(false);
  });

  it('does NOT surface unreachable after a single failed check (avoids transient-blip false positives)', () => {
    const { probe, justSurfacedUnreachable } = computeNextProbeState(null, { reachable: false, statusCode: null, error: 'ECONNREFUSED' }, '2026-07-11T00:00:00Z');
    expect(probe.consecutive_failures).toBe(1);
    expect(probe.surfaced).toBe(false);
    expect(justSurfacedUnreachable).toBe(false);
  });

  it('surfaces unreachable on the 2nd consecutive failure (threshold)', () => {
    const first = computeNextProbeState(null, { reachable: false, statusCode: null, error: 'timeout' }, '2026-07-11T00:00:00Z');
    const second = computeNextProbeState(first.probe, { reachable: false, statusCode: null, error: 'timeout' }, '2026-07-11T00:05:00Z');
    expect(second.probe.consecutive_failures).toBe(2);
    expect(second.probe.surfaced).toBe(true);
    expect(second.justSurfacedUnreachable).toBe(true);
  });

  it('only reports justSurfacedUnreachable on the crossing check, not on subsequent still-down checks', () => {
    const c1 = computeNextProbeState(null, { reachable: false, statusCode: null, error: 'e' }, 't1');
    const c2 = computeNextProbeState(c1.probe, { reachable: false, statusCode: null, error: 'e' }, 't2');
    const c3 = computeNextProbeState(c2.probe, { reachable: false, statusCode: null, error: 'e' }, 't3');
    expect(c2.justSurfacedUnreachable).toBe(true);
    expect(c3.probe.surfaced).toBe(true);
    expect(c3.justSurfacedUnreachable).toBe(false);
  });

  it('resets consecutive_failures to 0 immediately on a successful check after failures', () => {
    const c1 = computeNextProbeState(null, { reachable: false, statusCode: null, error: 'e' }, 't1');
    const c2 = computeNextProbeState(c1.probe, { reachable: false, statusCode: null, error: 'e' }, 't2');
    expect(c2.probe.surfaced).toBe(true);
    const c3 = computeNextProbeState(c2.probe, { reachable: true, statusCode: 200, error: null }, 't3');
    expect(c3.probe.consecutive_failures).toBe(0);
    expect(c3.probe.surfaced).toBe(false);
  });
});

describe('checkReachability', () => {
  it('reports reachable=true for a 2xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 200 });
    const result = await checkReachability('https://example.test', { fetchFn });
    expect(result.reachable).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it('reports reachable=true for a 4xx response (server is up, just rejecting the request)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 404 });
    const result = await checkReachability('https://example.test', { fetchFn });
    expect(result.reachable).toBe(true);
  });

  it('reports reachable=false for a 5xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 503 });
    const result = await checkReachability('https://example.test', { fetchFn });
    expect(result.reachable).toBe(false);
  });

  it('reports reachable=false and captures the error when fetch rejects (network failure)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await checkReachability('https://dead.test', { fetchFn });
    expect(result.reachable).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('exposes the 2-consecutive-failure threshold as a named constant (matches SD risk mitigation)', () => {
    expect(CONSTANTS.CONSECUTIVE_FAILURE_THRESHOLD).toBe(2);
  });
});
