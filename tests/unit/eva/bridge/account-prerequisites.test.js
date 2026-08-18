// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-6 (class f): account-prerequisite checklist.
import { describe, it, expect, vi } from 'vitest';
import { buildAccountPrerequisiteChecklist, resolveAccountPrerequisiteIndicators } from '../../../../lib/eva/bridge/account-prerequisites.js';

describe('buildAccountPrerequisiteChecklist (pure)', () => {
  it('reports all-present when every DB-observable indicator is set', () => {
    const checklist = buildAccountPrerequisiteChecklist({
      stripeBillingProductId: 'prod_123',
      cloudflareConnectionProvider: 'd1',
      sentryDsn: 'https://key@sentry.io/1',
      wranglerD1DatabaseId: 'bdbaef59-7e73-478e-9e57-57b4bf8d853b',
    });
    const byAccount = Object.fromEntries(checklist.map((c) => [c.account, c]));
    expect(byAccount.stripe_billing.present).toBe(true);
    expect(byAccount.cloudflare_deploy_target.present).toBe(true);
    expect(byAccount.sentry_monitoring.present).toBe(true);
    expect(byAccount.cloudflare_d1_real_id.present).toBe(true);
  });

  it('reports all-missing with a single consolidated list when nothing is configured (the exact chairman incident, one round-trip instead of five)', () => {
    const checklist = buildAccountPrerequisiteChecklist({});
    const missing = checklist.filter((c) => c.present === false).map((c) => c.account);
    expect(missing.sort()).toEqual(['cloudflare_deploy_target', 'sentry_monitoring', 'stripe_billing']);
  });

  it('flags the AltifyAI placeholder database_id specifically, not just "missing"', () => {
    const checklist = buildAccountPrerequisiteChecklist({
      wranglerD1DatabaseId: '00000000-0000-0000-0000-000000000000',
    });
    const d1 = checklist.find((c) => c.account === 'cloudflare_d1_real_id');
    expect(d1.present).toBe(false);
    expect(d1.detail).toMatch(/scaffold placeholder/);
  });

  it('a null wranglerD1DatabaseId (no local clone) reports present:null, distinct from a confirmed false', () => {
    const checklist = buildAccountPrerequisiteChecklist({});
    const d1 = checklist.find((c) => c.account === 'cloudflare_d1_real_id');
    expect(d1.present).toBeNull();
  });

  it('clerk_auth_keys is always present:null with an explicit out-of-scope explanation, never silently omitted', () => {
    const checklist = buildAccountPrerequisiteChecklist({ stripeBillingProductId: 'prod_1', cloudflareConnectionProvider: 'd1', sentryDsn: 'x', wranglerD1DatabaseId: 'real-id' });
    const clerk = checklist.find((c) => c.account === 'clerk_auth_keys');
    expect(clerk).toBeDefined();
    expect(clerk.present).toBeNull();
    expect(clerk.detail).toMatch(/NOT CHECKED/);
  });

  it('defaults to an empty-indicators object without throwing', () => {
    expect(() => buildAccountPrerequisiteChecklist()).not.toThrow();
  });
});

describe('resolveAccountPrerequisiteIndicators (I/O)', () => {
  function makeSupabase({ ventureRow, applicationRow } = {}) {
    return {
      from: vi.fn((table) => {
        if (table === 'ventures') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ventureRow || null, error: null }) }) }) };
        }
        if (table === 'applications') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: applicationRow || null, error: null }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
  }

  it('resolves stripe/cloudflare/sentry indicators from the DB rows, and skips the filesystem check when no clone path is given', async () => {
    const supabase = makeSupabase({
      ventureRow: { name: 'TestVenture', metadata: { sentry: { dsn: 'https://key@sentry.io/1' } }, stack_descriptor: { connection: { provider: 'd1' } } },
      applicationRow: { metadata: { billing_product_id: 'prod_1' } },
    });
    const indicators = await resolveAccountPrerequisiteIndicators(supabase, 'venture-1', null);
    expect(indicators).toEqual({
      stripeBillingProductId: 'prod_1',
      cloudflareConnectionProvider: 'd1',
      sentryDsn: 'https://key@sentry.io/1',
      wranglerD1DatabaseId: null,
    });
  });

  it('resolves cleanly to all-null when neither row exists (fresh/unprovisioned venture)', async () => {
    const supabase = makeSupabase({});
    const indicators = await resolveAccountPrerequisiteIndicators(supabase, 'venture-1', null);
    expect(indicators).toEqual({
      stripeBillingProductId: null,
      cloudflareConnectionProvider: null,
      sentryDsn: null,
      wranglerD1DatabaseId: null,
    });
  });
});
