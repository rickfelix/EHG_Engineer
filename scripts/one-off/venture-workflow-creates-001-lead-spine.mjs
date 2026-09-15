#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- LEAD-phase spine population.
 *
 * LEAD-phase Explore measured live state rather than trusting the SD text at face value.
 * The SD's own text explicitly reserves "whether creation is a new stage or a step in an
 * existing one" to Solomon as design owner, and says a new stage number would require a
 * chairman-gated stage-key renumber ceremony (2af667eb precedent) at which "the PLAN phase
 * stops." LEAD Explore confirmed this precedent is REAL, not hypothetical: venture_stages
 * (live DB) shows stage 23=dedicated_venture_uat, 24=launch_readiness_gate (kill),
 * 25=go_live -- but the corresponding analysis-step FILES are named stage-23-dedicated-
 * venture-uat.js (correct), stage-23-launch-readiness.js (actually DB stage 24, confirmed by
 * its own code comment "the upstream launch_readiness_checklist (live Stage 24)"), and
 * stage-24-go-live.js (actually DB stage 25) -- a prior renumber already shifted the DB
 * stage_numbers by +1 without renaming the files. This is live proof the ceremony class
 * cited by the SD is real and has fired before.
 *
 * SCOPING DECISION (avoids the reserved ceremony entirely): the SD's own success criteria,
 * read literally, describe a "record within stage 23, gate at stage 24" pattern that
 * requires NO new stage number at all -- "stage 23 records an organization QA/QC result...
 * next to the product UAT result; the stage-24 launch-readiness packet shows both; a venture
 * whose organization fails QA/QC cannot pass stage 24." This SD implements exactly that,
 * entirely within the two EXISTING stage-template files, using the EXISTING Venture Quality
 * Model v1 registry extension mechanism (lib/eva/quality-model/registry.js) that already
 * adds new REQUIRED/ADVISORY checklist categories with a producer/reader_or_gate/
 * severity_policy/ratification_pointer shape. Whether org-creation should ALSO become a
 * formally separate stage number is explicitly left to Solomon/the chairman as a SEPARATE,
 * later architectural question -- out of this SD's scope, per its own Risks text ("this item
 * owns only its own exit predicate; other parts of 20b858dc are separate items").
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const key_changes = [
    {
      change: 'New analysis-step logic inside lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js (live DB stage 23): before/alongside the existing checkUatRobustnessGate() call, create a draft AI organization for the venture (VentureFactory.instantiateVenture(), lib/agents/venture-ceo-factory.js -- already refuses a nonexistent venture id, SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001) and run the organization acceptance suite (lib/org/acceptance-suite/run-suite.mjs, SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001) against it, wrapping the result into a venture_artifacts row parallel to the existing UAT robustness artifact -- matching this file\'s own established pattern of wrapping a checker\'s result into a readable per-stage artifact.',
      impact: 'Satisfies the success criteria\'s first two clauses: an organization draft exists before stage 23 proceeds, and stage 23 records an organization QA/QC result next to the product UAT result -- with zero new stage number and zero chairman ceremony.',
    },
    {
      change: 'New REQUIRED checklist category (e.g. \'organization_qa\') added to lib/eva/quality-model/registry.js (the Venture Quality Model v1 registry that already generates lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js\'s -- live DB stage 24 -- REQUIRED_CATEGORIES/ADVISORY_CATEGORIES arrays), with producer pointing at the new stage-23 step above and reader_or_gate pointing at the launch-readiness checklist file, severity_policy: blocking.',
      impact: 'Satisfies the success criteria\'s remaining two clauses: the stage-24 launch-readiness packet shows the organization QA/QC result, and a venture whose organization fails QA/QC cannot pass stage 24 -- reusing the exact registry-driven mechanism this repo already uses for every other blocking launch-readiness category, rather than inventing a parallel gate.',
    },
    {
      change: 'Mock-venture rehearsal path: the organization draft created at stage 23 always runs through the acceptance suite in mock mode first (per chairman ruling 90c0b40a\'s standing mock-first discipline and this SD\'s own "rehearsed on mock work" text) -- nothing about the created organization is switched on/made live until stage 25 (go_live), matching the SD\'s explicit "nothing in it runs before go-live."',
      impact: 'Closes the gap between "an organization object exists in the DB" and "the organization is actually operating" -- the QA/QC check proves the org WOULD function correctly, without letting any of its agents take real action before go-live.',
    },
  ];

  const strategic_objectives = [
    'Execute chairman rulings 3c20483a and 58f5345f (2026-09-14): the venture AI organization is created before UAT, rehearsed and QA/QC-checked in stage 23 alongside the product UAT, reported at stage 24, and switched on only at go-live (stage 25) -- implemented as this SD\'s own narrow exit predicate, per Solomon\'s AI Agent Organization Architecture v2 design.',
    'Land this build BEFORE the clean-slate test venture (chairman ruling 212909b9, ratification 3c4a6781) so that venture\'s run exercises a working organization-creation-and-QA/QC path from day one.',
    'Explicitly defer the "should organization creation become its own formally-numbered stage" architectural question to Solomon/the chairman as a separate, later item -- this SD delivers the full functional requirement within existing stages 23-24, never deciding the reserved stage-placement question itself.',
  ];

  const risks = [
    {
      risk: 'Scope creep into the wider Solomon v2 design (feedback 20b858dc) -- this SD could be misread as authorizing the full organization-lifecycle architecture rather than just its stage-23/24 exit predicate.',
      severity: 'low',
      mitigation: 'Per the SD\'s own Risks text, this item owns only its own exit predicate (org draft + QA/QC recorded at stage 23, gated at stage 24); every other part of 20b858dc (memory, duty ledger, delegation contracts, cross-venture demand intelligence, etc.) is explicitly a separate, already-tracked item (several already completed this session: SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001, SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001).',
    },
    {
      risk: 'Implementing entirely within existing stages 23/24 (rather than waiting for Solomon\'s stage-placement decision and a possible chairman-gated renumber) could be seen as pre-empting that reserved decision.',
      severity: 'low',
      mitigation: 'This SD does not decide whether org-creation gets its own future stage number -- it only implements the functional requirement the SD\'s own success criteria literally describe (a stage-23 record + stage-24 gate), which is true regardless of any later stage-renumber decision. If Solomon later decides a dedicated stage is warranted, that migration can move this logic into a new stage template without changing the underlying artifact/registry contract this SD establishes.',
    },
    {
      risk: 'The Venture Quality Model v1 registry\'s existing REQUIRED categories include 2 with a documented \'no producer registered yet\' waiver (marketing_assets, distribution_channels) -- adding a new REQUIRED, non-waived category raises the bar for every venture reaching stage 24, unlike those 2 waived entries.',
      severity: 'low',
      mitigation: 'Unlike the 2 waived categories, this SD DOES ship a real producer (the new stage-23 organization-creation-and-QA/QC step) in the same PR as the registry entry -- so the new category is never a documented-but-unimplemented gap the way marketing_assets/distribution_channels currently are.',
    },
  ];

  const smoke_test_steps = [
    {
      instruction: 'Run a mock venture through stage 23 (dedicated_venture_uat)',
      step_number: 1,
      expected_outcome: 'An organization draft exists for the venture, and a venture_artifacts row records the organization acceptance-suite verdict alongside the existing UAT robustness artifact',
    },
    {
      instruction: 'Run the same mock venture through stage 24 (launch_readiness_gate) with a deliberately failing organization (a seeded MAST-style defect)',
      step_number: 2,
      expected_outcome: 'The launch-readiness checklist reports the organization_qa category as failed, and the overall kill-gate verdict is HOLD/fail -- the venture cannot pass stage 24',
    },
  ];

  const success_criteria = [
    {
      criterion: 'On a mock venture the workflow produces an organization draft before stage 23.',
      measure: 'A test asserts a VentureFactory-created organization (agent_registry/org_agent_identities rows) exists for a mock venture by the time stage 23 completes.',
    },
    {
      criterion: 'Stage 23 records an organization QA/QC result (the acceptance suite from the organization acceptance-suite item) next to the product UAT result.',
      measure: 'A test asserts a venture_artifacts row of the new organization-QA/QC artifact type exists alongside the existing UAT robustness artifact for the same venture/stage.',
    },
    {
      criterion: 'The stage-24 launch-readiness packet shows both the product UAT and organization QA/QC results.',
      measure: 'A test asserts the launch-readiness checklist output includes both the pre-existing UAT-derived categories and the new organization_qa category.',
    },
    {
      criterion: 'A venture whose organization fails QA/QC cannot pass stage 24.',
      measure: 'A test seeds a failing organization (a MAST-taxonomy defect fixture) and asserts the stage-24 checklist verdict is not PASS.',
    },
  ];

  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const mechanism_verifications = [
    { verified_by: 'LEAD-Explore', verified_at: 'lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js:1-30' },
    { verified_by: 'LEAD-Explore', verified_at: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js:1-90' },
    { verified_by: 'LEAD-Explore', verified_at: 'lib/eva/quality-model/registry.js:156-164' },
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
        lead_scoping_decision: {
          decided_at: new Date().toISOString(),
          decision: 'Implement fully within existing DB stages 23 (dedicated_venture_uat) and 24 (launch_readiness_gate) -- no new stage number, no chairman-gated stage-key renumber ceremony required.',
          basis: 'The SD\'s own success criteria literally describe a stage-23-record + stage-24-gate pattern requiring no new stage. Whether org-creation later becomes a dedicated stage number is explicitly left to Solomon/chairman as a separate item.',
          live_evidence: 'venture_stages table confirms stage 23=dedicated_venture_uat, 24=launch_readiness_gate(kill), 25=go_live; analysis-step file names (stage-23-launch-readiness.js=DB stage24, stage-24-go-live.js=DB stage25) confirm a prior renumber already occurred without a filename update, validating the SD-cited 2af667eb ceremony precedent as real.',
        },
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
