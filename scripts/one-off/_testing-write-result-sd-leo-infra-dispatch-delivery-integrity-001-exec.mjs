#!/usr/bin/env node
/**
 * Write TESTING (Enhanced QA Engineering Director) EXEC-phase verdict for
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001.
 *
 * SECOND PASS — re-verification against the delta introduced by commit 80273a9fc0f
 * (fix(FR-5/FR-6): resolved-error non-delivery accounting + durable logCoordinationEvent
 * alarm) on top of the state my first verdict (row d1edcb38-fe48-48fe-85d5-25dab9bf4fb4,
 * verdict WARNING) was written against. Independently re-verified, not taken on trust —
 * see findings for what I re-ran/re-mutated myself.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'b165653a-5857-4678-beb6-193ade75478f';
const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';

const findings = [
  {
    id: 'T1-fr5-resolved-error-blind-spot-CONFIRMED-FIXED',
    severity: 'INFO',
    summary: 'Commit 80273a9fc0f adds a check on insertRow\'s RESOLVED return value: `if (res && res.error) { recordUndelivered(...); remaining.splice(idx, 0, qf); continue; }` (scripts/coordinator-idle-qf-hint.mjs, after the existing try/catch). I mutation-tested this myself: disabled the check (`if (res && res.error)` -> `if (false)`) and re-ran tests/unit/coordinator/idle-qf-hint-delivery.test.js -- exactly 3 tests went red (the new "counts a {error} result as UNDELIVERED", "puts BOTH fail-shapes in the SAME denominator", "does not swallow the QF when the failure was a resolved error"), 18 stayed green. Reverted and confirmed clean. This closes the gap I flagged in my first verdict (T3 there) and that the SECURITY sub-agent independently flagged as S10: insertCoordinationRow throws on exactly one class (the enum-violation regex) and resolves normally with {error} for everything else; deliverHints previously only caught throws, so an RLS denial or transient insert fault was booked as delivered. Now both fail-shapes land in `summary.undelivered`/`summary.undeliveredReasons` and the QF is correctly requeued either way. Confirmed genuinely fixed, not just tested.',
  },
  {
    id: 'T2-fr6-durable-alarm-CONFIRMED-FIXED',
    severity: 'INFO',
    summary: 'Commit 80273a9fc0f adds emitDeliveryAlarm(), which now emits through lib/coordinator/coordination-events.cjs logCoordinationEvent (the bus FR-6 names) with payload {dedup_key, ratio, delivered, attempted, undelivered, threshold, min_sample, window_ms, undelivered_reasons, sd}, and a per-window dedup key (deliveryAlarmDedupKey, 1h window) via a new DELIVERY_ALARM_EVENT constant. I read lib/coordinator/coordination-events.cjs:249-267 to confirm logCoordinationEvent\'s actual contract: it is fail-open BY CONTRACT, wraps its own insert in try/catch, and returns {ok:false, error} rather than throwing on any DB fault -- matching what the commit message claims. emitDeliveryAlarm checks `!res || !res.ok` and reports `alarmed:false, reason:\'alarm_write_failed\'` with a CANARY warn rather than claiming a durable record that never landed -- I mutation-tested this too: disabling the check (`if (!res || !res.ok)` -> `if (false)`) reds exactly 1 test ("does NOT claim to have alarmed when the write failed"). I separately mutation-tested the dedup fail-open direction: flipping a hasPriorAlarm-throw from "emit anyway" to "suppress the alarm" reds exactly 1 test ("suppresses a repeat in-window, but FAILS OPEN when the dedup read faults") -- so the two mutations the commit message describes as "reds 2 more" are two independent single-test failures, which I verified separately rather than trusting the combined count. All three mutations reverted cleanly (git status confirmed empty) before continuing. This closes the gap I flagged in my first verdict (T2): the alarm is now durable, carries the full ratio/threshold/window context, is deduplicated per-window, and is provably not silent-fail on a write fault.',
  },
  {
    id: 'T3-fr3-reassessed-PRD-text-defect-not-implementation-gap',
    severity: 'LOW',
    summary: 'Re-examined the coordinator\'s claim that FR-3\'s text is internally inconsistent with FR-1\'s, rather than accepting it. Traced the exact call path: scripts/modules/complete-quick-fix/orchestrator.js:217-219 calls buildMergedReconcileUpdate({qf, prUrl: probeWitness.prUrl, mergeSha, ...}) -- prUrl is ALWAYS `probeWitness.prUrl`, a real, self-derived PR URL string from the QF\'s own merge-witness verification (verifyQFMergeWitness), never null/undefined/empty on this path. The `!scopeAcceptedBy` branch (orchestrator.js:73-86) therefore ALWAYS writes pr_url (and typically commit_sha) in the SAME .update() object as claiming_session_id:null. FR-1\'s four-predicate guard requires pr_url IS NULL AND commit_sha IS NULL to treat a row as reopen-eligible -- a row from this call site can structurally never satisfy that, regardless of implementation choice. This is not a matter of interpretation: FR-1\'s own reused-verbatim guard, which FR-3 itself invokes as the mechanism, mathematically excludes this row shape by construction, and the FR-2 migration\'s own comment independently measures the same population split live (9 in_progress+unclaimed rows: exactly 2 carry pr_url/commit_sha -- this site -- and 7 do not -- the genuine stranded population FR-1/FR-3 target). So FR-3\'s description ("orchestrator.js:84 ACTIVELY MANUFACTURES the stranded state") is factually incorrect against the SD\'s own operative definitions, not merely an EXEC scope judgment call. I concur with the coordinator: this is a PRD-wording defect for PLAN to correct (retire the orchestrator.js:84 reference from FR-3\'s enumerated sites, or add an explicit documented exception), not an unresolved implementation gap. Downgraded from HIGH (my first verdict) to LOW -- the code is correct; the PRD text needs a line-item correction, which does not block this handoff.',
  },
  {
    id: 'T4-fr2-migration-still-not-live-still-correctly-blocked',
    severity: 'INFO',
    summary: 'Re-ran `node scripts/one-off/verify-release-sd-qf-branch.mjs` against the live DB just now: still ALL 5 CHECKS FAIL (status reverts to open / guard status=in_progress / guard pr_url IS NULL / guard commit_sha IS NULL / holder CAS). Unchanged from my first verdict -- expected, since this is chairman-gated CREATE OR REPLACE FUNCTION DDL that the coordinator has correctly refused to self-stamp. Per the coordinator\'s message this has been signalled to the coordinator and remains open pending chairman GO. Reporting again, not treating as a regression or a code defect: the migration FILE is correct and tested at the file level (tests/unit/db/release-sd-qf-branch-sql.test.js, re-ran, still passing).',
  },
  {
    id: 'T5-scope-context-still-accurate-2-of-17-rpc-callers-rewired',
    severity: 'INFO',
    summary: 'The coordinator\'s message asked that this stay in the record: only 2 of 17 `rpc(\'release_sd\'` call sites in the repo (scripts/stale-session-sweep.cjs:1170 and :2650) route through the FR-1 JS helper; the other ~15 remain on the raw, unpatched RPC. This is unchanged by the delta (no commit in this pass touched any of those call sites) and is explicitly, correctly scoped to be closed by the FR-2 RPC fix once the chairman applies it -- not a gap in what shipped. Kept as context, not counted against this verdict.',
  },
  {
    id: 'T6-full-unit-tier-still-shows-zero-attributable-regression',
    severity: 'INFO',
    summary: 'Ran `npm run test:unit` again against the updated HEAD (9f865479e0e): 11 failed test files / 18 failed tests out of 2648 files / 31656 tests. This is a THIRD distinct failure subset across three total full-tier runs on this branch (my first verdict\'s two runs showed 14/22 then a different 14/14; this run shows yet another different 11/18) -- reinforcing that these are pre-existing harness flakiness (parallel-worker/env-isolation noise: tests/unit/setup/env-isolation-guard.test.js and tests/unit/unit-tier-env-isolation.test.js are themselves self-tests of env leakage between tests, and both failed again). Cross-referenced against this branch\'s full diff (14 files touched: lib/fleet/best-effort-release.mjs, lib/coordinator/qf-supply-predicate.cjs, lib/coordinator/coordination-events.cjs, scripts/coordinator-idle-qf-hint.mjs, scripts/stale-session-sweep.cjs, the migration .sql, verify-release-sd-qf-branch.mjs, the two evidence scripts, and the 5 SD test files) -- zero overlap in any of the three runs. No attributable regression from this branch, including from the new FR-5/FR-6 commit.',
  },
  {
    id: 'T7-sd-owned-suite-and-terminal-sites-reconfirmed',
    severity: 'INFO',
    summary: 'Re-ran all 5 SD-owned test files directly: 74/74 pass (up from 65/65 in my first verdict -- the 9 new tests are the FR-5/FR-6 delta, all in tests/unit/coordinator/idle-qf-hint-delivery.test.js). The four legitimately-terminal QF-clear sites are unaffected by this delta (the fix commit only touches scripts/coordinator-idle-qf-hint.mjs and its test file). No repo/application filter was added in the delta (grepped the new commit\'s diff for target_application/repo patterns: zero hits). Tree confirmed clean (git status --short empty) after all mutation tests were reverted.',
  },
];

const warnings = [
  'T4/T5: FR-2\'s literal acceptance criterion ("Migration is applied and verified against the live function definition") remains unmet, and remains correctly outside this handoff\'s power to close -- chairman-gated DDL, explicitly signalled and tracked. This should stay visible in the record through LEAD-FINAL-APPROVAL until the migration is applied and re-verified live.',
  'T3: FR-3\'s PRD text (product_requirements_v2 functional_requirements[2]) still literally names complete-quick-fix/orchestrator.js:84 as a site that must route through the FR-1 helper and still asserts a "zero bare-clear grep hits" AC that is not true of the current (correct) implementation. Recommend PLAN update the AC text so a future reader does not misread this as an open implementation gap.',
];

const recommendations = [
  'PLAN: correct FR-3\'s acceptance_criteria/description text to remove complete-quick-fix/orchestrator.js:84 from the enumerated "stranding" sites (or add an explicit documented exception referencing commit ed0fda01bc1\'s scope-correction note and the live 9-rows/2-carry-pr_url measurement), so the PRD and the shipped code agree.',
  'Apply the FR-2 migration once chairman-approved, then re-run scripts/one-off/verify-release-sd-qf-branch.mjs and land a fresh TESTING/DB verification row confirming the live function now passes all 5 checks -- this is the one remaining substantive gap between "code is correct" and "the incident\'s root cause is fully closed in production."',
  'Low-priority, unchanged from my first verdict: add a mocked-supabase test for lib/coordinator/coordination-events.cjs\'s two gauge functions pinning that they call applyClaimableQfFilter, so a future edit reverting one call site to an inline literal is caught by CI.',
];

const summary = 'CONDITIONAL_PASS. Re-verified independently against the two-commit delta (80273a9fc0f, 9f865479e0e) on top of my first verdict (WARNING, row d1edcb38-fe48-48fe-85d5-25dab9bf4fb4). Both concrete implementation gaps I originally flagged are now genuinely fixed and confirmed by my OWN mutation testing (not taken on the coordinator\'s word): (1) deliverHints now treats a resolved {error} from insertRow as a non-delivery -- disabling that check reds exactly the 3 new tests built to catch it; (2) the FR-6 alarm now emits durably through logCoordinationEvent with a payload carrying ratio/delivered/attempted/undelivered/threshold/min_sample/window and a per-window dedup_key, is provably non-silent on a write failure, and dedup provably fails open -- disabling the write-failure check reds 1 test, flipping dedup to fail-closed reds a different 1 test, both confirmed independently. The SD-owned suite is now 74/74 (was 65/65). Re-ran the full unit tier once more: a THIRD distinct subset of pre-existing failures (11 files / 18 tests this time, vs 14/22 and 14/14 in my first verdict\'s two runs) with zero overlap against this branch\'s 14-file diff in any run -- reinforcing pre-existing harness flakiness, not a regression. On the remaining open item from my first verdict (FR-3\'s literal "zero bare-clear hits" AC against complete-quick-fix/orchestrator.js:84): I independently traced the call path and confirmed the coordinator\'s stronger claim holds -- that call site\'s prUrl argument is always a real, non-null, self-derived PR URL (never empty on this path), so the row it writes can structurally never satisfy FR-1\'s own reused-verbatim guard (pr_url IS NULL AND commit_sha IS NULL). FR-3\'s description is therefore factually inconsistent with FR-1\'s own predicate and with the live-measured population (9 unclaimed in_progress rows, exactly 2 of which carry pr_url -- this site -- and 7 of which do not -- the real target). This is a PRD-text defect for PLAN to correct, not an unresolved implementation gap, so I have downgraded it from HIGH to LOW and it no longer weighs against a passing verdict. The one substantive item still open is unchanged and expected: the FR-2 migration is not applied to the live DB (re-ran the verify script myself, all 5 checks still fail) -- correctly, transparently blocked on chairman-gated DDL, not a code defect, and not something this handoff can or should resolve. Given both prior implementation gaps are now closed and independently confirmed, the reassessed FR-3 finding is a documentation issue rather than a code issue, and the remaining gap is an external dependency rather than a workmanship defect, CONDITIONAL_PASS is warranted: conditional on the FR-2 migration being applied and re-verified live before this SD is treated as fully closed at LEAD-FINAL-APPROVAL.';

const justification = [
  'CONDITIONAL_PASS — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 EXEC-phase re-verification (second pass).',
  '',
  'CONTEXT: my first verdict (row d1edcb38-fe48-48fe-85d5-25dab9bf4fb4) was WARNING/CONCERNS, citing three gaps: (T1) FR-3\'s literal "zero bare-clear hits" AC unmet at orchestrator.js:84 (judged defensible but unreconciled); (T2) FR-6\'s durable-bus/dedup_key mandate skipped in favor of console.error only; (T3) an untested blind spot where a resolved (non-thrown) insertCoordinationRow {error} would be miscounted as delivered. The coordinator reported two commits closing T2 and T3, and offered a sharper argument on T1 that I was asked to check rather than accept.',
  '',
  '1. T2/FR-6 RE-VERIFICATION: read lib/coordinator/coordination-events.cjs:249-267 myself to confirm logCoordinationEvent\'s actual fail-open contract (never throws, returns {ok,id,error}) rather than trusting the commit message\'s characterization. Confirmed emitDeliveryAlarm in scripts/coordinator-idle-qf-hint.mjs checks the resolved {ok} field and reports alarm_write_failed with a CANARY warn on a write fault, carries the full payload (ratio/delivered/attempted/undelivered/threshold/min_sample/window_ms/dedup_key), and the dedup probe fails open on its own read fault. Mutation-tested all three properties independently (disable write-check: 1 test reds; flip dedup direction: 1 different test reds; both reverted). GENUINELY FIXED.',
  '',
  '2. T3/FR-5 RE-VERIFICATION: confirmed deliverHints now inspects the resolved return value of insertRow (`if (res && res.error)`) and treats it identically to a thrown error (recordUndelivered + requeue the QF), via a shared recordUndelivered() helper. Mutation-tested by disabling the check: exactly the 3 new tests built for this case go red, none of the pre-existing 18 do. GENUINELY FIXED.',
  '',
  '3. T1/FR-3 RE-ASSESSMENT (the item the coordinator asked me to check, not accept): traced buildMergedReconcileUpdate\'s only call site (orchestrator.js:217-219) and confirmed prUrl is always `probeWitness.prUrl`, a real self-derived URL, never null/empty on the merge-witness-without-scope-acceptance path. FR-1\'s guard requires pr_url IS NULL to reopen a row; this call site can never produce a matching row by construction, independent of any implementation choice. This makes FR-3\'s characterization of orchestrator.js:84 as an "actively manufactures the stranded state" site a factual error against the SD\'s own operative definitions (FR-1\'s guard, FR-4\'s predicate docs, and the FR-2 migration\'s own measured 9-rows/2-carry-pr_url split) rather than a scope judgment call. I concur with the coordinator\'s reasoning and downgrade this from an implementation concern to a PRD-text correction PLAN should make.',
  '',
  '4. REGRESSION CHECK: re-ran the full unit tier once more against the new HEAD (9f865479e0e2e2a2c17f435083ec96c5cbd7ea0b) -- 11 failed files / 18 failed tests, a third distinct failure subset across three total runs on this branch, zero overlap with the 14-file branch diff in any run. No attributable regression, including from the new commit.',
  '',
  '5. WHAT REMAINS OPEN, unchanged and correctly so: FR-2\'s migration is not live (re-ran verify-release-sd-qf-branch.mjs myself: still 5/5 FAIL). This is chairman-gated DDL, explicitly out of scope for a worker to self-apply, and the coordinator has signalled it. It is the one substantive reason this is CONDITIONAL_PASS rather than a clean PASS: the JS-side fixes are correct and well-tested, but the RPC-level root fix -- which is what closes the other ~15 of 17 release_sd call sites -- has not yet landed in production.',
  '',
  'RATIONALE FOR CONDITIONAL_PASS (not WARNING/CONCERNS, not a clean PASS): both concrete, previously-blocking implementation gaps are now fixed and independently confirmed by my own mutation testing rather than taken on trust. The remaining FR-3 finding is reassessed as a PRD-wording issue, not a code gap. The one real open item (FR-2\'s live migration) is an external, chairman-gated dependency that this handoff correctly cannot resolve on its own -- which is exactly the shape CONDITIONAL_PASS exists to express: the deliverable is sound, full closure is conditioned on an action outside this phase\'s control.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Apply the FR-2 migration (database/migrations/20260727_release_sd_qf_reopen.sql) once chairman-approved, and re-run scripts/one-off/verify-release-sd-qf-branch.mjs to confirm the live function passes all 5 checks before LEAD-FINAL-APPROVAL treats this SD as fully closed.',
      'PLAN to correct FR-3\'s acceptance_criteria/description text (remove or footnote complete-quick-fix/orchestrator.js:84 as an enumerated stranding site) so the PRD matches the shipped, correct implementation.',
    ],
    test_results: {
      sd_owned_suite_isolated: { files: 5, tests: 74, passed: 74, failed: 0, delta_since_prior_verdict: '+9 tests (FR-5/FR-6 resolved-error + durable-alarm coverage)' },
      full_unit_tier_rerun: { files_total: 2648, files_failed: 11, tests_total: 31656, tests_passed: 31553, tests_failed: 18, skipped: 83, todo: 2 },
      attributable_regressions: 0,
      cross_run_failure_sets_differ_across_three_runs: true,
      live_migration_check_rerun: { script: 'scripts/one-off/verify-release-sd-qf-branch.mjs', result: 'ALL 5 CHECKS STILL FAILED (migration not applied to live DB)', expected: true, ran_by_me: true },
      mutation_testing_this_pass: [
        { target: 'scripts/coordinator-idle-qf-hint.mjs deliverHints resolved-error check disabled', file: 'tests/unit/coordinator/idle-qf-hint-delivery.test.js', failed_after_mutation: 3, total: 21, reverted_clean: true },
        { target: 'scripts/coordinator-idle-qf-hint.mjs emitDeliveryAlarm write-failure check disabled', file: 'tests/unit/coordinator/idle-qf-hint-delivery.test.js', failed_after_mutation: 1, total: 21, reverted_clean: true },
        { target: 'scripts/coordinator-idle-qf-hint.mjs emitDeliveryAlarm dedup flipped fail-open to fail-closed', file: 'tests/unit/coordinator/idle-qf-hint-delivery.test.js', failed_after_mutation: 1, total: 21, reverted_clean: true },
      ],
      prior_verdict_row_id: 'd1edcb38-fe48-48fe-85d5-25dab9bf4fb4',
      prior_verdict: 'WARNING (CONCERNS)',
    },
    metadata: {
      review_type: 'EXEC_PHASE_TEST_VERIFICATION_REVERIFICATION',
      files_reviewed: [
        'scripts/coordinator-idle-qf-hint.mjs',
        'lib/coordinator/coordination-events.cjs',
        'tests/unit/coordinator/idle-qf-hint-delivery.test.js',
        'scripts/modules/complete-quick-fix/orchestrator.js',
        'scripts/one-off/verify-release-sd-qf-branch.mjs',
      ],
      review_dimensions: {
        fr5_resolved_error_fix: 'PASS — confirmed genuinely fixed via mutation testing',
        fr6_durable_alarm_fix: 'PASS — confirmed genuinely fixed via mutation testing, contract-checked against real logCoordinationEvent',
        fr3_reassessment: 'PASS (downgraded from HIGH to LOW) — confirmed a PRD-text defect, not an implementation gap',
        full_unit_tier: 'PASS (no attributable regression) — third distinct pre-existing-flaky subset, zero overlap with branch diff',
        fr2_live_deployment: 'BLOCKED, correctly — chairman-gated DDL, still not applied, re-verified',
      },
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
      commits_reviewed_this_pass: ['80273a9fc0f82a2e8aa9d1d5e6317869fe2e4104', '9f865479e0e2e2a2c17f435083ec96c5cbd7ea0b'],
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
