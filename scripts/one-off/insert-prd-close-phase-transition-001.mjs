import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '956482c1-40ba-4f1b-b9ab-a0514f0ed1b5';
const PRD_ID = `PRD-${SD_ID}`;
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const prd = {
  id: PRD_ID,
  directive_id: SD_ID,
  sd_id: SD_ID,
  title: 'Close the phase-transition automation gap: fix info-severity contamination + false-disqualification',
  status: 'approved',
  executive_summary:
    'Fixes a real bug where info-severity preflight issues (SMOKE_TEST_BYPASSED, USER_STORIES_BYPASSED) contaminate rejection reasons and wrongly disqualify SUBAGENT_EVIDENCE_MISSING-only handoffs from auto-invoke eligibility, and delivers a corrected, measured ranked rejection-cause table.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Expose blockingIssues from prerequisite-preflight.js',
      description:
        'scripts/modules/handoff/pre-checks/prerequisite-preflight.js already computes blockingIssues (issues.filter(i => i && i.severity !== \'info\')) at line 253 to derive `passed`, but the return statement at lines 254-257 only exposes {passed, issues} -- the filtered array is discarded. Add blockingIssues to the returned object.',
      priority: 'MUST',
      acceptance_criteria: [
        'The preflight function return object includes blockingIssues alongside the existing passed and issues fields',
        'blockingIssues is exactly issues.filter(i => i && i.severity !== \'info\'), reusing the existing computation (no duplicated predicate)',
      ],
    },
    {
      id: 'FR-2',
      requirement: 'HandoffOrchestrator.js consumes blockingIssues, not raw issues, at the 3 identified call sites',
      description:
        'scripts/modules/handoff/HandoffOrchestrator.js:65-72 (resolveMissingAgentsForAutoInvoke, the .every() eligibility check), :203-226 (the rejection message builder at line 221 and preflightResult.preflightIssues at line 223), and :40-54 (applyPreflightToVerdict) all currently map/filter/check over the raw preflight.issues array, which can contain info-severity entries. Switch these to preflight.blockingIssues.',
      priority: 'MUST',
      acceptance_criteria: [
        'resolveMissingAgentsForAutoInvoke returns the missing agent list when the ONLY blocking issue is SUBAGENT_EVIDENCE_MISSING, even if an info-severity issue (e.g. SMOKE_TEST_BYPASSED) is also present in the raw issues array',
        'The rejection message and preflightResult.preflightIssues list only blocking (non-info) codes',
        'The full, unfiltered issues array is still logged to console for operator visibility (display-only use is unaffected)',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'Ranked rejection-cause measurement script',
      description:
        'A committed one-off script (or durable script under scripts/) that queries sd_phase_handoffs.rejection_reason over a trailing 30-day window, parses cause tokens, computes sole-blocker counts (excluding info-severity codes), and prints a ranked table with a fresh measurement timestamp. Corrects the SD\'s own originally-illustrative rejection-cause list, which missed RETROSPECTIVE_QUALITY_GATE and PRE_PLAN_ADVERSARIAL_CRITIQUE and incorrectly included USER_STORIES_BYPASSED (a 0/0 sole-blocker info code) as if it were a real rejection cause.',
      priority: 'MUST',
      acceptance_criteria: [
        'Running the script prints a ranked top-5 (or more) table with counts, matching the VALIDATION sub-agent baseline order: SUBAGENT_EVIDENCE_MISSING, GATE_MECHANISM_CLAIM_VERIFIER, RETROSPECTIVE_QUALITY_GATE, SMOKE_TEST_SPECIFICATION, PRE_PLAN_ADVERSARIAL_CRITIQUE',
        'The script excludes severity:info codes from the ranking (they are not rejection causes)',
        'Output includes the measurement timestamp so a re-run after the fix is comparable, not a hardcoded snapshot',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Before/after re-measurement, honestly reported',
      description:
        'After FR-1/FR-2 land, re-run the FR-3 measurement script and record the before/after sd_phase_handoffs ratio with timestamps. VALIDATION sub-agent found the fix affects contamination and auto-invoke eligibility, not the underlying evidence-missing rate itself, so a large ratio jump should NOT be expected or claimed -- report the actual delta honestly, including if it is small.',
      priority: 'MUST',
      acceptance_criteria: [
        'A before-stamp and after-stamp measurement both exist, both using the FR-3 script (same methodology, no goalpost-moving between the two runs)',
        'The reported delta is not overstated relative to what FR-1/FR-2 could plausibly cause (contamination/eligibility fix, not a root-cause fix for evidence being genuinely missing)',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'Auto-invoke enablement routed as a chairman decision request, not implemented',
      description:
        'SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001 already built an auto-invoke-missing-sub-agents remediation (lib/handoff/preflight-auto-invoke.js, wired at HandoffOrchestrator.js:187), flag-gated OFF behind HANDOFF_PREFLIGHT_AUTO_INVOKE (only literal "true" enables it). Its own header states enablement requires a separately recorded chairman decision. This is the single largest lever on cause #1 (SUBAGENT_EVIDENCE_MISSING, 49.7% of the measured deficit) but is explicitly OUT OF SCOPE for this SD to flip -- instead, send a durable /signal request to the coordinator/chairman describing the lever and its measured impact, so the decision is made explicitly rather than silently deferred or silently implemented.',
      priority: 'MUST',
      acceptance_criteria: [
        'A /signal (durable channel) is sent describing the auto-invoke flag, its current OFF state, its governing SD (SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001), and its measured potential impact (up to ~10 percentage points on the sd_phase_handoffs ratio per VALIDATION\'s sole-blocker-removal arithmetic)',
        'This SD does NOT flip the HANDOFF_PREFLIGHT_AUTO_INVOKE flag itself',
      ],
    },
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Minimal, surgical diff',
      description: 'FR-1/FR-2 together should be under 15 LOC: one field added to a return object, and 3 call sites changed from .issues to .blockingIssues.',
    },
    {
      id: 'TR-2',
      requirement: 'No gate predicate weakened',
      description: 'This fix corrects which array downstream logic reads (already-filtered vs raw) -- it does not change what counts as a blocking issue, what severity levels exist, or any gate\'s pass/fail threshold.',
    },
    {
      id: 'TR-3',
      requirement: 'Fixture covers both directions',
      description: 'The fixture must prove BOTH that an info-only-contaminated result no longer wrongly blocks/disqualifies, AND that a genuinely deficient (real blocking-issue) result still rejects exactly as before -- a fix that only tests the happy path could accidentally widen what passes.',
    },
  ],
  system_architecture: {
    overview: 'A one-field return-object addition in the preflight module, matched by 3 call-site updates in the orchestrator that consumes it, plus a measurement script that reads the same table the vision gauge reads.',
    components: [
      'scripts/modules/handoff/pre-checks/prerequisite-preflight.js (FR-1)',
      'scripts/modules/handoff/HandoffOrchestrator.js (FR-2)',
      'scripts/one-off/measure-phase-transition-rejection-causes.mjs (FR-3, FR-4)',
    ],
    data_flow: 'prerequisite-preflight.js runs preflight checks -> returns {passed, issues, blockingIssues} -> HandoffOrchestrator.js consumes blockingIssues for eligibility + rejection-reason construction, and issues (unfiltered) only for console display.',
    integration_points: ['sd_phase_handoffs.rejection_reason (read by FR-3/FR-4 measurement, written by HandoffOrchestrator.js)', 'lib/handoff/preflight-auto-invoke.js (consumer of the corrected eligibility check, FR-2)'],
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'Info-only + real blocker coexist', expected: 'resolveMissingAgentsForAutoInvoke returns missing agents when blockingIssues is [SUBAGENT_EVIDENCE_MISSING] even though raw issues also contains an info-severity entry' },
    { id: 'TS-2', scenario: 'Rejection message excludes info codes', expected: 'A live handoff on an infrastructure SD (which emits USER_STORIES_BYPASSED info) with a genuine SUBAGENT_EVIDENCE_MISSING gap prints a rejection reason naming only SUBAGENT_EVIDENCE_MISSING' },
    { id: 'TS-3', scenario: 'Genuinely deficient result still rejects', expected: 'A preflight result with a real, non-info blocking issue and no info issues still returns passed:false and blocks exactly as before the fix' },
    { id: 'TS-4', scenario: 'Ranked measurement reproducibility', expected: 'Running the FR-3 script twice in quick succession against unchanged data returns the same ranking and counts' },
    { id: 'TS-5', scenario: 'Before/after delta reported honestly', expected: 'The FR-4 before/after report does not claim the fix alone closes the gap to >=90% -- VALIDATION\'s arithmetic shows top-5 sole-blocker removal reaches ~91%, but this fix addresses contamination/eligibility only, a smaller effect' },
  ],
  acceptance_criteria: [
    'A ranked rejection-cause table exists with measured counts matching the VALIDATION baseline (SD success criterion 1)',
    'The info-severity contamination + false-disqualification bug is fixed with a bidirectional fixture (SD success criterion 2)',
    'The gauge probe is re-measured after the fix and the delta reported honestly, including if small (SD success criterion 3, corrected from the SD\'s original unmeasurable "manual intervention" framing)',
    'The auto-invoke enablement decision is routed to the chairman via /signal, not silently implemented or dropped (SD success criterion 4)',
  ],
  risks: [
    {
      risk: 'The fix could be perceived as insufficient given the SD\'s original >=90% target',
      mitigation: 'The SD\'s own success_criteria and scope were corrected in LEAD phase (VALIDATION sub-agent measurement) to target the gauge\'s actual 80% band via top-5 sole-blocker removal, with the largest single lever (auto-invoke enablement) explicitly routed to the chairman as a decision request rather than silently promised as part of this SD\'s delivery.',
      rollback_plan: 'The 3-call-site change is a revert of a single commit; prerequisite-preflight.js\'s existing behavior (return {passed, issues}) is unaffected for any caller not consuming the new blockingIssues field.',
    },
    {
      risk: 'A fixture that only tests the happy path could accidentally widen what the gate considers passing',
      mitigation: 'TR-3 requires the fixture to prove both directions: info-only contamination no longer blocks, AND a genuine blocking issue still blocks.',
      rollback_plan: 'N/A -- test-only requirement, no production behavior change from the fixture itself.',
    },
    {
      risk: 'Overstating the before/after ratio improvement misleads the chairman-facing vision gauge',
      mitigation: 'FR-4 explicitly requires honest reporting, including a small delta, and TS-5 pins this as a test scenario so a future reviewer can catch an inflated claim.',
      rollback_plan: 'N/A -- reporting discipline, not a code change.',
    },
  ],
  implementation_approach: {
    phases: [
      { phase: 1, description: 'Add blockingIssues to prerequisite-preflight.js return object (FR-1)' },
      { phase: 2, description: 'Switch the 3 HandoffOrchestrator.js call sites to consume blockingIssues (FR-2)' },
      { phase: 3, description: 'Write the FR-3 measurement script, run before-stamp' },
      { phase: 4, description: 'After FR-1/FR-2 merge, run after-stamp measurement (FR-4) and send the chairman decision request (FR-5)' },
    ],
    technical_decisions: [
      'Option A (expose blockingIssues) chosen over Option B (caller-side re-filtering) per Explore sub-agent recommendation -- DRY, reuses the existing computed filter instead of duplicating the severity!==info predicate in a second file',
    ],
  },
  integration_operationalization: {
    consumers: ['Vision build gauge (lib/vision/vdr-probes.js, reads sd_phase_handoffs ratio)', 'Coordinator/chairman (via the FR-5 /signal decision request)'],
    dependencies: ['scripts/modules/handoff/pre-checks/prerequisite-preflight.js', 'scripts/modules/handoff/HandoffOrchestrator.js', 'sd_phase_handoffs table'],
    data_contracts: ['preflight return shape: {passed: boolean, issues: Issue[], blockingIssues: Issue[]}'],
    runtime_config: 'No new env vars. Does not touch HANDOFF_PREFLIGHT_AUTO_INVOKE (that remains the chairman-gated flag, unchanged by this SD).',
    observability_rollout: 'The FR-3/FR-4 measurement script IS the observability surface -- no dashboard change needed.',
  },
  exploration_summary: {
    files_read: [
      'scripts/modules/handoff/pre-checks/prerequisite-preflight.js',
      'scripts/modules/handoff/HandoffOrchestrator.js',
      'lib/handoff/preflight-auto-invoke.js',
      'sd_phase_handoffs (table, via live queries)',
    ],
    patterns_identified: [
      'A value computed for internal use (blockingIssues) but not exposed on the return object is a real, recurring class of bug distinct from this SD\'s originally-cited generator-placeholder framing',
      'severity:info issue codes exist and are a legitimate, intentional design (info-severity exemptions for SD-type-specific bypasses) but were never protected from raw-array consumption at the call sites',
    ],
    key_decisions: [
      'Rescoped from "fix the top-2-cause upstream generators" (arithmetically infeasible per VALIDATION: top-5 sole-blocker removal only reaches ~91%, and causes #2-5 have no single upstream generator to fix) to "fix a real, verified, surgical bug (contamination + false-disqualification) plus honest re-measurement plus an explicit chairman decision request for the single largest lever"',
      'Corrected the SD\'s own illustrative rejection-cause list against a live measurement before committing to fix any specific cause',
    ],
    exploration_date: '2026-08-30',
  },
};

async function main() {
  const { error } = await supabase.from('product_requirements_v2').insert(prd);
  if (error) throw error;
  console.log('Inserted PRD', PRD_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
