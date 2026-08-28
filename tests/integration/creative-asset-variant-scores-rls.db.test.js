/**
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1, TS-4) — RLS cross-venture isolation,
 * legs A2 (catalog) and A3 (weak anon-role corroboration). Leg A1 (static predicate assertion)
 * lives in tests/unit/creative-asset-variant-scores-migration.test.js -- it needs no DB.
 *
 * DB-TIER, opt-in only (vitest.config.js DB_INCLUDE): self-skips under an undesignated
 * DB_TARGET via tests/setup.db.js's runtime gate, matching every other *.db.test.js in this
 * repo. This is deliberate -- writing/reading live RLS state against production from an ad hoc
 * test run is exactly what the gate exists to prevent (QF-20260726-459).
 *
 * TESTING finding D1 (evidence f9247bbd-7d82-47c0-86cf-69f641af7e7f): an earlier version of
 * this file created the raw pg client in a bare, unguarded beforeAll, which threw
 * DB_TIER_BLOCKED instead of skipping cleanly (the gate patches the socket layer, so an
 * unconditional connect attempt still fires even inside a describe.skipIf'd block if that
 * block wraps only the it()s, not the client creation itself). Fixed to match
 * tests/database/uat-stage-migration-preconditions.db.test.js's proven pattern: HAS_REAL_DB
 * guards the connection attempt itself, and describeDb wraps every it().
 *
 * A2 is the load-bearing leg: confirms cavs_venture_access is wired in pg_policies with the
 * expected role and a non-tautological qual, and that RLS is actually enabled on the table.
 * A3 is explicitly a WEAK, corroborating-only control (TESTING evidence
 * d82e9679-c331-4225-b36d-9cf3bb5d9116, G2): anon is not in the `authenticated` role, so it
 * cannot exercise the policy predicate at all -- it only confirms the table isn't accidentally
 * world-readable to a completely unauthenticated caller. Neither leg is a live
 * authenticated-session behavioral test (this repo has no auth.uid()-simulating harness) --
 * that would be a separate, explicitly estimated follow-up, not assumed free here.
 */
import { it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { createClient } from '@supabase/supabase-js';
import { describeDb, HAS_REAL_DB } from '../helpers/db-available.js';

let client;

// verify:false (matching tests/database/uat-stage-migration-preconditions.db.test.js's proven
// pattern): defers the actual connection attempt so an undesignated DB_TARGET's runtime gate
// (tests/setup.db.js) can skip this suite's it()s cleanly instead of the raw pg socket connect
// throwing DB_TIER_BLOCKED out of beforeAll before the gate has a chance to intervene.
beforeAll(async () => {
  if (!HAS_REAL_DB) return;
  client = await createDatabaseClient('engineer', { verify: false });
}, 60000);

afterAll(async () => {
  if (client) await client.end();
});

describeDb('creative_asset_variant_scores RLS (FR-1, TS-4 leg A2: catalog)', () => {
  it('table exists and RLS is enabled', async () => {
    const { rows } = await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.creative_asset_variant_scores')"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].relrowsecurity).toBe(true);
  });

  it('cavs_venture_access is wired to the authenticated role with a non-tautological qual', async () => {
    const { rows } = await client.query(
      `SELECT policyname, roles, qual, with_check FROM pg_policies
       WHERE tablename = 'creative_asset_variant_scores' AND policyname = 'cavs_venture_access'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toEqual(['authenticated']);
    // non-tautological: must actually traverse creative_assets -> ventures -> user_company_access,
    // never a bare USING(true) masquerading as venture-scoped
    expect(rows[0].qual).toMatch(/creative_asset_id/);
    expect(rows[0].qual).toMatch(/user_company_access/);
    expect(rows[0].qual).not.toBe('true');

    // REGRESSION (SECURITY evidence 9c3ebaf6-e37b-432c-9dc0-b0af0eaa5827): every assertion
    // above was ALSO satisfied by the live-proven cross-tenant hole, which scoped
    // creative_asset_id correctly and left variant_id entirely unconstrained. An assertion the
    // vulnerable artifact passes is not a regression guard, so the two below -- which it could
    // not pass -- are the load-bearing ones. Behavioural proof (a real authenticated
    // cross-tenant INSERT being refused) lives in the sibling
    // creative-asset-variant-scores-rls-crosstenant.db.test.js; this is the catalog echo of it.
    expect(rows[0].qual).toMatch(/cavs_variant_matches_venture/);
    // A NULL with_check makes Postgres silently reuse USING on the write path, which is how the
    // incomplete read predicate became an exploitable write predicate.
    expect(rows[0].with_check, 'with_check must be explicit, never NULL').not.toBeNull();
    expect(rows[0].with_check).toMatch(/cavs_variant_matches_venture/);
  });

  it('cavs_service_role is a full-bypass policy scoped to service_role only', async () => {
    const { rows } = await client.query(
      `SELECT policyname, roles, qual FROM pg_policies
       WHERE tablename = 'creative_asset_variant_scores' AND policyname = 'cavs_service_role'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toEqual(['service_role']);
    expect(rows[0].qual).toBe('true');
  });

  it('FR-9: both FKs are NO ACTION (never CASCADE) -- the DDL decision the delete_venture() gap depends on', async () => {
    const { rows } = await client.query(
      `SELECT conname, confdeltype FROM pg_constraint
       WHERE conrelid = 'public.creative_asset_variant_scores'::regclass AND contype = 'f'`
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.confdeltype).toBe('a'); // 'a' = NO ACTION
    }
  });
});

describeDb('creative_asset_variant_scores RLS (TS-4 leg A3: weak anon-role corroboration)', () => {
  it('an anon-role client cannot read rows (corroborating only -- anon never exercises the authenticated-role predicate)', async () => {
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!anonKey || !url) {
      // No anon credentials configured in this environment -- skip rather than false-fail.
      return;
    }
    const anonClient = createClient(url, anonKey);
    const { data, error } = await anonClient.from('creative_asset_variant_scores').select('id').limit(1);
    // Either an explicit RLS denial, or an empty result (table has 0 production rows regardless
    // of RLS today) -- both are consistent with "not open to anon"; neither alone proves the
    // authenticated-role predicate is correct, which is why A2 above is the load-bearing leg.
    expect(error || (data && data.length === 0)).toBeTruthy();
  });
});
