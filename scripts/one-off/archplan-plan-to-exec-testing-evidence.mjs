#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — TESTING evidence at PLAN-TO-EXEC.
 *
 * A PLAN-phase testing-agent independently re-verified every PRD claim against live code and
 * DB state, ran the pre-existing baseline suites, and found the test PLAN (not the
 * requirements) had real gaps before any code was written: two scenarios (TS-7/TS-8, DB
 * trigger dependent) were mis-assigned to the unit tier and would have proven nothing against
 * a mock; two CLI scenarios (TS-3/TS-4) had no stated test mechanism given
 * archplan-command.mjs's missing isMainModule guard; FR-5's self-approval guard was measured
 * against live created_by data and found near-vacuous (79% of rows share one agent label, 18
 * are NULL); and FR-5's own cited precedent (_autoApproveCloneVision) would overwrite the
 * created_by column the guard reads. All corrected via PRD amendments before this record.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const test_execution = buildTestExecution({
    executed: 61,
    passed: 61,
    failed: 0,
    skipped: 0,
    runner: 'vitest@4.1.4 (project: unit)',
    source: "npx vitest run --project unit lib/eva/__tests__/archplan-upsert.test.js lib/eva/__tests__/stage-17-doc-generation.test.js lib/eva/__tests__/vision-upsert.test.js -- pre-existing baseline suites, run as this PLAN-phase review's confirmation that no existing assertion currently requires a change (all pass, none assert the approval fields on the captured write payload, so FR-1's default-true change is fully backward-compatible). No SD-specific tests exist yet -- PLAN-TO-EXEC precedes EXEC.",
  });

  const results = {
    verdict: 'PASS',
    confidence: 91,
    phase: 'PLAN-TO-EXEC',
    execution_time_ms: 0,
    summary: "Independently re-verified every factual claim across all 6 FRs against live code and the live DB -- all confirmed accurate (archplan-upsert.js:121-122 hardcode, vision-upsert.js/vision-command.mjs's two-leg pattern, the QF-20260702-262 stage-17 asymmetry, the chairman_approved_at 4/212 baseline, trg_enforce_archplan_quality_advancement's live installed state, the zero-promotion-path finding, the missing approved_by column). Ran the pre-existing baseline suite (61/61, 3 files) confirming zero breaking-change risk -- no current assertion touches the approval fields on the captured write payload. FOUND REAL TEST-PLAN GAPS (not requirement gaps) and corrected them via PRD amendment before EXEC begins: (1) TS-7/TS-8 were assigned type:'unit' but depend on a REAL, live, installed Postgres BEFORE-UPDATE trigger (trg_enforce_archplan_quality_advancement) -- every existing test in this area uses a fully-mocked Supabase client, so a unit test asserting trigger behavior would only assert the mock's own configured return, proving nothing; retyped both to integration tier, naming tests/integration/eva/ and an existing precedent file (clone-vision-repair-dims-preserve.test.js) as the pattern. (2) TS-3/TS-4 (CLI mandatory-choice hard-error) had no stated test mechanism -- archplan-command.mjs has no isMainModule() guard (confirmed by direct read, matching a documented pre-existing note in vision-upsert.js itself about the sibling CLI), so importing it for a test would execute the live CLI; no existing test file or precedent covers this at all (the vision-side equivalent shipped completely untested). Amended TS-3 to name two concrete mechanisms (subprocess test or extract-and-test) and require EXEC to pick one; amended TS-4 to require asserting the actual CALL to rejectStringFlagValue, not re-testing the already-covered helper. (3) FR-5's self-approval guard (promotedBy !== created_by) was measured against live data and found near-vacuous: 202/255 (79%) of rows share the single value 'eva-archplan-command', 18/255 are NULL -- a real reviewing identity will never equal these, so the guard only catches a literal same-label replay, not meaningful reviewer-vs-author enforcement. Corrected FR-5's description and the SD's risk entry to state this honestly as a provenance placeholder pending FR-6's deferred approved_by column, and added TS-6's NULL-created_by case. (4) FR-5's own cited model (_autoApproveCloneVision) writes created_by on every UPDATE -- copying that pattern would overwrite the exact column the guard reads, making a second promotion's guard-check compare against the PROMOTER's own label and destroying provenance; also risked re-triggering the content/sections quality-recalculation trigger, silently flipping quality_checked. Added an explicit constraint to FR-5 (the promotion UPDATE payload must contain ONLY status/chairman_approved/chairman_approved_at) plus a new TS-10 asserting this directly. Added 6 further scenarios for gaps found: FR-2 happy paths (TS-11), both-flags-rejected (TS-12), help-text correction (TS-13), promotion-of-already-active-row provenance-overwrite risk (TS-14), promotion-against-missing-plan_key silent-no-op risk (TS-15), and a scripted no-DDL diff check making FR-6's negative acceptance criterion mechanically enforceable rather than reviewer-eyeballed (TS-16). Test plan now covers 16 scenarios (up from 9), all with a stated mechanism and correct tier.",
    critical_issues: [],
    warnings: [
      {
        id: 'PTE-1',
        severity: 'LOW',
        issue: "stage-17-doc-generation.test.js's mockSupabase discards the eva_architecture_plans upsert record entirely today (no capture array analogous to the existing _visionUpsertCalls) -- TS-5 cannot be written until EXEC extends the mock. Named explicitly as a TS-5 prerequisite in the PRD amendment rather than left implicit.",
        evidence: "Direct read of lib/eva/__tests__/stage-17-doc-generation.test.js's mockSupabase definition.",
      },
      {
        id: 'PTE-2',
        severity: 'LOW',
        issue: "archplan-command.mjs's cmdUpsert function reads a module-global 'opts' variable (declared after the function, at CLI dispatch time) rather than its own parameters for at least one field -- an extract-and-test approach to TS-3/TS-4 (option (b)) would break on this reference if cmdUpsert is imported wholesale. Named explicitly so EXEC doesn't discover it mid-implementation.",
        evidence: "Direct read of scripts/eva/archplan-command.mjs's cmdUpsert function body.",
      },
    ],
    recommendations: [
      'EXEC should pick ONE mechanism for the CLI-level tests (TS-3/TS-4/TS-11/TS-12/TS-13) and apply it consistently -- either subprocess execFile tests or an extracted pure helper plus a wiring assertion.',
      'When writing TS-10, capture the exact UPDATE payload object (not just its effect) to make the created_by/content/sections exclusion directly assertable rather than inferred.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read the PRD from product_requirements_v2 directly -- confirmed all 6 FRs and 9 original test scenarios matched the summary provided',
        'Read lib/eva/archplan-upsert.js, scripts/eva/archplan-command.mjs, lib/eva/vision-upsert.js, scripts/eva/vision-command.mjs, stage-17-doc-generation.js and its test file, stage-execution-worker.js\'s _autoApproveCloneVision in full',
        'Queried pg_trigger/information_schema for trg_enforce_archplan_quality_advancement and trg_auto_validate_archplan_quality -- confirmed both live, installed, enabled, with the should_recalculate content/sections-change guard',
        'Live query: chairman_approved_at population (4/212), created_by distribution (202 eva-archplan-command, 18 NULL, 13+7+others), draft-row count (20), quality_checked=false+approved count (37)',
        'npx vitest run --project unit lib/eva/__tests__/archplan-upsert.test.js lib/eva/__tests__/stage-17-doc-generation.test.js lib/eva/__tests__/vision-upsert.test.js -> 61/61 passed, 3 files',
        'Grepped repo-wide for existing tests of archplan-command.mjs/vision-command.mjs mandatory-choice behavior -- none found',
        'Applied PRD amendments (scripts/one-off/archplan-prd-testing-amendments.mjs): retyped TS-7/TS-8 to integration, added mechanism notes to TS-3/TS-4/TS-5/TS-6, corrected FR-5\'s guard-strength claim and added the created_by/content/sections exclusion constraint, added TS-10 through TS-16, populated smoke_test_cmd',
      ],
    },
    metadata: { independent_verification: true, prd_amended_before_exec: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/archplan-plan-to-exec-testing-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  results.metadata = { ...results.metadata, test_execution };
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
