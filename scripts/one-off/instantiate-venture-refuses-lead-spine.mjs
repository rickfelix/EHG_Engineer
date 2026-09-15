#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 -- LEAD-phase spine population.
 *
 * LEAD-phase Explore measured the premise directly rather than trusting the SD's own text:
 * confirmed EXACTLY 18,340 org_agent_identities rows point at a venture_id with no matching
 * ventures row (655 of 660 distinct referenced venture_ids are orphaned; only 5 real). Both
 * current call sites of instantiateVenture() (lib/agents/eva-coo-integration.js:356 inside
 * onboardVenture(), and scripts/harness/spine-verify-first-run.mjs) already pass a real,
 * freshly-fetched venture.id -- so the 18,340 orphans trace to an earlier/removed caller or
 * direct test invocation, not a currently-live production path. The fix is still the right one:
 * a structural guard at the entry point so NO future caller (live, harness, or test) can ever
 * repeat this regardless of how it's invoked.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const key_changes = [
    {
      change: 'Add a guard at the top of VentureFactory.instantiateVenture() (lib/agents/venture-ceo-factory.js:273) that queries the ventures table for options.ventureId BEFORE any agent/identity/relationship row is created, and throws a named error (e.g. VentureNotFoundError extends Error) if no matching row exists -- writing zero rows in that case.',
      impact: 'Closes the exact root cause of the measured 18,340 orphan org_agent_identities rows (655 of 660 distinct referenced venture_ids have no ventures row) -- any future caller (live, harness, or test) that passes a nonexistent venture id is refused at the entry point instead of silently writing orphan identity/relationship/tool-grant rows across 4+ tables.',
    },
    {
      change: 'Confirm the existing 2 call sites (lib/agents/eva-coo-integration.js onboardVenture(), scripts/harness/spine-verify-first-run.mjs) are unaffected by the new guard, since both already pass a real, freshly-fetched venture.id -- add a regression test proving the guard does not fire on the legitimate path.',
      impact: 'Proves the fix is additive (closes the gap for a bad caller) without breaking either of the 2 real callers this function has today.',
    },
  ];

  const strategic_objectives = [
    'Close E3 (design feedback 20b858dc section 8 exit predicates): "instantiation for a nonexistent venture id is refused with a named error and writes no rows; a unit test covers it" -- the org design\'s own corrective C2, sourced independently per chairman ruling 212909b9.',
    'Prevent recurrence of the measured 18,340-row orphan-identity defect (LEAD-phase Explore, direct live-DB measurement) for any future caller of instantiateVenture(), regardless of whether that caller is a currently-live production path, a manual harness, or a test.',
  ];

  const risks = [
    {
      risk: 'The guard could break a legitimate caller that intentionally passes a venture id not yet committed (e.g. a caller inside the same transaction/flow that creates the ventures row and calls instantiateVenture() before that write is visible).',
      severity: 'low',
      mitigation: 'Both current call sites (eva-coo-integration.js, spine-verify-first-run.mjs) already fetch/create the venture row and pass venture.id AFTER that row exists -- confirmed by reading both call sites directly. A regression test pins this ordering for both.',
      },
    {
      risk: 'Orphan rows already in the database (18,340 identities, 655 venture_ids) are not retroactively cleaned up by this SD -- it only prevents new orphans.',
      severity: 'low',
      mitigation: 'Retroactive cleanup of pre-existing orphan rows is explicitly out of scope for this SD (the design\'s own C2 corrective is "refuse at the entry point", not "clean up history") -- a separate data-remediation item if the chairman wants the existing rows purged.',
    },
  ];

  const smoke_test_steps = [
    {
      instruction: 'Call instantiateVenture() with a ventureId that has no row in the ventures table',
      step_number: 1,
      expected_outcome: 'The call throws a named error (VentureNotFoundError) and zero rows are written to org_agent_identities/agent_registry/org_agent_relationships/tool_access_grants',
    },
    {
      instruction: 'Call instantiateVenture() with a ventureId that DOES have a row in the ventures table (the legitimate path both existing call sites use)',
      step_number: 2,
      expected_outcome: 'Instantiation proceeds exactly as before -- the guard adds one query and does not change any other behavior',
    },
  ];

  const success_criteria = [
    {
      criterion: 'instantiateVenture() refuses a venture id that has no ventures row, throwing a named error and writing zero rows.',
      measure: 'A unit test seeding a nonexistent venture id asserts the call throws VentureNotFoundError and no downstream create calls (agent, relationship, tool grant) occur.',
    },
    {
      criterion: 'Both existing legitimate call sites (eva-coo-integration.js onboardVenture(), spine-verify-first-run.mjs) are unaffected -- the guard is additive, not a behavior change for a real venture id.',
      measure: 'A unit test with a real (mocked-existing) venture id confirms instantiation proceeds unchanged.',
    },
  ];

  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const mechanism_verifications = [
    { verified_by: 'LEAD-Explore', verified_at: 'lib/agents/venture-ceo-factory.js:273' },
    { verified_by: 'LEAD-Explore', verified_at: 'lib/agents/eva-coo-integration.js:356' },
    { verified_by: 'LEAD-Explore', verified_at: 'scripts/harness/spine-verify-first-run.mjs:128' },
  ];

  const { error: updErr } = await supabase.from('strategic_directives_v2')
    .update({
      key_changes,
      strategic_objectives,
      risks,
      smoke_test_steps,
      success_criteria,
      metadata: {
        ...sdRow.metadata,
        mechanism_verifications,
        needs_enrichment: [],
      },
    })
    .eq('id', sdRow.id);
  if (updErr) throw updErr;

  console.log('SPINE UPDATED:', SD_KEY, 'id=', sdRow.id);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
