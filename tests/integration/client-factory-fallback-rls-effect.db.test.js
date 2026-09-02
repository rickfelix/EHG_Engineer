/**
 * SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001 (FR-3b): proves the RLS-effect half of the fix --
 * a service-role client reads leo_feature_flags' true row count, while an anon client
 * silently gets 0 rows with no error (the exact incident shape the SD closes). This is a
 * regression guard for the ROOT CAUSE (a wrong-permission client silently returning empty
 * instead of erroring), not for the removed default export itself -- that closure is proven
 * separately, at the module level, by tests/unit/client-factory-default-export-removed.test.js
 * (a pure ESM-semantics check that needs no DB).
 *
 * DB-TIER, opt-in only (matching every other *.db.test.js in this repo -- see
 * tests/integration/creative-asset-variant-scores-rls.db.test.js for the full rationale):
 * self-skips under an undesignated DB target. Skip-loud, per PLAN's condition (never fold
 * this into the unit lane, which sentinel-overwrites all Supabase credentials and could
 * never observe a real RLS effect either way).
 *
 * leo_feature_flags is the correct witness table (measured, not assumed): testing-agent's
 * prospective review confirmed strategic_directives_v2 does NOT exhibit the RLS-filtered-
 * empty shape (anon count === service count there). Never assert a literal row count --
 * the original incident report's "23 rows" was already stale when re-measured live at 25;
 * assert the RELATIONSHIP (anon=0, service>0) instead.
 */
import { it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { describeDb, HAS_REAL_DB } from '../helpers/db-available.js';

let serviceClient;

beforeAll(() => {
  if (!HAS_REAL_DB) return;
  serviceClient = createSupabaseServiceClient();
});

describeDb('leo_feature_flags RLS-effect (FR-3b): anon-permission client never silently succeeds where it should be denied', () => {
  it('service-role client reads the true row count; anon client gets 0 rows with no error', async () => {
    const { data: serviceRows, error: serviceError } = await serviceClient
      .from('leo_feature_flags')
      .select('id');
    expect(serviceError).toBeNull();

    if (!serviceRows || serviceRows.length === 0) {
      // Skip loud, not silent: nothing to compare against if the table itself is empty in
      // this environment -- the assertion below would be vacuously true, which is a false
      // pass, not a real regression guard.
      console.warn('[client-factory-fallback-rls-effect] leo_feature_flags has 0 rows via service client in this environment -- skipping the anon-vs-service comparison (nothing to compare).');
      return;
    }

    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!anonKey || !url) {
      console.warn('[client-factory-fallback-rls-effect] no anon credentials configured in this environment -- skipping.');
      return;
    }
    const anonClient = createClient(url, anonKey);
    const { data: anonRows, error: anonError } = await anonClient
      .from('leo_feature_flags')
      .select('id');

    expect(serviceRows.length).toBeGreaterThan(0);
    expect(anonError).toBeNull();
    expect(anonRows).toHaveLength(0);
  });
});
