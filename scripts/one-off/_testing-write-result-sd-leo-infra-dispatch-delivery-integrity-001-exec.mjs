#!/usr/bin/env node
/**
 * Write TESTING (Enhanced QA Engineering Director) EXEC-phase verdict for
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001.
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
    id: 'T1-fr3-literal-ac-not-met-orchestrator-84-still-bare-but-defensibly-so',
    severity: 'HIGH',
    summary: 'FR-3\'s acceptance_criteria reads literally: "All three stranding sites call the FR-1 helper... A grep for a bare claiming_session_id clear on quick_fixes outside the helper returns zero hits." I grepped it myself: scripts/modules/complete-quick-fix/orchestrator.js:84 (`claiming_session_id: null` inside buildMergedReconcileUpdate\'s no-scope-attestation branch) is still a bare, non-helper clear -- the grep does NOT return zero hits. HOWEVER, on reading the call site and the FR-1 helper\'s guard, EXEC\'s decision not to route it appears to be the correct engineering call, not a shortcut: that site ALWAYS writes pr_url atomically in the SAME .update() as the claiming_session_id clear (QF-20260725-691\'s merge-witness parking), so the row it produces can never match clearAndReopenQf\'s four-predicate guard (which requires pr_url IS NULL). Routing it through the helper would be either a silent no-op (claiming_session_id would then NEVER clear, regressing QF-20260711-176\'s worktree-reaper fix) or, if the guard were loosened to make it "work," would incorrectly reopen a scope-unattested row to status=\'open\' -- destroying the attestation gate. tests/unit/fleet/qf-clear-and-reopen.test.js has a dedicated, well-reasoned describe block ("FR-3: the merge-witness path must NOT be routed through this helper", lines 181-198) proving exactly this. So the AC TEXT is not literally satisfied by the shipped code, even though the shipped behavior is arguably more correct than literal compliance would produce. This needs to be reconciled explicitly (amend the AC, or record a documented waiver) rather than left as a silently-unmet criterion.',
  },
  {
    id: 'T2-fr6-durable-bus-and-dedup-key-mandate-skipped-narrower-ac-still-passes',
    severity: 'HIGH',
    summary: 'FR-6\'s description explicitly mandates mirroring lib/chairman/sms-channel-health.js: "durable emit carrying ratio/bad/total/window/threshold, dedup_key idempotency, and fail-soft on alarm-write failure... Emit through the existing bus (lib/coordinator/coordination-events.cjs logCoordinationEvent) rather than inventing one." Grepped scripts/coordinator-idle-qf-hint.mjs: zero references to logCoordinationEvent, zero to dedup_key. The shipped alarm (main(), ~lines 262-276) is `console.error` only -- loud on stderr, not durable, not deduplicated, not routed through the coordination bus. The narrower, literally-testable acceptance_criteria text ("emits delivered AND attempted"; "alarm fires below threshold, does NOT fire at full delivery or below minSample -- all three asserted"; "1-of-10 and 9-of-10 produce DIFFERENT observable outcomes") IS met and IS well tested (tests/unit/coordinator/idle-qf-hint-delivery.test.js, 9 tests covering exactly these cases, confirmed passing and confirmed non-vacuous by mutation -- see T7). But the broader implementation mandate in the FR-6 description was not followed, and the result is an alarm that is exactly the class of thing this SD\'s own Part A narrative warns against ("a record nobody reads") if nobody is tailing this script\'s stderr when it runs on a cron/cadence -- and unlike sms-channel-health.js\'s dedup_key (fires once per day), a sustained degraded run here would re-emit the same alarm to stderr on every tick with no suppression.',
  },
  {
    id: 'T3-fr5-ratio-blind-spot-on-non-throwing-insert-failures-corroborates-security-s10',
    severity: 'MEDIUM',
    summary: 'Read lib/coordinator/dispatch.cjs:718-897 (insertCoordinationRow) end to end. It only THROWS for a narrow set of conditions (bad row shape, work_assignment/message_type mismatch, untyped-Adam-kind, the upstream assertValidTarget/assertFleetAssignmentTarget/assertSdDispatchable/assertWorkerTierAllowed/assertDoorRoutingAllowed guards, and ONE specific enum-violation regex match on the final insert\'s returned error at line 887). Any OTHER insert failure -- a different constraint violation, a transient network/DB error, an RLS block -- causes the function to return NORMALLY with `{data:null, error:{...}}`, not throw. scripts/coordinator-idle-qf-hint.mjs\'s deliverHints does `await insertRow(...)` without ever inspecting the resolved return value; only a THROWN error increments summary.undelivered. So this whole broader failure class falls through silently to `summary.hinted += 1` -- counted as delivered when it was not. None of the 12 tests in idle-qf-hint-delivery.test.js cover this: every injected insertRow fake either throws or resolves cleanly by pushing to `sent` -- none resolves with an unthrown `{error}`. This is an unfixed AND untested blind spot in the delivery ratio\'s accuracy, though it is a narrower failure class than the one actually observed in the 2026-07-26 incident (which was a THROWN dispatch-target error, now correctly fixed). Independently corroborated: the SECURITY sub-agent\'s own EXEC-phase writeup for this SD (scripts/one-off/_security-write-result-sd-leo-infra-dispatch-delivery-integrity-001-exec.mjs, finding S10) flags the identical gap by the identical mechanism -- I read dispatch.cjs myself before finding that file and reached the same conclusion independently, which I read as a good cross-check rather than a duplicate.',
  },
  {
    id: 'T4-fr2-migration-not-live-known-honest-correctly-blocked-verified-myself',
    severity: 'INFO',
    summary: 'Ran `node scripts/one-off/verify-release-sd-qf-branch.mjs` myself against the live DB: all 5 checks FAIL (status reverts to open / guard status=in_progress / guard pr_url IS NULL / guard commit_sha IS NULL / holder CAS on the QF branch), confirming database/migrations/20260727_release_sd_qf_reopen.sql is genuinely not applied to the live release_sd function. This matches the prompt\'s own known-honest-state framing exactly and is correctly NOT self-stamped (CREATE OR REPLACE FUNCTION is chairman-gated DDL). Reviewed the migration file itself: it reuses the exact four-predicate guard verbatim, adds the holder CAS the SD branch already had (parity fix), and preserves the SD branch / SECURITY DEFINER / search_path byte-for-byte -- all independently pinned by tests/unit/db/release-sd-qf-branch-sql.test.js (7 tests, ran and confirmed passing), which is explicit and self-aware about the file-vs-deployed distinction (its own describe block "this test does not claim the migration is deployed" names the live-check script by path). This is the correctly-blocked item the prompt asked me not to paper over -- reported as an open item, not a test failure.',
  },
  {
    id: 'T5-fr2-live-exposure-window-wider-than-one-blocked-migration',
    severity: 'MEDIUM',
    summary: 'Grepped every `rpc(\'release_sd\'` call site in the repo: 17 total. Only 2 (scripts/stale-session-sweep.cjs:1170 and :2650) were rewired in this diff to route the QF-clear path through the fixed JS helper (clearAndReopenQf). The other ~15 (lib/claim-guard.mjs, lib/commands/claim-command.js, lib/session-manager.mjs, scripts/hooks/reclaim-sd-after-compaction.cjs, scripts/hooks/session-state-sync.cjs, scripts/modules/claim-health/self-heal.js, scripts/modules/complete-quick-fix/orchestrator.js:713 [the RPC call site, distinct from the terminal literal-write site at :699], scripts/modules/handoff/claim-swapper.js, scripts/modules/handoff/executors/lead-final-approval/helpers.js, scripts/modules/sd-next/claim-analysis.js, scripts/sd-start.js) all still call the raw, unpatched RPC directly. Until the FR-2 DDL ships, an ordinary QF release through any of those ~15 paths (a worker session ending or being reclaimed while it holds a QF) still hits the original clear-without-revert branch -- Part A of the incident remains substantively live for the majority of real release paths, not merely a single blocked follow-up step. This is not a defect in what shipped (the JS-side mitigation genuinely closes the specific stranding mode it targets, and FR-4\'s gauge fix stops the false "supply is healthy" signal regardless of which path stranded the row), but it sizes the residual risk more precisely than "one migration is pending." Same conclusion the SECURITY sub-agent reached independently via the same grep (its S13).',
  },
  {
    id: 'T6-coordination-events-gauge-wiring-confirmed-by-code-read-not-by-test',
    severity: 'LOW',
    summary: 'FR-4\'s two named gauge sites (lib/coordinator/coordination-events.cjs ~193-194 the primary head-count feeding bundle.unclaimedItems, and ~496) both now correctly call the shared applyClaimableQfFilter(supabase.from(\'quick_fixes\')...) -- confirmed by direct diff read, not merely trusted. But no test exercises gatherDetectorInputs/gatherCompletionBoundaryExitInputs with a mocked supabase to pin that both call sites actually route through the shared predicate (as opposed to, say, an inline near-duplicate filter that happens to agree today). tests/unit/coordinator/qf-supply-gauge-agreement.test.js only tests the predicate module in isolation. A future edit reverting one of the two coordination-events.cjs call sites to an inline literal would not be caught by any test -- only by a code reviewer. Minor, since I did directly verify the wiring by reading the diff.',
  },
  {
    id: 'T7-mutation-testing-confirms-negative-controls-are-load-bearing-not-vacuous',
    severity: 'INFO',
    summary: 'Per the prompt\'s instruction to try mutating the code and confirm tests go red: (a) removed the pr_url/commit_sha guard lines from clearAndReopenQf (lib/fleet/best-effort-release.mjs) -> 6 of 18 tests in qf-clear-and-reopen.test.js failed, exactly the guard-refusal, merge-witness-exclusion, and detection-on-refusal tests; 12 unrelated tests (plain allow case, claimant guard, terminal guard, missing-argument handling) still passed. (b) reverted CLAIMABLE_QF_STATUSES in lib/coordinator/qf-supply-predicate.cjs to the old buggy [\'open\',\'in_progress\'] -> 4 of 8 tests in qf-supply-gauge-agreement.test.js failed, exactly the ones asserting the STRANDED-row disagreement and the DIRECTION pin. (c) removed the try/catch from deliverHints in scripts/coordinator-idle-qf-hint.mjs, reintroducing the exact original bare-call bug -> 3 of 12 tests in idle-qf-hint-delivery.test.js failed (CONTINUES past a failure in the middle / does not swallow the QF / does not throw out of the pass), reproducing the original fleet-wide-starvation failure mode verbatim. All three mutations were reverted afterward and the tree confirmed clean (git status empty) before moving on. This is strong evidence the FR-1/FR-3/FR-4/FR-5 negative controls are real, not decorative. FR-7\'s reachability test (tests/unit/fleet/qf-clear-and-reopen.test.js:102-109) is also confirmed non-vacuous by inspection: it imports the REAL isAutoStartableQF from scripts/worker-checkin.cjs via createRequire (not a local reimplementation), asserts false BEFORE the mutation and true AFTER on the SAME row object -- exactly avoiding PAT-TEST-STUBBED-WRITER-UNVERIFIED-001, which this PRD explicitly names.',
  },
  {
    id: 'T8-prohibitions-and-terminal-sites-verified-clean',
    severity: 'INFO',
    summary: 'Verified all stated prohibitions/invariants directly: (1) non-critical QF pull order -- tests/unit/worker-checkin-critical-qf-priority-jump.test.js is globally quarantined in tests/quarantine-manifest.json, but for a PRE-EXISTING, unrelated reason (assertion-drift / hardcoded fixture-date rot, quarantined 2026-07-08, manifest untouched by this diff\'s git diff-stat). Temporarily un-quarantined it and ran it directly against this branch: 8/8 PASS, then reverted the manifest edit (git checkout, confirmed clean). (2) No repo/application filter added or tightened -- grepped the full branch diff for target_application/repo filter patterns: zero hits. (3) The four legitimately-terminal sites are untouched: scripts/stale-session-sweep.cjs:1061-1092 (bulk clear for status IN (completed,cancelled,escalated,closed), sits outside the changed diff hunks), scripts/modules/complete-quick-fix/orchestrator.js:103 and :699 (both status:\'completed\', file entirely absent from the 12-file diff --stat), lib/sd-creation/source-adapters/qf.js:104/:115 (status:\'escalated\', file entirely absent from the diff). All confirmed via git diff --stat cross-reference, not assumption.',
  },
];

const warnings = [
  'T1/T2: two of the PRD\'s FR-level acceptance_criteria/description mandates are not literally satisfied by the shipped code (FR-3\'s "zero bare-clear hits outside the helper" and FR-6\'s "durable emit through logCoordinationEvent with dedup_key"), even though in both cases the narrower, machine-checkable behavior the tests assert is genuinely correct and well-covered. These should be explicitly reconciled (amend the AC text to match the reasoned deviation, or close the gap) rather than left as silently-unmet criteria on a PASS.',
  'T3: the FR-5/FR-6 delivery ratio has a real, untested blind spot for insertCoordinationRow failures that resolve with an unthrown {error} rather than throwing (corroborated independently by the SECURITY sub-agent\'s S10). The specific incident defect (a thrown DISPATCH_TARGET_* error aborting the whole pass) is correctly fixed; this is a narrower residual gap in the same telemetry, not a repeat of the original bug.',
  'T5: only 2 of 17 release_sd RPC call sites route through the FR-1 helper; until the FR-2 migration is applied, ~15 callers remain exposed to the original Part-A stranding defect. This sizes the open risk beyond "one migration is chairman-gated."',
];

const recommendations = [
  'Reconcile FR-3\'s AC text with the shipped (and, on the merits, more correct) decision to exclude scripts/modules/complete-quick-fix/orchestrator.js:84 from the helper -- either amend the acceptance_criteria to name the exclusion explicitly, or file a follow-on noting the deviation was reviewed and accepted.',
  'Either wire the FR-6 alarm through lib/coordinator/coordination-events.cjs logCoordinationEvent with a dedup_key (mirroring lib/chairman/sms-channel-health.js as the description mandates), or explicitly re-scope FR-6\'s description to match the console-only implementation that shipped.',
  'Close the FR-5 ratio blind spot: have deliverHints treat a resolved {error} from insertRow the same as a thrown error (increment undelivered, requeue the QF), and add a test case where the fake insertRow resolves with {data:null, error:{...}} instead of throwing.',
  'Track a follow-on to rewire the remaining ~15 release_sd RPC call sites (or apply the FR-2 migration promptly once chairman-approved) so Part A\'s exposure window closes fleet-wide, not just on the stale-session-sweep path.',
  'Add a mocked-supabase test for lib/coordinator/coordination-events.cjs\'s two gauge functions pinning that they call applyClaimableQfFilter, so a future edit reverting one call site to an inline literal is caught by CI rather than a reviewer.',
];

const summary = 'CONCERNS. All 5 SD-owned test files pass in isolation (65/65) and, on direct mutation testing of FR-1/FR-3/FR-4/FR-5\'s core guards, the negative controls are demonstrably load-bearing (not vacuous) -- breaking each guard one at a time produced exactly the expected, surgical test failures, then cleanly reverted. FR-7\'s reachability test correctly uses the REAL isAutoStartableQF (not a reimplementation) and asserts unreachable-before/reachable-after on the same row. Full unit tier (npm run test:unit): two separate runs on this branch produced 22 and 14 failing tests respectively (different subsets each time -- itself evidence of pre-existing test-harness flakiness/non-determinism, e.g. tests/unit/setup/env-isolation-guard.test.js and tests/unit/unit-tier-env-isolation.test.js are literally self-tests of env leakage between tests and were themselves flaky). Zero of the failing tests in either run belong to any of the 12 files this branch\'s diff touches (confirmed via git diff --stat cross-reference) -- no attributable regression. The non-critical-QF pull-order test (quarantined pre-existing, unrelated reason) was run directly against this branch and passes 8/8. No repo/application filter was added or tightened anywhere in the diff. The four legitimately-terminal QF-clear sites are confirmed untouched. FR-2\'s migration is correctly, transparently blocked (chairman-gated DDL; verify-release-sd-qf-branch.mjs fails all 5 live checks, run and confirmed by me) and the migration file itself is well-built and correctly tested at the file level. Set against that: two FR-level acceptance criteria are not literally met by the shipped code (FR-3\'s "zero bare-clear hits outside the helper" -- orchestrator.js:84 remains a bare clear, though I judge the underlying engineering decision correct, since that site can never actually produce the stranded shape and routing it through the helper would regress QF-20260711-176 or break the QF-20260725-691 attestation gate; and FR-6\'s explicit "durable emit via logCoordinationEvent + dedup_key" mandate, where only a console.error was shipped -- the narrower, literally-testable AC text does pass). There is also a real, untested blind spot where a non-thrown insertCoordinationRow failure would be silently miscounted as delivered by the new ratio (independently corroborated by the SECURITY sub-agent\'s own S10 finding, reached before I read that file). Finally, only 2 of 17 release_sd RPC callers were rewired in this diff, so Part A\'s root defect remains live for most real release paths until the DDL ships -- a wider residual exposure than "one blocked migration" implies. None of this is worked-around or hidden; it is reported as found.';

const justification = [
  'CONCERNS — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 EXEC-phase test verification.',
  '',
  '1. SD-OWNED TEST FILES: ran all 5 directly (tests/unit/fleet/qf-clear-and-reopen.test.js, tests/unit/coordinator/idle-qf-hint-delivery.test.js, tests/unit/coordinator/qf-supply-gauge-agreement.test.js, tests/unit/db/release-sd-qf-branch-sql.test.js, tests/unit/stale-sweep-qf211-claim-guards.test.js) -- 65/65 passed.',
  '',
  '2. FULL UNIT TIER: ran `npm run test:unit` twice. Run 1: 14 failed test files / 22 failed tests out of 2648 files / 31647 tests. Run 2 (same commit, no code changes between runs): a DIFFERENT set of 14 failed files. The differing failure sets across identical runs is itself evidence these are pre-existing environmental/harness flakiness, not a deterministic regression. Cross-referenced every failing file against `git diff --stat $(git merge-base HEAD origin/main) HEAD` (12 files touched by this branch) -- zero overlap in either run.',
  '',
  '3. FR-TO-TEST MAPPING, adversarially: FR-1 (shared helper, paired allow/refuse) -- MET, and the pairing is literal (each refuse case in qf-clear-and-reopen.test.js is paired with the ALLOWS case at the top of the file, which the file itself calls out as load-bearing). FR-2 (RPC root fix) -- the .sql file is correct and tested at the file level; the LIVE function is verified NOT deployed (I ran the verify script myself, all 5 checks fail) -- correctly blocked, chairman-gated, not papered over. FR-3 (three stranding sites through the helper) -- 2 of 3 literally routed (stale-session-sweep.cjs + its wrapper); the third (orchestrator.js:84) is NOT routed, and I verified the "zero hits" grep claim is FALSE by grepping it myself -- see T1 for why I believe the shipped behavior is nonetheless correct on the merits. FR-4 (gauge agreement) -- MET, divergence is genuinely representable (STRANDED-row case: old inline predicate would have counted it, isClaimableQfSupply now correctly excludes it, isAutoStartableQF was always false) and the DIRECTION pin (narrow the gauge, never widen the chokepoint) is explicitly tested. FR-5 (skip-and-continue) -- MET, and the "middle of the list" AC requirement is literally satisfied (test places the failing target at index 1 of 3, asserts w1 and w3 both still receive hints). FR-6 (ratio + alarm) -- the narrow, literally-testable AC is MET (both numbers always emitted; alarm fires below threshold / silent at full delivery / silent below minSample, all three asserted; 1-of-10 vs 9-of-10 produce different observable output) but the broader implementation mandate (durable bus + dedup_key) was not followed -- see T2. FR-7 (reachability regression) -- MET and non-vacuous: uses the real isAutoStartableQF, asserts false-before/true-after on the same row, and a QF carrying pr_url still returns false (guard not weakened).',
  '',
  '4. VACUOUS-TEST / STUBBED-WRITER CHECK (PAT-TEST-STUBBED-WRITER-UNVERIFIED-001, named explicitly in this PRD): the in-memory fake in qf-clear-and-reopen.test.js APPLIES recorded predicates against the row rather than just recording call shape, so a helper matching zero rows produces no mutation -- exactly the right instrument. I proved this is load-bearing by mutation (see T7): removing the pr_url/commit_sha guard broke 6 of 18 tests in that file with the exact expected failure signatures, and removing FR-5\'s try/catch broke exactly the 3 tests in its describe block. Both mutations were reverted and the tree confirmed clean before continuing.',
  '',
  '5. PROHIBITIONS: no repo/application filter added anywhere in the diff (grepped the full diff, zero hits). The four legitimately-terminal QF-clear sites are untouched (three of the four sites live in files entirely absent from this branch\'s 12-file diff; the fourth, stale-session-sweep.cjs\'s bulk terminal-status clear, sits outside the changed hunks). The non-critical QF pull-order test is unaffected -- it is quarantined for an unrelated, pre-existing reason (fixture-date rot from 2026-07-08, manifest untouched by this diff) and I ran it directly against this branch (temporarily un-quarantining, then reverting): 8/8 passed.',
  '',
  '6. CROSS-CHECK WITH SECURITY SUB-AGENT: found scripts/one-off/_security-write-result-sd-leo-infra-dispatch-delivery-integrity-001-exec.mjs already drafted in the worktree. Its overall verdict (CONDITIONAL_PASS reported as CONCERNS, confidence 85) and two of its findings (S10: FR-5\'s catch does not cover insertCoordinationRow\'s non-throwing {error} return path; S13: only 2 of 17 release_sd RPC callers are rewired) match conclusions I reached independently before reading that file (T3, T5) -- I read dispatch.cjs and grepped the RPC call sites myself first. Treating this as independent corroboration rather than double-counting.',
  '',
  'RATIONALE FOR CONCERNS (not FAIL, not PASS): the core mechanism (shared clear+reopen helper, gauge/chokepoint agreement, skip-and-continue delivery, ratio+alarm, reachability regression) is soundly built, thoroughly and adversarially tested, and demonstrably non-vacuous under mutation. The specific incident defects (Part A stranding at the sweep\'s dead-holder path, Part B\'s abort-on-first-error) are fixed at their proximate cause. But two FR-level acceptance criteria are not literally met by the shipped code (one defensibly, one not fully explained), a real telemetry blind spot exists and is untested, and the root-cause migration\'s blocked status leaves a wider live-exposure window than "one pending migration" suggests. These are real, reportable gaps that should be explicitly closed or accepted before this is called fully done -- not reasons to block EXEC-TO-PLAN outright.',
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
    verdict: 'CONCERNS',
    confidence: 85,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Reconcile FR-3\'s literal "zero bare-clear hits" AC with the (defensible) decision to exclude orchestrator.js:84.',
      'Either wire FR-6\'s alarm through logCoordinationEvent + dedup_key as its description mandates, or explicitly re-scope the description to match the console-only implementation.',
      'Close or explicitly accept the FR-5 ratio blind spot on non-throwing insertCoordinationRow failures (T3 / SECURITY S10).',
    ],
    test_results: {
      sd_owned_suite_isolated: { files: 5, tests: 65, passed: 65, failed: 0 },
      full_unit_tier_run1: { files_total: 2648, files_failed: 14, tests_total: 31647, tests_passed: 31537, tests_failed: 22, skipped: 86, todo: 2 },
      full_unit_tier_run2_failed_files_differ: true,
      attributable_regressions: 0,
      pull_order_test_run_directly_unquarantined: { file: 'tests/unit/worker-checkin-critical-qf-priority-jump.test.js', passed: 8, failed: 0, quarantine_reason: 'pre-existing, unrelated (assertion-drift / fixture-date rot, quarantined 2026-07-08)' },
      mutation_testing: [
        { target: 'lib/fleet/best-effort-release.mjs (pr_url/commit_sha guard removed)', file: 'tests/unit/fleet/qf-clear-and-reopen.test.js', failed_after_mutation: 6, total: 18, reverted_clean: true },
        { target: 'lib/coordinator/qf-supply-predicate.cjs (CLAIMABLE_QF_STATUSES widened to old buggy list)', file: 'tests/unit/coordinator/qf-supply-gauge-agreement.test.js', failed_after_mutation: 4, total: 8, reverted_clean: true },
        { target: 'scripts/coordinator-idle-qf-hint.mjs (try/catch removed from deliverHints)', file: 'tests/unit/coordinator/idle-qf-hint-delivery.test.js', failed_after_mutation: 3, total: 12, reverted_clean: true },
      ],
      live_migration_check: { script: 'scripts/one-off/verify-release-sd-qf-branch.mjs', result: 'ALL 5 CHECKS FAILED (migration not applied to live DB)', expected: true, ran_by_me: true },
    },
    metadata: {
      review_type: 'EXEC_PHASE_TEST_VERIFICATION',
      files_reviewed: [
        'lib/fleet/best-effort-release.mjs',
        'lib/coordinator/qf-supply-predicate.cjs',
        'lib/coordinator/coordination-events.cjs',
        'scripts/coordinator-idle-qf-hint.mjs',
        'scripts/stale-session-sweep.cjs',
        'database/migrations/20260727_release_sd_qf_reopen.sql',
        'scripts/one-off/verify-release-sd-qf-branch.mjs',
        'scripts/modules/complete-quick-fix/orchestrator.js',
        'lib/sd-creation/source-adapters/qf.js',
        'lib/coordinator/dispatch.cjs',
        'tests/unit/fleet/qf-clear-and-reopen.test.js',
        'tests/unit/coordinator/idle-qf-hint-delivery.test.js',
        'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
        'tests/unit/db/release-sd-qf-branch-sql.test.js',
        'tests/unit/stale-sweep-qf211-claim-guards.test.js',
      ],
      review_dimensions: {
        sd_owned_tests: 'PASS — 65/65, confirmed non-vacuous by mutation testing',
        full_unit_tier: 'PASS (no attributable regression) — flaky pre-existing failures, zero overlap with this branch\'s 12-file diff across two runs',
        fr_to_ac_mapping: 'CONCERN — FR-3 and FR-6 have literal AC gaps (T1/T2); FR-1/2(file)/4/5/7 fully met',
        vacuous_test_check: 'PASS — negative controls proven load-bearing via direct mutation',
        prohibitions_and_terminal_sites: 'PASS — verified directly, not assumed',
        fr2_live_deployment: 'BLOCKED, correctly — chairman-gated DDL, verified not applied; wider exposure than one migration implies (T5)',
      },
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
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
