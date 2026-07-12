/**
 * Unit tests for scripts/operator/feed-venture-operating-burn.mjs
 * (SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1).
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  main,
  parseFlag,
  estimateInfraCostUsd,
  sumWorkersUsage,
  sumAiGatewayCost,
} from '../../../scripts/operator/feed-venture-operating-burn.mjs';

describe('parseFlag', () => {
  it('extracts a --flag <value> pair', () => {
    expect(parseFlag(['node', 'script.mjs', '--venture-id', 'v-1'], '--venture-id')).toBe('v-1');
  });
  it('returns null when the flag is absent', () => {
    expect(parseFlag(['node', 'script.mjs'], '--venture-id')).toBeNull();
  });
  it('returns null when the flag is the last argv element with no value', () => {
    expect(parseFlag(['node', 'script.mjs', '--venture-id'], '--venture-id')).toBeNull();
  });
});

describe('estimateInfraCostUsd', () => {
  it('returns null for missing/malformed usage (never fabricates)', () => {
    expect(estimateInfraCostUsd(null)).toBeNull();
    expect(estimateInfraCostUsd(undefined)).toBeNull();
  });
  it('prices requests and cpuMs at the published per-million rate', () => {
    const usd = estimateInfraCostUsd({ requests: 2_000_000, cpuMs: 0 });
    expect(usd).toBeCloseTo(0.6, 4); // 2M requests * $0.30/M
  });
  it('zero usage prices to $0 (a real, honest zero — not withheld)', () => {
    expect(estimateInfraCostUsd({ requests: 0, cpuMs: 0 })).toBe(0);
  });
});

describe('sumWorkersUsage', () => {
  it('sums requests across all dimension rows', () => {
    const data = { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 100 } }, { sum: { requests: 50 } }] }] } };
    expect(sumWorkersUsage(data)).toEqual({ requests: 150, cpuMs: 0 });
  });
  it('returns null (unattested) on an empty/malformed shape, never a fabricated zero (never throws)', () => {
    expect(sumWorkersUsage(null)).toBeNull();
    expect(sumWorkersUsage({})).toBeNull();
    expect(sumWorkersUsage({ viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } })).toBeNull();
  });
  it('a row with an explicit zero-request count is a genuine live zero, not withheld', () => {
    const data = { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 0 } }] }] } };
    expect(sumWorkersUsage(data)).toEqual({ requests: 0, cpuMs: 0 });
  });
});

describe('sumAiGatewayCost', () => {
  it('sums the cost field across log entries', () => {
    expect(sumAiGatewayCost([{ cost: 0.1 }, { cost: 0.2 }])).toBeCloseTo(0.3, 4);
  });
  it('returns null for an empty or non-array logs result (unattested, not zero)', () => {
    expect(sumAiGatewayCost([])).toBeNull();
    expect(sumAiGatewayCost(null)).toBeNull();
    expect(sumAiGatewayCost(undefined)).toBeNull();
  });
  it('ignores entries with no numeric cost field but returns null if none had one', () => {
    expect(sumAiGatewayCost([{ id: 'a' }, { id: 'b' }])).toBeNull();
  });
});

function fakeSupabaseSpy() {
  const upserts = [];
  return {
    upserts,
    from: (table) => ({
      upsert: (row) => { upserts.push({ table, row }); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; },
    }),
  };
}

describe('main — fail-soft integration', () => {
  it('throws if --venture-id or --source-application is missing', async () => {
    await expect(main({ argv: ['node', 'x.mjs'] })).rejects.toThrow('--venture-id');
    await expect(main({ argv: ['node', 'x.mjs', '--venture-id', 'v-1'] })).rejects.toThrow('--source-application');
  });

  it('degrades both inputs to unattested when Cloudflare credentials are absent (the real current state)', async () => {
    const supabase = fakeSupabaseSpy();
    const result = await main({
      argv: ['node', 'x.mjs', '--venture-id', 'v-1', '--source-application', 'apex_niche_ai'],
      env: {},
      supabase,
      cloudflareAdapterFactory: () => null,
    });
    expect(result.infra.written).toBe(false);
    expect(result.ai.written).toBe(false);
    expect(result.ai.status).toBe('unattested');
    expect(supabase.upserts.length).toBe(0);
  });

  it('writes a measured infra cost and leaves AI unattested when no gateway is configured', async () => {
    const supabase = fakeSupabaseSpy();
    const cf = {
      readWorkersUsage: vi.fn(async () => ({ viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 1_000_000 } }] }] } })),
      readAiGatewayCost: vi.fn(),
    };
    const result = await main({
      argv: ['node', 'x.mjs', '--venture-id', 'v-1', '--source-application', 'apex_niche_ai'],
      env: { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct' },
      supabase,
      cloudflareAdapterFactory: () => cf,
    });
    expect(result.infra.written).toBe(true);
    expect(result.infra.value_usd).toBeCloseTo(0.3, 4);
    expect(result.ai.status).toBe('unattested');
    expect(cf.readAiGatewayCost).not.toHaveBeenCalled();
    expect(supabase.upserts.map((u) => u.table)).toEqual(['venture_operating_burn']);
  });

  it('F6: an empty Workers usage dataset leaves infra unattested, never an attested $0', async () => {
    const supabase = fakeSupabaseSpy();
    const cf = {
      readWorkersUsage: vi.fn(async () => ({ viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } })),
      readAiGatewayCost: vi.fn(),
    };
    const result = await main({
      argv: ['node', 'x.mjs', '--venture-id', 'v-1', '--source-application', 'apex_niche_ai'],
      env: { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct' },
      supabase,
      cloudflareAdapterFactory: () => cf,
    });
    expect(result.infra.written).toBe(false);
    expect(result.infra.value_usd).toBeUndefined();
    expect(supabase.upserts.some((u) => 'infra_cost_usd' in u.row)).toBe(false);
  });

  it('writes a measured AI cost when a gateway is configured and returns cost-bearing logs', async () => {
    const supabase = fakeSupabaseSpy();
    const cf = {
      readWorkersUsage: vi.fn(async () => ({ viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } })),
      readAiGatewayCost: vi.fn(async () => ({ result: [{ cost: 1.5 }] })),
    };
    const result = await main({
      argv: ['node', 'x.mjs', '--venture-id', 'v-1', '--source-application', 'apex_niche_ai'],
      env: { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_AI_GATEWAY_ID_APEX_NICHE_AI: 'gw-1' },
      supabase,
      cloudflareAdapterFactory: () => cf,
    });
    expect(result.ai.written).toBe(true);
    expect(result.ai.value_usd).toBeCloseTo(1.5, 4);
    expect(result.ai.status).toBe('measured');
  });

  it('a Cloudflare API failure leaves the field unattested/errored, never fabricating a value, and does not throw', async () => {
    const supabase = fakeSupabaseSpy();
    const cf = {
      readWorkersUsage: vi.fn(async () => { throw new Error('cloudflare rate limited'); }),
      readAiGatewayCost: vi.fn(),
    };
    const result = await main({
      argv: ['node', 'x.mjs', '--venture-id', 'v-1', '--source-application', 'apex_niche_ai'],
      env: { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct' },
      supabase,
      cloudflareAdapterFactory: () => cf,
    });
    expect(result.infra.written).toBe(false);
    expect(result.infra.error).toContain('cloudflare rate limited');
    expect(supabase.upserts.length).toBe(0);
  });
});

describe('TR-1 — never touches the fleet-wide singleton tables (regression tripwire, NOT a formal proof)', () => {
  it('the writer source never references income_capture_monthly or operator_cash_burn_monthly', () => {
    const raw = readFileSync(new URL('../../../scripts/operator/feed-venture-operating-burn.mjs', import.meta.url), 'utf8');
    const codeOnly = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/income_capture_monthly/);
    expect(codeOnly).not.toMatch(/operator_cash_burn_monthly/);
  });

  it('the substrate library never references income_capture_monthly or operator_cash_burn_monthly, and does target venture_operating_burn', () => {
    const raw = readFileSync(new URL('../../../lib/operator/venture-burn-substrate.js', import.meta.url), 'utf8');
    const codeOnly = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/income_capture_monthly/);
    expect(codeOnly).not.toMatch(/operator_cash_burn_monthly/);
    expect(codeOnly).toMatch(/venture_operating_burn/);
  });
});
