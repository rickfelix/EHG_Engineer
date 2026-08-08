/**
 * EXEC-phase TESTING evidence for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (row 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d).
 *
 * Adversarial re-review of the 6 shipped commits, specifically the 4 caveats the author
 * (Alpha-2) declared against their own work. Every mutation described below was APPLIED to the
 * real file (confirmed via `git diff --stat` before running), the target test file was run
 * against the mutant, and the file was restored via `cp` from a pre-mutation backup (never
 * `git checkout`) — confirmed clean via `git status --short` after each restore.
 *
 * `summary`/`findings` are not mapped columns; folded into detailed_analysis (mapped, uncapped).
 * metadata.repo_path/executed_from_cwd via the canonical resolveSubAgentRepo/applySubAgentRepoVerdict
 * pair, per the standing contract (no top-level repo_path/local_path columns on this table).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'TESTING';
const PHASE = 'EXEC';

const findings = [
  {
    id: 'X1',
    severity: 'high',
    verdict_on_claim: 'CAVEAT #1 IS WRONG AS STATED — the real gap is worse in one dimension, narrower in another',
    note: 'Applied the mutation literally: cut the pool-watchdog block (the one containing `args.push(\'--stage0\')`) out of its position after the single-flight guard and pasted it immediately before the `try { enforceTreeCurrency(...) }` block, leaving `const args = buildReaperArgs(...)` at its original (now-later) position. Confirmed applied via `git diff --stat` (43 lines changed). Ran refusal-watchdog-split.test.js against the mutant: TS-3 PASSED, TS-9 PASSED, only TS-9b FAILED (`expected 15146 to be greater than 19316`). The premise "hoisting fails all three tests" is FALSE — 2 of 3 do not fail at all, and neither of the two that pass fails via a crash. Root cause: `countActiveWorktrees(repoRoot)` against the tmp-dir fixture (not a real git repo, zero registered worktrees) returns null/0, so `poolWatchdogDecision(...).triggered` stays false, and the hoisted `if (watchdog.triggered) { args.push(...) }` branch — the one line that would reference `args` before its later `const` declaration and throw a TDZ ReferenceError — is never reached. TS-3 and TS-9 therefore provide ZERO discriminating power against this exact regression: they are green on both the fixed code and the hoisted-bug code, despite being labelled "REGRESSION GUARD" and "BEHAVIOURAL". Only TS-9b (explicitly the WEAKER, source-text-only test by the file\'s own admission) catches it. Separately verified the file\'s own claim about TS-9b\'s discrimination is correct: the bare string `--stage0` first appears in a COMMENT at line 185 (`The watchdog appends --stage0/--execute to this base array afterward.`), well before the code statement `args.push(\'--stage0\')` at line 392 — TS-9b matches the CODE (`args.push(\'--stage0\')`), not the comment, so it does not accidentally pass by matching narration.',
    recommendation: 'Do not rely on TS-3/TS-9 for FR-1b coverage — they are decorative with respect to the hoisting mutation and should either be re-labelled (they pin QF-20260726-794\'s pre-existing behaviour, not this SD\'s new escalation-ordering invariant) or strengthened. The genuinely dangerous production scenario — pool actually >=80% AND currency refused at the same tick, which would hit the guarded `args.push` branch and throw a real uncaught ReferenceError inside `tick()` (not the graceful `refused_stale_tree` return) — is exactly the scenario neither TS-3, TS-9, nor TS-9b exercises, and per X2 below there is no available seam to drive it in this fixture today. TS-9b remains the one real defense; it is adequate to catch a static hoist but would not catch a dynamic variant (e.g. a refactor that keeps ordering but introduces a different `args`-before-declaration path).',
  },
  {
    id: 'X2',
    severity: 'medium',
    verdict_on_claim: 'CAVEAT #2 CONFIRMED — no seam exists through tick(), and a plausible workaround (global child_process mock) does not work either',
    note: 'Confirmed `countActiveWorktrees(repoRoot, runner = spawnSync)` accepts an injectable `runner` as its OWN second parameter, but every call site inside `tick()` invokes it as `countActiveWorktrees(repoRoot)` — the injectable seam is never threaded through `tick()`\'s opts, so no existing fixture can drive it over 80% without a real 23-worktree git repo. Attempted the obvious workaround: `vi.mock(\'node:child_process\', ...)` returning a fake `spawnSync` that reports 23 registered worktrees, then drove `tick()` (with `sourceExists`/`sourceRunner`/`currencyRunner` all injected so only `countActiveWorktrees` hit the real module) via both `createRequire().require()` and dynamic `import()` of the .cjs file. In both attempts `res.watchdog.used` came back `null` and the log showed a REAL git error ("fatal: not a git repository") — proof the mock was NOT intercepted for this module\'s internal `require(\'node:child_process\')`. The probe test and its temp file were deleted after use; `git status --short` confirmed no residue.',
    recommendation: 'No test today can behaviourally exercise the >=80% watchdog escalation through `tick()`. If this branch needs real coverage, `countActiveWorktrees` needs either a `runner` param threaded through `tick()`\'s opts (mirroring `sourceRunner`/`currencyRunner`), or the file needs to expose the escalation decision as a pure function callable independent of the spawnSync call (as `poolWatchdogDecision` already is — that part IS unit tested). Until then, treat the watchdog-triggered branch as unit-tested only for its pure decision function, not for its wiring into `tick()`.',
  },
  {
    id: 'X3',
    severity: 'high',
    verdict_on_claim: 'CAVEAT #3 CONFIRMED BY MUTATION — the upper-bound assertion lets a real regression through',
    note: 'Constructed the exact regression class the caveat worried about: renamed the legitimate synced copy `const MAX_WORKTREE_COUNT = 28;` in scripts/fleet/worktree-reaper-tick.cjs to a non-matching identifier (simulating "someone quietly drops the real copy"), and simultaneously added a brand-new file lib/fleet/zz-rogue-third-copy.js with its own unrelated `export const MAX_WORKTREE_COUNT = 28;` (simulating "a genuinely new duplicate location appears elsewhere"). Net count of real assignments stayed at exactly 2 (lib/worktree-quota.js + the new rogue file). Ran reaper-gauge-antigaming.test.js: TS-11\'s "no THIRD definition" test PASSED — a real regression (the canonical file lost its copy while an unrelated file gained one) sailed through green because the assertion only checks `defs.length <= 2`, never which files hold the definition. Confirmed the assertion is not fully vacuous either: restoring the renamed constant (bringing the true count to 3) made the same test correctly FAIL with `expected 3 to be less than or equal to 2`. Both mutations were confirmed applied via `git diff --stat`/`grep` before running and fully reverted (rogue file deleted, rename undone) — `git status --short` clean afterward.',
    recommendation: 'The count-only assertion catches pure additions but not swap-regressions (lose one legitimate copy, gain one illegitimate one). If file-identity matters — and TR-3\'s intent ("no THIRD definition") reads as caring about provenance, not just arithmetic — strengthen TS-11 to assert the SPECIFIC two files (lib/worktree-quota.js, scripts/fleet/worktree-reaper-tick.cjs) rather than a bare count. Non-blocking for this SD: the count check is a real, working upper bound for the additive case, which is the more common way a third copy actually appears (a new SD copy-pastes the constant rather than surgically relocating an existing one).',
  },
  {
    id: 'X4',
    severity: 'low',
    verdict_on_claim: 'CAVEAT #4 CONFIRMED — TS-1 is genuinely load-bearing, RED for the claimed reason',
    note: 'Mutated worktree-reaper-tick.cjs to simulate FR-1 never having shipped: changed `const reaperScript = path.join(sourceRoot, ...)` to `path.join(repoRoot, ...)` (the pre-fix resolution). Confirmed applied via `git diff --stat` (1 line). Ran reaper-source-tree.test.js: TS-1 FAILED with `expected \'script_missing\' not to be \'script_missing\'` — exactly the failure mode the test\'s own comment predicts, and for the right reason (the fixture places worktree-reaper.mjs ONLY in the source tree, absent from repoRoot, so resolving from repoRoot cannot find it). TS-1b, TS-2, TS-12 all still passed (correctly — the mutation only affects which root the SCRIPT resolves from, not the refresh or fallback logic). File restored via `cp` from backup; `git status --short` clean.',
    recommendation: 'None — this test does what it claims.',
  },
  {
    id: 'X5',
    severity: 'low',
    verdict_on_claim: 'FR-2 alarm predicate independently mutation-tested — RED for the right reason',
    note: 'Mutated lib/coordinator/coordination-events.cjs\'s `detectReaperStarvation`: changed the empty-pool guard from `if (used <= 0)` to `if (used < 0)` (a boundary-off-by-one that would let `used === 0` fall through to the "starving" branch). Confirmed applied via `git diff --stat` (1 line). Ran reaper-starvation.test.js: 2 of 6 tests correctly FAILED (the TS-5 anti-vacuity test and the "BOTH conditions load-bearing" conjunction test), both failing on exactly `used === 0` no longer returning `pool_empty`. File restored via `cp`; `git status --short` clean.',
    recommendation: 'None — this predicate is genuinely covered against its own boundary condition.',
  },
  {
    id: 'X6',
    severity: 'low',
    verdict_on_claim: 'No quarantine/exclusion trap; broader touched-area suite is green with real numbers',
    note: 'Checked tests/quarantine-manifest.json: zero hits for any of the 4 new/modified test files in this SD. Ran the full touched-area slice directly (tests/unit/worktree-reaper/, tests/unit/governance/reaper-gauge-antigaming.test.js, tests/unit/coordinator/reaper-starvation.test.js, tests/unit/fleet/ — the latter covers spawn-control.js\'s delegation and the pre-existing spawn-source-siting-guard/spawn-source-flag-on-seam suites): 176 test files, 2191 tests PASSED, 1 skipped, 0 failed. A bare `npx vitest run tests/unit/` (the full repo-wide unit project) timed out at 2 minutes in this environment — too broad to run in one shot here; the touched-area slice is the meaningful scope for this SD\'s own diff and shows no regression. Independently re-verified the CI workflow\'s new fail-closed guard (.github/workflows/worktree-reaper-cadence.yml) by replicating its exact grep/parse logic against three synthetic reaper.log shapes: "Worktrees scanned: 0" -> FAIL (zero), "Worktrees scanned: 26" -> PASS, and an unrecognised log format -> FAIL (unparsed) rather than silently passing. All three matched the commit message\'s claims.',
    recommendation: 'None.',
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 70,
  summary:
    'Adversarial mutation-testing pass over the 6 shipped commits and the author\'s own 4 declared caveats for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001. Ran the touched-area test suite directly (176 files / 2191 passed / 1 skipped / 0 failed across tests/unit/worktree-reaper, governance/reaper-gauge-antigaming, coordinator/reaper-starvation, and fleet/); a bare `npx vitest run tests/unit/` timed out in this environment and was not used for totals. Every mutation below was applied to the real file, confirmed via git diff --stat, exercised, then restored via cp (not git checkout) with a clean git status confirmed after. FOUR CAVEATS ADDRESSED: (1) REFUTED AS STATED — the author claimed hoisting the --stage0 escalation above the currency refusal "fails all three tests" via a crash; empirically only TS-9b fails (a genuine assertion, not a crash) and TS-3/TS-9 both PASS unchanged, meaning those two tests provide ZERO discriminating power against this exact regression class — worse than the caveat\'s own framing, though the one real defense (TS-9b) is confirmed sound. (2) CONFIRMED — no seam exists to drive the >=80% watchdog behaviourally through tick(); a global child_process mock was attempted and confirmed NOT to intercept the module\'s internal require. (3) CONFIRMED BY MUTATION — TS-11\'s upper-bound assertion on MAX_WORKTREE_COUNT count lets a swap-regression (lose the real copy, gain a rogue one) through green; a pure-addition regression is still correctly caught. (4) CONFIRMED — TS-1 fails RED for exactly the claimed reason under the pre-fix mutation. Also independently mutation-tested the FR-2 alarm predicate (RED for the right reason) and re-verified the CI workflow\'s fail-closed scanned==0 guard against three synthetic log shapes, all matching the commit\'s claims. CONDITIONAL_PASS rather than PASS because finding X1 shows the FR-1b regression-guard layer is weaker than its own test names suggest (TS-3/TS-9 are decorative for the hoisting mutation), and X3 shows TS-11 does not protect file-identity, only count — neither is a functional regression in the shipped code, both are coverage-quality gaps in the tests guarding it. CONDITIONAL_PASS rather than FAIL because the actual production hazard (pool at capacity AND currency simultaneously refused) requires a SECOND, independent future regression to manifest, TS-9b already catches the specific mutation the PRD\'s own Risks section called out as blocking, and none of the shipped production code itself was found defective.',
  findings,
  conditions: [
    { action: 'Re-label or strengthen TS-3/TS-9 in refusal-watchdog-split.test.js — as shown by mutation, they do not fail under the hoisted-escalation regression their own comments claim to guard against; only TS-9b does.', priority: 'medium', blocking: false },
    { action: 'If file-identity (not just count) matters for TR-3\'s "one definition" intent, strengthen TS-11\'s MAX_WORKTREE_COUNT assertion to name the two legitimate files rather than asserting an upper bound on count alone.', priority: 'low', blocking: false },
    { action: 'If the >=80% pool watchdog escalation ever needs real behavioural coverage through tick(), thread countActiveWorktrees\' existing runner parameter through tick()\'s opts (mirroring sourceRunner/currencyRunner) rather than relying on a child_process mock, which was confirmed not to intercept this module\'s internal require.', priority: 'low', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS: X1 and X3 are confirmed-by-execution coverage gaps in the regression-guard layer itself (not the production code), discovered by directly reproducing the author\'s own declared caveats plus one the author understated. CONDITIONAL_PASS rather than FAIL: TS-1, TS-1b, TS-2, TS-12, TS-9b, and the FR-2 alarm predicate were all independently mutation-verified RED-for-the-right-reason; the CI workflow guard was independently re-verified against three log shapes; the full touched-area suite (2191 tests) is green with zero regressions; and the one class of gap that survives (TS-3/TS-9 non-discrimination) requires a second, independent regression (an unrelated over-threshold pool) to ever matter in production.',
  metadata: {
    mutation_tested: true,
    mutations_applied_and_restored: [
      'scripts/fleet/worktree-reaper-tick.cjs: hoisted pool-watchdog block above currency try/catch (caveat 1) — restored via cp',
      'scripts/fleet/worktree-reaper-tick.cjs: reaperScript resolved from repoRoot instead of sourceRoot (caveat 4 / TS-1) — restored via cp',
      'scripts/fleet/worktree-reaper-tick.cjs + lib/fleet/zz-rogue-third-copy.js (new, deleted after): renamed real MAX_WORKTREE_COUNT copy + added rogue copy elsewhere (caveat 3 / TS-11) — restored via sed + rm',
      'lib/coordinator/coordination-events.cjs: used<=0 -> used<0 boundary in detectReaperStarvation (FR-2 alarm predicate) — restored via cp',
    ],
    all_restores_confirmed_clean: 'git status --short after each restore showed no diff',
    real_test_totals: { test_files: 176, tests_passed: 2191, skipped: 1, failed: 0, scope: 'tests/unit/worktree-reaper/, tests/unit/governance/reaper-gauge-antigaming.test.js, tests/unit/coordinator/reaper-starvation.test.js, tests/unit/fleet/' },
    full_repo_unit_run: 'npx vitest run tests/unit/ timed out at 2 minutes in this environment; not used for totals — touched-area scope used instead',
    quarantine_check: 'zero hits in tests/quarantine-manifest.json for any of the 4 new/modified test files',
    ci_workflow_guard_reverified: {
      'scanned=0': 'FAIL (zero)',
      'scanned=26': 'PASS',
      'unrecognised log format': 'FAIL (unparsed)',
    },
    ts9b_prose_vs_code_check: 'confirmed --stage0 first appears in a comment at line 185 and the code statement args.push(\'--stage0\') at line 392; TS-9b\'s indexOf targets the code statement, not the comment',
    caveats_status: {
      caveat_1_hoisting_fails_all_three: 'REFUTED — only TS-9b fails; TS-3/TS-9 pass unchanged (worse gap than described: zero discrimination, not a crash)',
      caveat_2_no_injectable_seam: 'CONFIRMED — verified by attempted child_process mock, which did not intercept',
      caveat_3_upper_bound_adequate: 'CONFIRMED INADEQUATE for swap-regressions — additive regressions still caught',
      caveat_4_ts1_load_bearing: 'CONFIRMED — RED for the claimed reason',
    },
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY', '=======', results.summary, '',
  'FINDINGS (mutation-tested, file:line citations, applied/restored via cp not git checkout)',
  '='.repeat(72), '',
  results.findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + ' — ' + f.verdict_on_claim + NL +
    'FINDING: ' + f.note + NL +
    'RECOMMENDATION: ' + (f.recommendation || '(none - informational)')
  )).join(NL + NL + HR + NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'Enhanced QA Engineering Director v2.4.0' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('VERDICT=' + results.verdict);
