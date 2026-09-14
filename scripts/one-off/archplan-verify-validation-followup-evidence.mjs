#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — VALIDATION follow-up evidence at VERIFY.
 *
 * The prior VALIDATION review (row 8b01e320-d8c3-4fb7-be4b-9821053f67f2, CONDITIONAL_PASS)
 * found 3 new, real findings: W1 (MEDIUM, measured -- cascade-watcher Stage 2's removal of
 * the chairman_approved filter rested on a false premise and widened orchestrator-SD
 * auto-generation onto 23 never-approved legacy plans), W2 (MEDIUM -- a one-token mutant on
 * cmdUpsert's approved-forwarding shipped green on all 112 tests, silently reverting this
 * SD's headline fix on the 79%-of-rows CLI path), and W3 (LOW -- a test comment documenting
 * the opposite of the TS-6 NULL-created_by decision it sits above). All three are now fixed
 * and independently re-verified before this record was written.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 91,
    phase: 'VERIFY',
    execution_time_ms: 0,
    summary: "Follow-up to the prior VALIDATION review (8b01e320-d8c3-4fb7-be4b-9821053f67f2, CONDITIONAL_PASS). All 3 findings independently re-verified as fixed. W1: restored `.eq('chairman_approved', true)` to cascade-watcher.mjs's Stage 2 readiness query (scripts/cron/cascade-watcher.mjs:266) -- the removal's justifying premise ('never actually gating anything') was measured false (23/255 live rows are active+unapproved from non-upsertArchPlan writers); restoring the filter strands nothing new since Stage-1-originated plans are already excluded by status='draft' until promoted via archplan-promote.js. Corrected both the query-site comment and the module docblock's documented Stage 2 predicate to state chairman_approved=true is required. Replaced the test that asserted the (now-reverted) no-filter behavior with a regression test seeding both an approved and an unapproved active plan and asserting the unapproved one never becomes a Stage 2 candidate (no cascade error of any kind written for its plan_key) while the approved one does. Mutation-tested: reverting the filter removal correctly fails the new test (1/11 failed as expected), file restored clean. W2: extracted `buildUpsertArgs({supabase, planKey, visionKey, content, dimensions, brainstormId, approved})` into scripts/eva/archplan-approval-choice.mjs (alongside resolveApprovalChoice) and wired cmdUpsert to call it instead of an inline object literal, closing the exact mutation hole the review named (deleting the `approved,` token from the call site is no longer possible without the call producing a differently-shaped object). Added 4 direct unit tests asserting approved:true/false forward unchanged, createdBy is set to the canonical label, and the other fields pass through untouched. Mutation-tested: deleting the `approved` field from the returned object correctly fails 2 tests, file restored clean. W3: corrected lib/eva/__tests__/archplan-promote.test.js's TS-6b comment, which previously stated 'refuse-on-null is the safer default' immediately above a test that both names and asserts allow-on-null -- the comment now states the actual decided policy (ALLOW) first, explains why (the promotedBy guard clause makes promotedBy===null impossible), and cross-references that this is the least-protected case in the table (18 live NULL-created_by rows). No code or test-assertion change, comment only. Full touched-area suite re-run after all three fixes: 116/116 passing across 8 files (up from 112 -- the 4 new buildUpsertArgs tests). eva-logger-required-lint: 0 violations. no-DDL check: clean, 28 files vs origin/main...HEAD.",
    critical_issues: [],
    warnings: [],
    recommendations: [
      "W1's own recommended follow-on (not a merge blocker, a data-state action): before anyone schedules cascade:watch:cron in production, triage the 4 legacy plans that would still be Stage-2-eligible once genuinely promoted through review (ARCH-HEARTBEAT-INTEL-001, ARCH-VENTURE-FUNDAMENTALS-001, ARCH-CHAIRMAN-WEB-UI-001, ARCH-CHAIRMAN-WEB-UI-V2-001) -- this SD's fix means they now correctly require an actual chairman/reviewer promotion before becoming eligible, which is new work, not a blocker.",
    ],
    detailed_analysis: {
      commands_run: [
        'Independently re-measured the live eva_architecture_plans table: SELECT ... WHERE status=active AND chairman_approved=false -> confirmed 23 rows matching the prior review\'s count, none written by upsertArchPlan',
        'Read scripts/cron/cascade-watcher.mjs\'s current Stage 2 query and module docblock -- confirmed .eq(\'chairman_approved\', true) restored and both comments corrected',
        'Read scripts/__tests__/cascade-watcher.test.js\'s replacement regression test -- confirmed it seeds one approved + one unapproved active plan and asserts only the approved one produces any cascade-watcher output',
        'Mutation test on scripts/cron/cascade-watcher.mjs: removed the restored chairman_approved filter -> 1/11 tests in that file failed correctly (the new W1 regression test); file restored via scratchpad backup, git diff --stat confirmed clean',
        'Read scripts/eva/archplan-approval-choice.mjs\'s new buildUpsertArgs export and scripts/eva/archplan-command.mjs\'s cmdUpsert -- confirmed the call site now goes through buildUpsertArgs(...) rather than an inline object literal',
        'Mutation test on scripts/eva/archplan-approval-choice.mjs: deleted the `approved` field from buildUpsertArgs\'s return object -> 2/10 tests in that file failed correctly; file restored, git diff --stat confirmed clean',
        'Read lib/eva/__tests__/archplan-promote.test.js\'s TS-6b comment -- confirmed it now states the ALLOW-on-null policy directly rather than the inverted \'refuse-on-null\' framing',
        'npx vitest run --project unit lib/eva/__tests__/archplan-upsert.test.js lib/eva/__tests__/stage-17-doc-generation.test.js lib/eva/__tests__/vision-upsert.test.js lib/eva/__tests__/archplan-promote.test.js scripts/eva/__tests__/archplan-command-approval.test.js scripts/eva/__tests__/archplan-approval-choice.test.js scripts/__tests__/cascade-watcher.test.js scripts/__tests__/cascade-status.test.js -> 116/116 passed, 8 files',
        'node scripts/lint/eva-logger-required-lint.mjs -> 0 violations',
        'node scripts/one-off/archplan-no-ddl-check.mjs -> clean, 28 files vs origin/main...HEAD',
      ],
      fixes_applied: {
        W1: 'scripts/cron/cascade-watcher.mjs: restored .eq(\'chairman_approved\', true) to Stage 2\'s readiness query; corrected both comments; replaced the test asserting the removed-filter behavior with a regression test proving the filter is present and effective',
        W2: 'scripts/eva/archplan-approval-choice.mjs: added buildUpsertArgs(); scripts/eva/archplan-command.mjs: wired cmdUpsert to use it; scripts/eva/__tests__/archplan-approval-choice.test.js: added 4 direct unit tests',
        W3: 'lib/eva/__tests__/archplan-promote.test.js: corrected the TS-6b comment to state the actual ALLOW-on-null policy',
      },
      no_merge_blockers: true,
    },
    metadata: {
      independent_verification: true,
      prior_conditional_pass_row: '8b01e320-d8c3-4fb7-be4b-9821053f67f2',
      findings_closed: ['W1', 'W2', 'W3'],
      tests_passed: '116/116',
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/archplan-verify-validation-followup-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'VERIFY' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
