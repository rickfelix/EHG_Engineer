// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-6 (class f): account-prerequisite checklist.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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

  // Independent post-ship sweep (R1): applications.venture_id is nullable and, measured live
  // 2026-08-18, ~47% unpopulated (7 of 15 rows) -- a null lookup result is genuinely ambiguous,
  // not a confirmed absence.
  it('stripe_billing reports present:null (not confirmed-false) when no applications row was found via the venture_id FK at all', () => {
    const checklist = buildAccountPrerequisiteChecklist({ applicationRowFound: false, stripeBillingProductId: null });
    const stripe = checklist.find((c) => c.account === 'stripe_billing');
    expect(stripe.present).toBeNull();
    expect(stripe.detail).toMatch(/no applications row found via venture_id/);
  });

  it('stripe_billing reports present:false (confirmed) only when a real applications row was found with billing_product_id genuinely unset', () => {
    const checklist = buildAccountPrerequisiteChecklist({ applicationRowFound: true, stripeBillingProductId: null });
    const stripe = checklist.find((c) => c.account === 'stripe_billing');
    expect(stripe.present).toBe(false);
    expect(stripe.detail).toBe('applications.metadata.billing_product_id not set');
  });

  it('stripe_billing reports present:true when a real applications row has billing_product_id set', () => {
    const checklist = buildAccountPrerequisiteChecklist({ applicationRowFound: true, stripeBillingProductId: 'prod_1' });
    const stripe = checklist.find((c) => c.account === 'stripe_billing');
    expect(stripe.present).toBe(true);
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

  it('clerk_auth_keys reports present:null with an explicit unchecked explanation when no local wrangler.toml finding is available, never silently omitted', () => {
    const checklist = buildAccountPrerequisiteChecklist({ stripeBillingProductId: 'prod_1', cloudflareConnectionProvider: 'd1', sentryDsn: 'x', wranglerD1DatabaseId: 'real-id' });
    const clerk = checklist.find((c) => c.account === 'clerk_auth_keys');
    expect(clerk).toBeDefined();
    expect(clerk.present).toBeNull();
    expect(clerk.detail).toMatch(/not found in a local wrangler\.toml/);
  });

  // Independent post-ship sweep: clerk_auth_keys used to be hardcoded present:null regardless of
  // input -- the chairman's incident named the Clerk key as the OTHER half alongside database_id
  // (module header), so this checklist now genuinely checks it the same way it checks the D1 id.
  it('clerk_auth_keys flags an unfilled Clerk publishable key placeholder specifically, mirroring cloudflare_d1_real_id', () => {
    const checklist = buildAccountPrerequisiteChecklist({ clerkPublishableKeyValue: 'pk_test_YOUR_KEY_HERE' });
    const clerk = checklist.find((c) => c.account === 'clerk_auth_keys');
    expect(clerk.present).toBe(false);
    expect(clerk.detail).toMatch(/unfilled Clerk publishable key placeholder/);
  });

  it('clerk_auth_keys reports present:true for a non-placeholder-shaped key, with the live-validation caveat still stated', () => {
    const checklist = buildAccountPrerequisiteChecklist({ clerkPublishableKeyValue: 'pk_test_Y2xlcmsuc29tZS1yZWFsLWxvb2tpbmcta2V5JA' });
    const clerk = checklist.find((c) => c.account === 'clerk_auth_keys');
    expect(clerk.present).toBe(true);
    expect(clerk.detail).toMatch(/live validity.*not checked/);
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
      applicationRowFound: true,
      cloudflareConnectionProvider: 'd1',
      sentryDsn: 'https://key@sentry.io/1',
      wranglerD1DatabaseId: null,
      clerkPublishableKeyValue: null,
    });
  });

  it('resolves cleanly to all-null when neither row exists (fresh/unprovisioned venture)', async () => {
    const supabase = makeSupabase({});
    const indicators = await resolveAccountPrerequisiteIndicators(supabase, 'venture-1', null);
    expect(indicators).toEqual({
      stripeBillingProductId: null,
      applicationRowFound: false,
      cloudflareConnectionProvider: null,
      sentryDsn: null,
      wranglerD1DatabaseId: null,
      clerkPublishableKeyValue: null,
    });
  });

  it('adversarial review finding (/ship Deep-tier gate): joins applications by the venture_id FK, never by free-text venture name -- scripts/eva/retroactive-pbn-score.mjs documents two live ventures sharing the name "MarketLens", so a name-based join could silently attribute one venture\'s billing_product_id to the other', async () => {
    const eqSpy = vi.fn(() => ({ maybeSingle: async () => ({ data: { metadata: { billing_product_id: 'prod_correct' } }, error: null }) }));
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'ventures') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'MarketLens', metadata: {}, stack_descriptor: {} }, error: null }) }) }) };
        }
        if (table === 'applications') {
          return { select: () => ({ eq: eqSpy }) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const indicators = await resolveAccountPrerequisiteIndicators(supabase, 'venture-correct-id', null);

    expect(eqSpy).toHaveBeenCalledWith('venture_id', 'venture-correct-id');
    expect(eqSpy).not.toHaveBeenCalledWith('name', expect.anything());
    expect(indicators.stripeBillingProductId).toBe('prod_correct');
  });

  it('independent sweep finding: throws on a genuine ventures-read error instead of silently treating it as a confirmed-missing venture', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'ventures') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'permission denied for table ventures', code: '42501' } }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    await expect(resolveAccountPrerequisiteIndicators(supabase, 'venture-1', null)).rejects.toThrow(/ventures fetch failed/);
  });

  it('independent sweep finding: throws on a genuine applications-read error instead of silently treating it as a confirmed-missing billing product', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'ventures') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'X', metadata: {}, stack_descriptor: {} }, error: null }) }) }) };
        }
        if (table === 'applications') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'permission denied for table applications', code: '42501' } }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    await expect(resolveAccountPrerequisiteIndicators(supabase, 'venture-1', null)).rejects.toThrow(/applications fetch failed/);
  });

  describe('wrangler.toml filesystem scan (real I/O, not a fixture string)', () => {
    let dir;
    beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'crack-gate-fr6-')); });
    afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

    it('extracts both database_id and VITE_CLERK_PUBLISHABLE_KEY from a real wrangler.toml on disk', async () => {
      const cloneDir = join(dir, 'altifyai-shaped');
      mkdirSync(cloneDir, { recursive: true });
      writeFileSync(join(cloneDir, 'wrangler.toml'), [
        'name = "altifyai"',
        'database_id = "00000000-0000-0000-0000-000000000000"',
        '',
        '[vars]',
        'VITE_CLERK_PUBLISHABLE_KEY = "pk_test_YOUR_KEY_HERE"',
      ].join('\n'));

      const indicators = await resolveAccountPrerequisiteIndicators(makeSupabase({}), 'venture-1', cloneDir);
      expect(indicators.wranglerD1DatabaseId).toBe('00000000-0000-0000-0000-000000000000');
      expect(indicators.clerkPublishableKeyValue).toBe('pk_test_YOUR_KEY_HERE');

      const checklist = buildAccountPrerequisiteChecklist(indicators);
      const d1 = checklist.find((c) => c.account === 'cloudflare_d1_real_id');
      const clerk = checklist.find((c) => c.account === 'clerk_auth_keys');
      expect(d1.present).toBe(false);
      expect(clerk.present).toBe(false);
    });

    it('clerkPublishableKeyValue stays null when the key is absent from an otherwise-real wrangler.toml (ambiguous, not a confirmed gap)', async () => {
      const cloneDir = join(dir, 'no-clerk-var');
      mkdirSync(cloneDir, { recursive: true });
      writeFileSync(join(cloneDir, 'wrangler.toml'), [
        'name = "some-venture"',
        'database_id = "bdbaef59-7e73-478e-9e57-57b4bf8d853b"',
      ].join('\n'));

      const indicators = await resolveAccountPrerequisiteIndicators(makeSupabase({}), 'venture-1', cloneDir);
      expect(indicators.wranglerD1DatabaseId).toBe('bdbaef59-7e73-478e-9e57-57b4bf8d853b');
      expect(indicators.clerkPublishableKeyValue).toBeNull();
    });
  });
});
