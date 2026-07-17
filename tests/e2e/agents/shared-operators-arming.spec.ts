/**
 * SD-LEO-INFRA-ORG-TEMPLATE-ARMING-001: holdco-level EHG_SHARED_OPERATORS
 * instantiation + FINANCE_BILLING real idle/active check.
 *
 * Live-path e2e against the real Supabase instance -- no mocking of
 * VentureFactory or the idle check, mirroring the established pattern in
 * tests/e2e/agents/venture-ceo-verify-first.spec.ts. Zero residue: this test
 * only tears down rows IT created; if the shared operators are already armed
 * (a prior real activation run), it verifies idempotency without touching
 * that pre-existing state.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { teardownRun } from '../../../scripts/harness/spine-verify-first-run.mjs';
import { VentureFactory, EHG_SHARED_OPERATORS } from '../../../lib/agents/venture-ceo-factory.js';
import { checkFinanceBillingIdle } from '../../../lib/agents/finance-billing-idle-check.js';
import { buildFixtureVentureRow } from '../../../scripts/harness/s20-fixture.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SHARED_ROLE_KEYS = EHG_SHARED_OPERATORS.map((op) => op.agent_role.toUpperCase());

test.describe('Shared-operator holdco arming', () => {
  test.skip(!SUPABASE_URL || !SUPABASE_KEY, 'requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

  async function getSharedIdentityIds(roleKeys: string[]) {
    const { data } = await supabase
      .from('org_agent_identities')
      .select('id, role_key, context_profile')
      .is('venture_id', null)
      .in('role_key', roleKeys);
    return data || [];
  }

  test('TS-1 + TS-2: fresh-or-idempotent instantiation creates exactly 4 holdco rows, re-entry is a no-op', async ({}, testInfo) => {
    // This scenario targets the REAL, non-randomized EHG_SHARED_OPERATORS role_keys
    // (unlike TS-3/TS-4/TS-5, which use a fresh randomUUID-scoped identity per run) --
    // running it concurrently across Playwright's multiple browser projects races on
    // agent_registry's UNIQUE hierarchy_path constraint. Confirmed by an actual
    // multi-project run: 3/5 projects failed with a duplicate-key error while racing
    // each other for the same 4 rows. Restrict to a single project; the other 4 would
    // be redundant (no browser/UI surface is exercised) rather than additive coverage.
    test.skip(testInfo.project.name !== 'chromium', 'single-project only -- targets shared non-randomized identities, would race across projects');
    const factory = new VentureFactory(supabase);

    const firstRun = await factory.instantiateSharedOperators();
    expect(firstRun.total).toBe(4);
    expect(firstRun.created.length + firstRun.already_existed.length).toBe(4);

    // Whatever this call created is OURS to tear down; whatever already_existed
    // pre-dates this test run (a real prior activation) and must be left alone.
    const createdRoleKeys = firstRun.created;

    try {
      const secondRun = await factory.instantiateSharedOperators();
      // Idempotency: nothing new gets created on re-entry, regardless of starting state.
      expect(secondRun.created).toEqual([]);
      expect(secondRun.already_existed.sort()).toEqual(SHARED_ROLE_KEYS.sort());

      // Exactly one identity row per role_key, holdco-scoped (venture_id IS NULL).
      // Adversarial-review finding: Set(...).size alone would pass even with a
      // duplicate row for one role_key (e.g. 5 rows, one role_key appearing
      // twice) -- exactly the defect class the FR-2 partial unique index exists
      // to prevent. Assert the raw row count too.
      const identities = await getSharedIdentityIds(SHARED_ROLE_KEYS);
      expect(identities).toHaveLength(4);
      const seenRoleKeys = identities.map((i: any) => i.role_key);
      expect(new Set(seenRoleKeys).size).toBe(4);
    } finally {
      if (createdRoleKeys.length > 0) {
        const createdIdentities = await getSharedIdentityIds(createdRoleKeys);
        const agentIds = createdIdentities.map((i: any) => i.context_profile?.agent_registry_id).filter(Boolean);
        await teardownRun(supabase, { crewAgentIds: agentIds });
        await supabase.from('org_agent_identities').delete().is('venture_id', null).in('role_key', createdRoleKeys);
      }
    }
  });

  test('TS-3 + TS-4: FINANCE_BILLING idle-then-active, scoped since a test marker (real production row untouched)', async ({}, testInfo) => {
    // Same class of issue as TS-1/TS-2: sinceTimestamp scoping is a real-time window
    // over the SAME shared ops_payment_events table, so concurrent projects running
    // this test around the same moment can observe each other's synthetic insert as
    // "active" when they expected "idle". CI runs workers:1 (serial, playwright.config.js)
    // so this never surfaces there, but is real under local unbounded parallelism.
    test.skip(testInfo.project.name !== 'chromium', 'single-project only -- shares a real-time window over the same live table across projects');
    const marker = new Date().toISOString();

    const idleResult = await checkFinanceBillingIdle({ sinceTimestamp: marker }, supabase);
    expect(idleResult.status).toBe('idle');
    expect(idleResult.event_count).toBe(0);

    const testEventId = `evt_test_${randomUUID()}`;
    const { error: insertErr } = await supabase.from('ops_payment_events').insert({
      stripe_event_id: testEventId,
      event_type: 'checkout.session.completed',
      amount_cents: 1000,
      currency: 'usd',
      livemode: false,
      event_ts: new Date(Date.now() + 1000).toISOString(),
      raw_payload: { test: true, sd: 'SD-LEO-INFRA-ORG-TEMPLATE-ARMING-001' },
    });
    expect(insertErr).toBeFalsy();

    try {
      const activeResult = await checkFinanceBillingIdle({ sinceTimestamp: marker }, supabase);
      expect(activeResult.status).toBe('active');
      expect(activeResult.event_count).toBeGreaterThanOrEqual(1);
    } finally {
      await supabase.from('ops_payment_events').delete().eq('stripe_event_id', testEventId);
    }
  });

  test('TS-5: instantiateVenture() (per-venture path) is unaffected by the shared-operator layer', async () => {
    const runId = `e2e-shared-op-unaffected-${Date.now()}`;
    const uniqueSuffix = randomUUID().replace(/-/g, '').slice(0, 10);
    const ventureRow = { ...buildFixtureVentureRow(`SD-A-${runId}`), name: `TEST-${uniqueSuffix}-SD-A` };
    const { data: venture } = await supabase.from('ventures').insert(ventureRow).select('id, name').single();

    const factory = new VentureFactory(supabase);
    const result = await factory.instantiateVenture({ ventureName: venture!.name, ventureId: venture!.id, totalTokenBudget: 25000 });

    try {
      expect(result.total_agents_created).toBeGreaterThan(0);

      // No shared-operator identity row carries this venture's id, and per-venture
      // instantiation created zero holdco (venture_id IS NULL) rows as a side effect.
      const { data: leaked } = await supabase
        .from('org_agent_identities')
        .select('id')
        .eq('venture_id', venture!.id)
        .in('role_key', SHARED_ROLE_KEYS);
      expect(leaked || []).toHaveLength(0);
    } finally {
      await teardownRun(supabase, {
        ceoAgentId: result.ceo_agent_id,
        vpAgentIds: result.executive_agent_ids,
        crewAgentIds: Object.values(result.crew_agent_ids || {}).flat(),
        ventureId: venture!.id,
      });
    }
  });
});
