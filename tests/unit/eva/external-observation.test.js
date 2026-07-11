// SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyExternalObservation, collectExternalObservations } from '../../../lib/eva/external-observation.js';

describe('verifyExternalObservation (pure, SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 FR-2)', () => {
  it('verified:true only when all 4 checks pass', () => {
    const result = verifyExternalObservation({ endpointStatus: 200, billingProductId: 'prod_123', telemetryRowCount: 5, gaugeWriterAlive: true });
    expect(result.verified).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.verified)).toBe(true);
  });

  it('fails (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-5) when gaugeWriterAlive is false even though the other 3 checks pass', () => {
    const result = verifyExternalObservation({ endpointStatus: 200, billingProductId: 'prod_123', telemetryRowCount: 5, gaugeWriterAlive: false });
    expect(result.verified).toBe(false);
    const gaugeCheck = result.checks.find((c) => c.name === 'gauge_writer_alive');
    expect(gaugeCheck.verified).toBe(false);
    expect(gaugeCheck.reason).toMatch(/not currently live/);
  });

  it('fails closed (verified:false, reason NO_DATA_SOURCE) when inputs are missing — never silently passes', () => {
    const result = verifyExternalObservation({});
    expect(result.verified).toBe(false);
    expect(result.checks.every((c) => c.reason === 'NO_DATA_SOURCE')).toBe(true);
  });

  it('fails when endpoint status is not 200', () => {
    const result = verifyExternalObservation({ endpointStatus: 500, billingProductId: 'prod_123', telemetryRowCount: 5 });
    expect(result.verified).toBe(false);
    const endpointCheck = result.checks.find((c) => c.name === 'endpoint_200');
    expect(endpointCheck.verified).toBe(false);
    expect(endpointCheck.reason).toMatch(/500/);
  });

  it('fails when billingProductId is an empty string', () => {
    const result = verifyExternalObservation({ endpointStatus: 200, billingProductId: '', telemetryRowCount: 5 });
    expect(result.verified).toBe(false);
    expect(result.checks.find((c) => c.name === 'billing_product_exists').verified).toBe(false);
  });

  it('fails when telemetryRowCount is 0', () => {
    const result = verifyExternalObservation({ endpointStatus: 200, billingProductId: 'prod_123', telemetryRowCount: 0 });
    expect(result.verified).toBe(false);
    const telemetryCheck = result.checks.find((c) => c.name === 'telemetry_rows_arrive');
    expect(telemetryCheck.verified).toBe(false);
    expect(telemetryCheck.reason).toBe('zero telemetry rows');
  });

  it('called with no args does not throw and fails closed', () => {
    expect(() => verifyExternalObservation()).not.toThrow();
    expect(verifyExternalObservation().verified).toBe(false);
  });
});

describe('collectExternalObservations (I/O boundary, SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 FR-2)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers(); // no-op/safe when a test never called useFakeTimers
  });

  /** Routes by table name so applications + venture_telemetry can return distinct rows. */
  function buildSupabase({ applicationRow, telemetryRow, applicationError = null, telemetryError = null } = {}) {
    return {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => (table === 'applications'
              ? { data: applicationRow, error: applicationError }
              : { data: telemetryRow, error: telemetryError }),
          }),
        }),
      }),
    };
  }

  it('returns endpointStatus from a successful fetch and billingProductId from application.metadata (no application.id — telemetry lookup skipped)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({ applicationRow: { deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' } } });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-1' });
    expect(result.endpointStatus).toBe(200);
    expect(result.billingProductId).toBe('prod_123');
    expect(result.telemetryRowCount).toBeNull();
    expect(result.gaugeWriterAlive).toBeNull();
  });

  it('returns endpointStatus=null on a fetch error rather than throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network unreachable'));
    const supabase = buildSupabase({ applicationRow: { deployment_url: 'https://example.com', metadata: {} } });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-1' });
    expect(result.endpointStatus).toBeNull();
  });

  it('returns endpointStatus=null and billingProductId=null when no application row exists', async () => {
    global.fetch = vi.fn();
    const supabase = buildSupabase({ applicationRow: null });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-1' });
    expect(result.endpointStatus).toBeNull();
    expect(result.billingProductId).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not throw when the supabase query itself errors', async () => {
    const supabase = { from: () => { throw new Error('boom'); } };
    await expect(collectExternalObservations({ supabase, ventureId: 'venture-1' })).resolves.toEqual({
      endpointStatus: null,
      billingProductId: null,
      telemetryRowCount: null,
      gaugeWriterAlive: null,
    });
  });

  it('SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-5: gaugeWriterAlive:true and telemetryRowCount:1 for a venture with a fresh ok pull', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const now = new Date('2026-07-10T12:00:00Z');
    // Freeze the clock: collectExternalObservations does not thread an
    // injectable `now` down to computeGaugeState (it always defaults to real
    // `new Date()`), so without this the "2h stale" fixture below drifts
    // further stale every day this test runs relative to the real wall
    // clock, and eventually exceeds the module's cadence window and fails.
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const supabase = buildSupabase({
      applicationRow: { id: 'app-1', deployment_url: 'https://example.com', metadata: {}, metrics_cadence_hours: null },
      telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
    });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-1' });
    expect(result.telemetryRowCount).toBe(1);
    expect(result.gaugeWriterAlive).toBe(true);
  });

  it('SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-5: gaugeWriterAlive:false for a venture whose writer has never landed real data', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({
      applicationRow: { id: 'app-2', deployment_url: 'https://example.com', metadata: {}, metrics_cadence_hours: null },
      telemetryRow: null,
    });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-2' });
    expect(result.telemetryRowCount).toBe(0);
    expect(result.gaugeWriterAlive).toBe(false);
  });

  it('SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A FR-5: honors a per-venture metrics_cadence_hours override', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({
      applicationRow: { id: 'app-3', deployment_url: 'https://example.com', metadata: {}, metrics_cadence_hours: 1 },
      telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
    });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-3' });
    // 5h stale against a 1h declared cadence -> not alive, even though the module default (30h) would have passed it.
    expect(result.gaugeWriterAlive).toBe(false);
  });
});
