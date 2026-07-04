// SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyExternalObservation, collectExternalObservations } from '../../../lib/eva/external-observation.js';

describe('verifyExternalObservation (pure, SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 FR-2)', () => {
  it('verified:true only when all 3 checks pass', () => {
    const result = verifyExternalObservation({ endpointStatus: 200, billingProductId: 'prod_123', telemetryRowCount: 5 });
    expect(result.verified).toBe(true);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((c) => c.verified)).toBe(true);
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
  afterEach(() => { global.fetch = originalFetch; });

  function buildSupabase({ row, error = null } = {}) {
    const chain = { eq: () => chain, maybeSingle: async () => ({ data: row, error }) };
    return { from: () => ({ select: () => chain }) };
  }

  it('returns endpointStatus from a successful fetch and billingProductId from application.metadata', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({ row: { deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' } } });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-1' });
    expect(result.endpointStatus).toBe(200);
    expect(result.billingProductId).toBe('prod_123');
    expect(result.telemetryRowCount).toBeNull();
  });

  it('returns endpointStatus=null on a fetch error rather than throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network unreachable'));
    const supabase = buildSupabase({ row: { deployment_url: 'https://example.com', metadata: {} } });
    const result = await collectExternalObservations({ supabase, ventureId: 'venture-1' });
    expect(result.endpointStatus).toBeNull();
  });

  it('returns endpointStatus=null and billingProductId=null when no application row exists', async () => {
    global.fetch = vi.fn();
    const supabase = buildSupabase({ row: null });
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
    });
  });
});
