import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = '6b090e53-3732-43e9-9f07-939bae2a0f69';

const fileRaw = fs.readFileSync('scripts/one-off/prd-content-fix-stage-journey-001.json', 'utf8');
const fileSha = crypto.createHash('sha256').update(fileRaw).digest('hex');
const { data: prds } = await sb.from('product_requirements_v2').select('functional_requirements,updated_at').eq('sd_id', SD_UUID);
const dbFrSha = crypto.createHash('sha256').update(JSON.stringify(prds[0].functional_requirements)).digest('hex');
const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const results = {
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  critical_issues: [],
  warnings: [],
  recommendations: [
    "R-7 (BLOCKING, FR-4): add a fourth required fixture flow -- one that contains >=1 unresolvable step AND whose resolvable steps DO form an ordered subsequence, expected COVERED with a FLOW_STEP_UNRESOLVED finding and NO FLOW_COVERAGE_MISSING. This is the only flow shape that discriminates FR-3's rule that an unresolvable step does not fail the flow from an implementation that auto-fails any flow containing one. Verified by simulation: the wrong implementation satisfies every current acceptance criterion in FR-3 and FR-4.",
    "R-7b (BLOCKING, FR-4 AC-6 clause 3): reword 'at least one fixture user_flow is UNCOVERED due to a step with no corresponding screen at all' -- it asserts the exact causation FR-3's R-4 fix was written to deny, and contradicts FR-4's own description clause (e). Correct wording: UNCOVERED because its resolvable steps are never all reached in order, AND separately containing a step with no corresponding screen that raises FLOW_STEP_UNRESOLVED without itself causing the uncoverage (mirroring measured flows 2 and 3).",
    "N-1 (non-blocking, FR-3/FR-4): the PRD never mentions that buildStepsForGoalCluster:159-165 hoists auth-flavored steps to the FRONT of each journey. That sort determines intra-journey step order, which is exactly what FR-3's subsequence check consumes and what FR-4 (c)/(d) fixtures must control. Real flows begin with Login/Sign Up (auth), so a fixture author mirroring the measured shape will hit this. One sentence in FR-4 saves an EXEC cycle.",
    "N-2 (non-blocking, FR-4 (d)): the concatenated sequence contains REPEATS on real data (Busy Content Creator concat = [Dashboard, My Projects, Project Details & Edit x4]). Wrong order therefore does not automatically mean not-a-subsequence. The (d) fixture's expected-UNCOVERED answer must be verified against the actual subsequence algorithm, not eyeballed.",
    "N-3 (non-blocking, FR-3): the concatenation anchor is flow.persona under the bidirectional substring rule, so two distinct Stage-10 persona names that both substring-match one flow.persona would merge into a SINGLE concatenated sequence (permissive, never restrictive). Not reachable on measured data (3 personas, no pairwise substring relation -- verified). One clause naming journey.persona_ref vs flow.persona as the compared pair closes it.",
    "N-4 (non-blocking, DB hygiene not PRD content): the product_requirements_v2 row's executive_summary column is TRUNCATED to 300 chars (the full 1629-char text exists only in the content markdown); system_architecture and implementation_approach are stored as JSON STRINGS rather than objects; the fix file's smoke_test_steps has no corresponding column (smoke_test_cmd is null) so those 3 smoke steps are not in the DB at all; and the content markdown omits the integration_operationalization section entirely, though the structured column does carry the R-3 fix. functional_requirements, technical_requirements, test_scenarios, risks and integration_operationalization all match the fix file exactly, modulo JSON key order.",
  ],
  execution_time: 0,
  validation_mode: 'prospective',
  justification: "CONDITIONAL_PASS, narrowly. R-1 and R-2 as raised are both FULLY CLOSED, and R-3 through R-6 are all correctly fixed -- each re-verified against source lines and the measured AltifyAI snapshot, not accepted on assertion. R-1: FR-3's new PERSONA-JOURNEY SEQUENCE, DEFINED section is unambiguous and factually correct -- confirmed against lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js that journeys.push happens inside a persona->cluster loop and the array is never re-sorted, so emission order has exactly one meaning. R-2: FR-4 (c) and (d) genuinely force ORDER -- a multiset/all-present implementation marks the wrong-order flow COVERED and fails, and the >=3-resolvable-steps floor kills the trivial 1-step case. R-3: verified generateUserJourneys returns {journeys, coverage_selfcheck, findings} at top level and no journey object carries either field. R-4: verified by simulating FR-3's own rule over the snapshot -- measured flows 2 and 3 match 0/5 and 1/5 resolvable steps respectively, so they are indeed uncovered for ordering/reach reasons and not because of their one unresolvable Login step. R-5: all three finding types now carry explicit minimum field specs. R-6: FR-3 and FR-4 AC-4 both state the 4th argument explicitly, and screens/iaPages are confirmed in scope at lines 298-299 before the personas.length check at 303. The single blocking item, R-7, is NEW -- introduced by the R-2/R-4 rewrite itself, not a regression of a prior finding. FR-4's fixture list requires three flows (covered-in-order, uncovered-wrong-order, uncovered-with-unresolvable-step) but omits the one shape that discriminates FR-3's unresolvable-step-does-not-fail-the-flow rule: a flow with an unresolvable step whose resolvable steps DO form an ordered subsequence. A wrong implementation that auto-fails any flow containing an unresolvable step was simulated against every acceptance criterion in FR-3 and FR-4 and satisfies all of them -- the same vacuity class R-2 was raised about. FR-3 AC-5 and FR-4 AC-7 do state the requirement that both findings can occur independently, so if the team lead judges those sufficient to force the missing flow, R-7 downgrades to non-blocking -- but the AC-6 clause-3 wording fix is needed regardless, because as written it asserts the exact causation FR-3's R-4 correction denies. Both halves are text-level edits inside FR-4; no design or scope change. With them, this is a clean PASS.",
  conditions: [
    {
      action: "FR-4: add required fixture flow (f) -- >=1 unresolvable step (a page name with no corresponding screen) AND resolvable steps that DO form an ordered subsequence of the persona's concatenated journey sequence. Expected: COVERED, with a FLOW_STEP_UNRESOLVED finding and NO FLOW_COVERAGE_MISSING finding. Add the matching assertion to FR-4 AC-7. This is the only flow shape under which a correct implementation and an auto-fail-on-unresolvable-step implementation give different answers.",
      blocking: true,
      finding_id: 'R-7',
      evidence: "Simulated the wrong implementation against all three FR-4-mandated flow shapes: (c) the covered flow has no unresolvable step so both implementations mark it covered; (d) the wrong-order flow is uncovered under both; (e) the measured-shape flows are uncovered under both (correct impl: resolvable steps matched 0/5 and 1/5; wrong impl: auto-failed on Login). Every stated flows_covered/uncovered_flows expectation is therefore satisfied by the wrong implementation.",
    },
    {
      action: "FR-4 AC-6, third clause: replace 'UNCOVERED due to a step with no corresponding screen at all' with wording that separates the two causes, e.g. UNCOVERED because its resolvable steps are never all reached in order, and separately containing a step with no corresponding screen that raises FLOW_STEP_UNRESOLVED without itself causing the uncoverage. As written it contradicts FR-3's normative rule, FR-3 AC-5, and FR-4's own description clause (e).",
      blocking: true,
      finding_id: 'R-7b',
      evidence: "FR-3 states the rule three times (this is informational and does not by itself fail the flow's coverage; it does not automatically fail the flow; description clause (e)). FR-4 AC-6 clause 3 states the opposite causation and then denies it in the same sentence.",
    },
  ],
  metadata: {
    phase: 'PLAN',
    review_type: 'pre-implementation_design_review_reverify_round3',
    phase_context: 'PLAN-TO-EXEC test-plan design re-review after the R-1..R-6 PRD rewrite',
    session_id: '81425e08-c5b5-4fde-bafc-f0b9d5e9c349',
    supersedes_row: '2c67573a-2fa5-44ac-a15f-e9a1257843dd',
    governing_row_for_phase: true,
    measured: false,
    reviewed_artifact: 'scripts/one-off/prd-content-fix-stage-journey-001.json + product_requirements_v2 row PRD-SD-LEO-INFRA-FIX-STAGE-JOURNEY-001',
    reviewed_artifact_sha256: fileSha,
    db_functional_requirements_sha256: dbFrSha,
    db_prd_updated_at: prds[0].updated_at,
    evaluated_commit_sha: sha,
    sub_agent_version: '1.0.0',
    ddl_tier_required: false,
    test_execution: {
      tier: 'unit',
      reason: 'Prospective PLAN-phase design review. FR-1..FR-4 are unimplemented, so there is nothing to execute. Declared measured:false. The verification performed was static: source-line reads of stage-15-user-journey.js, a full simulation of FR-3 coverage semantics over the captured AltifyAI snapshot, and a simulation of a deliberately-wrong implementation against every stated acceptance criterion.',
      commands_run: [],
    },
    measurements: {
      live_journeys: 12,
      live_personas: 3,
      journeys_per_persona: 4,
      live_steps: 14,
      live_null_routes: 14,
      snapshot_stories: 18,
      stories_with_id_or_title_or_name: 0,
      stories_not_matching_any_persona: 4,
      coverage_stories_total: 14,
      snapshot_screens: 9,
      snapshot_ia_pages: 14,
      snapshot_user_flows: 4,
      user_flows_grep_hits_in_generator: 0,
      page_type_grep_hits_in_generator: 2,
      generated_from_stories_live: '12 journeys, all empty arrays',
      fr3_simulation_over_snapshot: {
        'New User Onboarding & First Generation': 'unresolvable [Sign Up, Generation History]; resolvable 4; matched 0/4; UNCOVERED',
        'Optimize Existing Content (Batch Processing)': 'unresolvable [Login]; resolvable 5; matched 0/5; UNCOVERED',
        'Product Page Optimization (E-commerce)': 'unresolvable [Login]; resolvable 5; matched 1/5; UNCOVERED',
        'Account & Team Management': 'unresolvable [Login, Team Management]; resolvable 3; matched 0/3; UNCOVERED',
      },
    },
    prior_findings_disposition: {
      R1_persona_journey_sequence: "RESOLVED. FR-3's PERSONA-JOURNEY SEQUENCE, DEFINED section names concatenation in emission order. Verified against source: journeys.push sits inside the persona->cluster loop in generateUserJourneys and the array is never sorted, so emission order is single-valued. FR-4 AC-5 requires a 2+-journey fixture persona with a dedicated assertion. Residual N-3 (persona anchor under non-transitive substring matching) is non-blocking and unreachable on measured data.",
      R2_order_not_exercised: 'RESOLVED. FR-4 (c) requires >=3 resolvable steps in correct order (kills the trivial 1-step covered flow) and (d) requires an uncovered-by-WRONG-ORDER flow, which a multiset-membership implementation fails. Order is genuinely forced.',
      R3_data_contracts_shape: 'RESOLVED and factually correct. Verified generateUserJourneys returns {journeys, coverage_selfcheck, findings} at top level and journey objects carry only journey_id/version/persona_ref/generated_from/entry_conditions/exit_success/steps/tombstones/orphan_story_ids.',
      R4_flow_step_unresolved_reason: 'RESOLVED and independently confirmed by simulation. Measured flows 2 and 3 match 0/5 and 1/5 resolvable steps, so they are uncovered for ordering/reach reasons, exactly as FR-3 now states.',
      R5_flow_coverage_missing_fields: 'RESOLVED. All three finding types now carry explicit minimum field specs: ROUTE_UNRESOLVED {type,persona,journey_id,screen_ref,screen_name}, FLOW_STEP_UNRESOLVED {type,flow_name,page_name}, FLOW_COVERAGE_MISSING {type,persona,flow_name}.',
      R6_zero_persona_early_return: 'RESOLVED. FR-3 and FR-4 AC-4 both require the early-return call site to pass the new 4th argument. Verified screens (line 298) and iaPages (line 299) are computed before the personas.length check (line 303), so the data is in scope.',
      R7_unresolvable_step_discriminator: "NEW, BLOCKING. Introduced by the R-2/R-4 rewrite. FR-4's fixture list omits the only flow shape that discriminates FR-3's unresolvable-step-does-not-fail-the-flow rule, and FR-4 AC-6 clause 3 asserts the causation FR-3's R-4 fix denies.",
    },
  },
};

const resolution = await resolveSubAgentRepo({ subAgentCode: 'TESTING', sdId: SD_UUID });
applySubAgentRepoVerdict(results, resolution);

const { data: ins, error } = await sb.from('sub_agent_execution_results').insert({
  sd_id: SD_UUID,
  sub_agent_code: results.sub_agent_code,
  sub_agent_name: results.sub_agent_name,
  verdict: results.verdict,
  confidence: results.confidence,
  critical_issues: results.critical_issues,
  warnings: results.warnings || [],
  recommendations: results.recommendations,
  execution_time: 0,
  validation_mode: results.validation_mode,
  justification: results.justification,
  conditions: results.conditions,
  metadata: results.metadata,
  phase: 'PLAN',
  source: 'sub_agent_executor',
}).select('id,verdict,created_at,metadata');
if (error) { console.log('INSERT ERR', error.message); process.exit(1); }
console.log('INSERTED', JSON.stringify({
  id: ins[0].id,
  verdict: ins[0].verdict,
  created_at: ins[0].created_at,
  repo_path: ins[0].metadata.repo_path,
  repo_resolved: ins[0].metadata.repo_resolved,
  executed_from_cwd: ins[0].metadata.executed_from_cwd,
}, null, 1));
console.log('file sha256:', fileSha);
console.log('db FR sha256:', dbFrSha);
