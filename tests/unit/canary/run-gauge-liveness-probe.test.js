// SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-4)
import { describe, it, expect, vi } from 'vitest';
import { runGaugeLivenessProbe } from '../../../scripts/canary/run-gauge-liveness-probe.mjs';

const APP = { id: 'app-1', name: 'TestVenture', venture_id: 'v-1', metrics_base_url: 'https://example.com', metrics_api_key_ref: 'TEST_KEY' };

/** Records upserts/updates into venture_telemetry and answers the post-pull select. */
function buildSupabase({ telemetryRowAfterPull }) {
  const calls = [];
  return {
    calls,
    from: (table) => {
      if (table !== 'venture_telemetry') throw new Error(`unexpected table: ${table}`);
      return {
        upsert: (row) => { calls.push({ op: 'upsert', row }); return { error: null }; },
        update: (row) => { calls.push({ op: 'update', row }); return { eq: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) }; },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: telemetryRowAfterPull, error: null }) }) }),
      };
    },
  };
}

describe('runGaugeLivenessProbe (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-4)', () => {
  it('passes end-to-end: a successful synthetic pull + fresh telemetry row yields passed:true', async () => {
    const now = new Date('2026-07-10T12:00:00Z');
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ contract_version: '1.0', total: 1, kpis: { signups: 1 } }),
    });
    process.env.TEST_KEY = 'fake-key';
    const supabase = buildSupabase({
      telemetryRowAfterPull: { kpis: { signups: 1 }, pulled_at: now.toISOString(), ingest_status: 'ok' },
    });
    const result = await runGaugeLivenessProbe({ supabase, application: APP, now, fetchFn });
    expect(result.passed).toBe(true);
  });

  it('fails when the endpoint pull itself errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('unreachable'));
    process.env.TEST_KEY = 'fake-key';
    const supabase = buildSupabase({ telemetryRowAfterPull: null });
    const result = await runGaugeLivenessProbe({ supabase, application: APP, fetchFn });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/did not succeed/);
  });

  it('fails when the pull succeeds but the persisted row reads stale against a tight cadence', async () => {
    const now = new Date('2026-07-10T12:00:00Z');
    const fetchFn = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ contract_version: '1.0', total: 1, kpis: { signups: 1 } }),
    });
    process.env.TEST_KEY = 'fake-key';
    const supabase = buildSupabase({
      telemetryRowAfterPull: { kpis: { signups: 1 }, pulled_at: new Date(now.getTime() - 5 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
    });
    const result = await runGaugeLivenessProbe({ supabase, application: APP, now, fetchFn, cadenceHours: 1 });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/did not register end-to-end/);
  });
});
