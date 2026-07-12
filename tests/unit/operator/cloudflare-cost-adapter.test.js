/**
 * Unit tests for the Cloudflare cost adapter (SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1).
 * Mirrors tests/unit/venture-acquisition/registrar-adapter.test.js's shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCloudflareCostAdapter } from '../../../lib/operator/cloudflare-cost-adapter.js';

describe('createCloudflareCostAdapter — credential gate', () => {
  it('returns null when CLOUDFLARE_API_TOKEN is absent', () => {
    const adapter = createCloudflareCostAdapter({ CLOUDFLARE_ACCOUNT_ID: 'acct-1' });
    expect(adapter).toBeNull();
  });

  it('returns null when CLOUDFLARE_ACCOUNT_ID is absent', () => {
    const adapter = createCloudflareCostAdapter({ CLOUDFLARE_API_TOKEN: 'tok' });
    expect(adapter).toBeNull();
  });

  it('returns null when both are absent (the real, current state for ApexNiche AI)', () => {
    const adapter = createCloudflareCostAdapter({});
    expect(adapter).toBeNull();
  });

  it('returns a live adapter when both credentials are present', () => {
    const adapter = createCloudflareCostAdapter(
      { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct-1' },
      { fetchImpl: vi.fn() },
    );
    expect(adapter).not.toBeNull();
    expect(typeof adapter.readWorkersUsage).toBe('function');
    expect(typeof adapter.readAiGatewayCost).toBe('function');
  });
});

describe('readWorkersUsage', () => {
  it('POSTs a GraphQL query with the account tag and date range, never leaking the token in the body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } } }),
    }));
    const adapter = createCloudflareCostAdapter({ CLOUDFLARE_API_TOKEN: 'secret-tok', CLOUDFLARE_ACCOUNT_ID: 'acct-1' }, { fetchImpl });
    await adapter.readWorkersUsage('2026-06-12', '2026-07-12');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(opts.headers.authorization).toBe('Bearer secret-tok');
    expect(opts.body).not.toContain('secret-tok');
    expect(opts.body).toContain('acct-1');
  });

  it('throws a sanitized error on a GraphQL error response, never echoing the token', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: 'invalid account tag' }] }),
    }));
    const adapter = createCloudflareCostAdapter({ CLOUDFLARE_API_TOKEN: 'secret-tok', CLOUDFLARE_ACCOUNT_ID: 'acct-1' }, { fetchImpl });
    await expect(adapter.readWorkersUsage('2026-06-12', '2026-07-12')).rejects.toThrow('invalid account tag');
    await expect(adapter.readWorkersUsage('2026-06-12', '2026-07-12')).rejects.not.toThrow(/secret-tok/);
  });
});

describe('readAiGatewayCost', () => {
  it('GETs the gateway logs endpoint with start_date/end_date query params', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, result: [{ cost: 0.5 }] }) }));
    const adapter = createCloudflareCostAdapter({ CLOUDFLARE_API_TOKEN: 'secret-tok', CLOUDFLARE_ACCOUNT_ID: 'acct-1' }, { fetchImpl });
    await adapter.readAiGatewayCost('gw-1', '2026-06-12', '2026-07-12');
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toContain('/accounts/acct-1/ai-gateway/gateways/gw-1/logs');
    expect(url).toContain('start_date=2026-06-12');
    expect(url).toContain('end_date=2026-07-12');
    expect(opts.method).toBe('GET');
  });

  it('throws on a 404 (no gateway configured yet) — the caller decides this means unattested', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ success: false, errors: [{ message: 'gateway not found' }] }) }));
    const adapter = createCloudflareCostAdapter({ CLOUDFLARE_API_TOKEN: 'secret-tok', CLOUDFLARE_ACCOUNT_ID: 'acct-1' }, { fetchImpl });
    await expect(adapter.readAiGatewayCost('gw-missing', '2026-06-12', '2026-07-12')).rejects.toThrow('gateway not found');
  });
});
