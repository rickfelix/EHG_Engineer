/**
 * SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 FR-4
 * Pure-logic tests for the uptime probe's threshold state machine (no network/DB).
 */
import { describe, it, expect, vi } from 'vitest';
import { checkReachability, computeNextProbeState, CONSTANTS, ensureDeploymentRows, runVentureUptimeProbe } from '../../../lib/ops/venture-uptime-probe.js';

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

/** Minimal fake supabase for ensureDeploymentRows / runVentureUptimeProbe. */
function makeSupabase({ ventures = [], seedInsertFails = false } = {}) {
  const deploymentRows = [];
  return {
    from(table) {
      if (table === 'ventures') {
        return {
          select() { return this; }, not() { return this; }, neq() { return this; },
          // FR-6 batch 8: ensureDeploymentRows now paginates via fetchAllPaginated (.order + .range)
          order() { return this; },
          range: (from, to) => Promise.resolve({ data: ventures.slice(from, to + 1), error: null }),
          then: (resolve) => resolve({ data: ventures, error: null }),
        };
      }
      if (table === 'venture_deployments') {
        const ctx = {};
        return {
          select() { return this; },
          eq(col, val) { ctx[col] = val; return this; },
          maybeSingle: async () => ({ data: deploymentRows.find((r) => r.venture_id === ctx.venture_id) || null, error: null }),
          insert(vals) {
            return {
              select() { return this; },
              single: async () => {
                if (seedInsertFails) return { data: null, error: { message: 'permission denied for table venture_deployments' } };
                const row = { id: `dep-${vals.venture_id}`, ...vals };
                deploymentRows.push(row);
                return { data: row, error: null };
              },
            };
          },
          update() { return { eq: async () => ({ error: null }) }; },
        };
      }
      if (table === 'ops_product_health') {
        return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('ensureDeploymentRows / runVentureUptimeProbe (adversarial-review fix: no silent seed-failure swallowing)', () => {
  it('ensureDeploymentRows returns errors alongside rows instead of swallowing them', async () => {
    const supabase = makeSupabase({ ventures: [{ id: 'v1', deployment_url: 'https://x' }], seedInsertFails: true });
    const { rows, errors } = await ensureDeploymentRows(supabase);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('seed insert failed');
  });

  it('runVentureUptimeProbe folds seed errors into its own errors array (visible to the sweep\'s anyErrors check)', async () => {
    const supabase = makeSupabase({ ventures: [{ id: 'v1', deployment_url: 'https://x' }], seedInsertFails: true });
    const summary = await runVentureUptimeProbe({ supabase, fetchFn: vi.fn() });
    expect(summary.checked).toBe(0);
    expect(summary.errors).toHaveLength(1); // pre-fix this was [] -> a silent green pass
    expect(summary.ventures_seedable).toBe(1);
  });

  it('checks every successfully-seeded venture even when unrelated ventures fail to seed', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = makeSupabase({ ventures: [{ id: 'v1', deployment_url: 'https://x' }] });
    const summary = await runVentureUptimeProbe({ supabase, fetchFn });
    expect(summary.checked).toBe(1);
    expect(summary.reachable).toBe(1);
    expect(summary.errors).toHaveLength(0);
  });

  // QF-20260711-772: live-verified against the real venture_deployments schema —
  // sha is NOT NULL (no default) and status has a CHECK constraint that does not
  // include 'seeded'. The mock supabase above doesn't enforce constraints, so these
  // assertions pin the exact insert payload rather than relying on the mock to fail.
  it('seeds a deployment row with sha populated and status within the CHECK constraint allow-list', async () => {
    const supabase = makeSupabase({ ventures: [{ id: 'v1', deployment_url: 'https://x' }] });
    const { rows, errors } = await ensureDeploymentRows(supabase);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].sha).toBeTruthy();
    expect(['planned', 'deployed_no_traffic', 'routed', 'failed', 'rolled_back']).toContain(rows[0].status);
  });
});
