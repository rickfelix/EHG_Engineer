/**
 * SD-LEO-INFRA-ORG-TEST-TEARDOWN-001 FR-4: the SD's own literal success criterion --
 * "Running the org test suite twice leaves the org_agent_identities row count unchanged."
 *
 * Drives the REAL production path (runSeededThread -> VentureFactory.instantiateVenture ->
 * recordIdentityForAgent -> teardownRun) against the live database, twice in sequence, and
 * asserts org_agent_identities' total row count returns to its starting value both times. This
 * is the proof for FR-1 (teardownRun's new org_agent_identities delete): before that fix, each
 * run of this test would have left the count permanently higher.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeededThread, teardownRun } from '../../../scripts/harness/spine-verify-first-run.mjs';
import { purgeOrphanedOrgAgentIdentities } from '../../../lib/governance/fixture-producer-guard.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('org_agent_identities teardown: double-run count parity', () => {
  test.skip(!SUPABASE_URL || !SUPABASE_KEY, 'requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

  test.beforeAll(async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    await purgeOrphanedOrgAgentIdentities(supabase, { namePrefix: 'TEST-' });
  });

  // Adversarial /ship review finding, HIGH: a table-wide unscoped count races against
  // concurrent Playwright browser projects and other real-DB org e2e suites creating/deleting
  // rows in the same window. Scoping the count to this suite's own TEST- fixture prefix
  // (the same prefix runSeededThread() itself always uses -- see spine-verify-first-run.mjs)
  // narrows the blast radius; the project-name skip below matches the identical, already-
  // established mitigation in the sibling shared-operators-arming.spec.ts for the SAME hazard
  // class (5 browser projects racing the same live table).
  async function countOrgAgentIdentities() {
    const { count, error } = await supabase
      .from('org_agent_identities')
      .select('*', { count: 'exact', head: true })
      .ilike('display_name', 'TEST-%');
    if (error) throw new Error(`count query failed: ${error.message}`);
    return count ?? 0;
  }

  test('TS-4: two full runSeededThread + teardownRun cycles leave the row count unchanged after each', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'single-project only -- shares a live count over the same TEST-prefixed rows across projects, matching shared-operators-arming.spec.ts\'s identical mitigation');
    const baseline = await countOrgAgentIdentities();

    const manifest1 = await runSeededThread({ supabase, runId: `parity-1-${Date.now()}` });
    await teardownRun(supabase, manifest1);
    const afterRun1 = await countOrgAgentIdentities();
    expect(afterRun1, 'row count must return to baseline after run 1').toBe(baseline);

    const manifest2 = await runSeededThread({ supabase, runId: `parity-2-${Date.now()}` });
    await teardownRun(supabase, manifest2);
    const afterRun2 = await countOrgAgentIdentities();
    expect(afterRun2, 'row count must return to baseline after run 2').toBe(baseline);
  });
});
