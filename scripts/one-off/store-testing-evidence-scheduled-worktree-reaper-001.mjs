/**
 * PLAN-phase TESTING evidence for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (row 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d).
 *
 * Adversarial review of the PRD's TS-1..TS-8 test scenarios: attacking runnability and
 * vacuity, not endorsing. `summary`/`findings` are not mapped columns; folded into
 * detailed_analysis (mapped, uncapped). metadata.repo_path/executed_from_cwd via the
 * canonical resolveSubAgentRepo/applySubAgentRepoVerdict pair, per the standing contract
 * (there are no top-level repo_path/local_path columns on this table).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'TESTING';
const PHASE = 'PLAN';

const findings = [
  {
    id: 'T1',
    severity: 'low',
    verdict_on_claim: 'RUNNABLE — claim holds',
    note: 'TS-1 ("must FAIL against today\'s code") IS achievable without touching the real shared root and without ENF-17 exposure. worktree-reaper-tick.cjs:tick() already exposes opts.repoRoot + opts.currencyRunner + opts.currencyEnv, which forward straight into lib/fleet/tree-currency.cjs enforceTreeCurrency({runner, env}) — a fully injectable seam, never a shell string. tests/unit/worktree-reaper/tick.test.js:266-320 ALREADY exercises exactly this: a staleRunner returning "7\\n" for rev-list drives tick() to result===\'refused_stale_tree\' today, using only a tmp dir for repoRoot. Running that same staleRunner against a FUTURE fixed tick() and asserting result!==\'refused_stale_tree\' (or ===\'spawned\') is therefore proven to FAIL today (today\'s code always returns refused_stale_tree for that runner) and is a legitimate test of the fix, not a restatement of it. A second precedent (tests/unit/fleet/tree-currency.test.js:28-118) shows the alternate technique of two REAL tmp git repos (git init upstream/downstream, real rewind) already used in this exact module, so even if FR-2\'s ported refresh mechanism turns out NOT to accept an injected runner, a real-git-tmp-repo fallback is available and still never touches the shared EHG_Engineer root.',
    recommendation: 'Land TS-1 using the existing currencyRunner/currencyEnv seam. If FR-1/FR-2 introduce a SEPARATE refresh step for a new dedicated tree (see T2 below), that step must also expose an injectable runner (spawn-control.js:289 ensureSpawnSourceWorktree already documents "The runner is REQUIRED, not defaulted" as the established convention) — otherwise TS-1 degrades to the real-git-tmp-repo fallback, which is still runnable but materially heavier than the PRD implies.',
  },
  {
    id: 'T2',
    severity: 'medium',
    verdict_on_claim: 'GAP — architecture ambiguity threatens TS-1 runnability post-fix',
    note: 'FR-1\'s acceptance text ("With the shared root deliberately behind origin/main, a tick reaps") and TS-1\'s scenario text both still speak of testing repoRoot/"the shared root" directly. But FR-1\'s actual design (per the PRD body) is to stand up a SEPARATE self-refreshing DEDICATED tree and check ITS currency instead of repoRoot\'s — meaning after the fix lands, making repoRoot appear behind via currencyRunner may no longer be the thing the currency check even looks at. Nothing in the PRD\'s test scenarios states which value TS-1\'s injected runner must simulate post-fix (repoRoot vs. the new dedicated tree), and no FR names the injection contract the new refresh step must honour.',
    recommendation: 'PLAN/EXEC must pin, before writing TS-1: (a) whether the currency check still targets opts.repoRoot after FR-1, or a new opts.<newDedicatedTreeDir>; (b) that whatever git calls the new refresh step makes are injectable the same way enforceTreeCurrency\'s are. Leaving this open risks EXEC shipping a refresh mechanism whose own git calls are NOT injectable (e.g. hard-coded execFileSync with no runner param, mirroring the OLD shape tree-currency.cjs was built to replace), which would force every TS-1/TS-2 test onto the heavier real-tmp-git-repo pattern without the PRD ever having budgeted for it.',
  },
  {
    id: 'T3',
    severity: 'high',
    verdict_on_claim: 'VACUOUS AS SCOPED — TS-3 may not discriminate old code from new',
    note: 'Read literally, TS-3\'s two assertions ALREADY BOTH HOLD in TODAY\'S code, unmodified. The census half: worktree-reaper-tick.cjs:271-297 (the refusal catch block, shipped by QF-20260726-794) ALREADY calls countActiveWorktrees + poolWatchdogDecision on every refusal, logs a "WORKTREE REAPER BACKLOG: pool X/Y" line, and returns `pool` in the result object — this is precisely the behaviour gauge-registry.js documents ("the counter exists and logs a BACKLOG line"). The no-escalation half: the catch block RETURNS EARLY (line 294-298), before the code ever reaches the --stage0/--execute escalation block at lines 320-332 — so "no destructive escalation during refusal" is ALSO already true today, and trivially so, for ANY implementation that keeps this early-return shape. A test asserting exactly TS-3\'s two facts would PASS AGAINST TODAY\'S CODE, unchanged — meaning, absent a companion self-check like TS-1\'s explicit "must FAIL against today\'s code", TS-3 has no proof it exercises anything FR-3 changes. This is the institutional PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001 shape: a green test asserting a fact about the current state of the world as though it were a new requirement.',
    recommendation: 'Sharpen TS-3 to state what specifically becomes TRUE post-fix that is FALSE today. Two candidates seen in the codebase: (1) TODAY there are two INDEPENDENT pool-utilization computations — one ad-hoc/informational inside the catch block (log-only, feeds nothing), one operational downstream (gates the real escalation). If FR-3\'s "move census above the refusal" means collapsing these into ONE call whose result feeds BOTH the log line and (via FR-4) an actual alarm consumer, TS-3 should assert that collapse, not merely that a census runs. (2) The escalation-reachability half needs an explicit POSITIVE companion — tree CURRENT + pool >= threshold => escalation DOES fire (already partially provable via existing fake-reaper-stub technique in tick.test.js:AC-1, but no test today asserts the --stage0/--execute argv reaches the spawned child). Without a positive companion, a fix that deletes the entire watchdog escalation (over-corrects into "it never runs, period") would still pass TS-3\'s negative half.',
  },
  {
    id: 'T4',
    severity: 'high',
    verdict_on_claim: 'TS-7 mutation set does not explicitly name the one hazard the PRD itself calls out as blocking',
    note: 'The PRD\'s own Risks section names the exact dangerous mutation for FR-3: "FR-3 is implemented by moving the WHOLE watchdog above the currency check... Reviewers should treat any diff that moves the escalation above the refusal as a blocking finding." TS-7 as scenario-text only says "Neuter each new branch... for every new guard" — generic, and does not commit to including THIS SPECIFIC mutation (move the destructive escalation block above the try/catch) in the mutation set. Given T3 above shows the negative half of TS-3 is only a real control in the presence of a mutation exactly like this one, TS-3\'s discriminating power is entirely contingent on TS-7 happening to include it — and the PRD text never says so.',
    recommendation: 'Name the mutation explicitly in TS-7\'s scope: "mutate by relocating the --stage0/--execute append+spawn block to run before the enforceTreeCurrency try/catch; confirm TS-3\'s negative assertion then FAILS; revert; confirm it passes again." Anything short of naming it risks the mutation set converging on cosmetic branches (e.g. off-by-one on the threshold constant) while skipping the one mutation the PRD itself flags as data-loss-adjacent.',
  },
  {
    id: 'T5',
    severity: 'medium',
    verdict_on_claim: 'TS-6 ambiguous between two very different tests — one vacuous, one novel and valuable',
    note: 'Read as "does the pure claim/dirty guard predicate still return the same verdict", TS-6 is vacuous for THIS SD: those predicates already have extensive, dedicated coverage untouched by FR-1..FR-5 (tests/unit/worktree-reaper/{removal-decision,tree-residency-guard,residency-kill-switch,reap-eligible-marker-validity}.test.js, tests/unit/worktree-reaper-live-claim-guard.test.js, tests/unit/worktree-reaper-qf-selfclaim-guard.test.js — several already following the exact BEHAVIOURAL-not-SOURCE-ASSERTION discipline this SD needs, per tests/unit/worktree-reaper/production-wiring.test.js\'s own header, which cites PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001 by name). None of FR-1..FR-5 touches scripts/worktree-reaper.mjs\'s guard code, so re-testing those predicates in isolation would pass whether or not this SD shipped correctly — it tests nothing this diff can break. BUT read as "does the NEW self-refreshing dedicated tree serve CURRENT guard code at the moment escalation reaps from it", TS-6 becomes exactly the class of bug this SD exists to prevent (the PRD\'s own precedent: "the reap-protected marker went inert" from a stale execution-source tree) and is NOT covered by any existing test, because no dedicated tree exists yet.',
    recommendation: 'Rewrite TS-6 to state the SD-specific version: after the ported refresh mechanism runs, assert the dedicated tree\'s checked-out scripts/worktree-reaper.mjs is byte-current with (or git-descended from) the same commit the currency check just certified — i.e. prove the tree that ESCALATES contains the guards, not merely that the guards work in isolation. That is a novel integration assertion tied to FR-1/FR-2\'s actual mechanism; the pure-predicate re-tests are not new coverage and should not be counted toward this SD\'s acceptance.',
  },
  {
    id: 'T6',
    severity: 'low',
    verdict_on_claim: 'Vitest exclude/env hazards checked — no direct collision, one ambient-env caution',
    note: 'Checked vitest.config.js SHARED_EXCLUDE, DB_INCLUDE, QUARANTINE_EXCLUDE against every plausible target directory (tests/unit/fleet/**, tests/unit/worktree-reaper/**, tests/unit/governance/**): none excluded, none quarantined (tests/quarantine-manifest.json:1304 only lists the UNRELATED tests/unit/worktree-reaper-pools.test.js, a Windows-path-hardcoding issue, not in this SD\'s scope). No "No test files found" trap here. However: the unit vitest project injects env:{FLEET_REPO_ROOT: "./tests/fixtures/__no_such_tree__", FLEET_ACCOUNT_PROFILES_DIR: "", FLEET_SPAWN_CONTROL_LIVE: "", FLEET_BROWSER_PROFILES_DIR: ""} into EVERY unit-tier worker (vitest.config.js:244-252), specifically to neutralize the `opts.X ?? process.env.Y` nullish-coalescing trap documented at length in that same config file (measured there: 3 failed / 66 passed with ambient env vs. 69 passed neutralized). FR-1/FR-2 explicitly propose porting lib/fleet/spawn-control.js machinery (resolveSpawnSourceDir keys off FLEET_SPAWN_SOURCE_DIR, not FLEET_REPO_ROOT — no direct collision found) — but if EXEC\'s port introduces ANY new `opts.X ?? process.env.Y`-shaped resolution for the reaper\'s own dedicated-tree path, it inherits the identical trap class UNLESS the new env var is added to this same neutralization list.',
    recommendation: 'No fix needed today (no collision exists), but flag for EXEC: any new FLEET_* env var the ported mechanism reads via `??` must be added to vitest.config.js:244-252\'s neutralization block, or its unit tests will silently take their verdict from whatever the operator happens to have exported — the exact defect class that block exists to close.',
  },
  {
    id: 'T7',
    severity: 'high',
    verdict_on_claim: 'FR-4/TS-4/TS-5 acceptance is gameable at the descriptor-string level — classifyStructural never verifies runtime behaviour',
    note: 'lib/governance/drain-inventory.js:89-100 classifyStructural(descriptor) is a PURE STATIC check over the descriptor object literal in gauge-registry.js: `if (!descriptor.consumer) return NO_CONSUMER; if (!descriptor.closingPath) return NO_CLOSING_PATH; return null`. It never verifies the named consumer actually consumes anything at runtime — any non-empty STRING in descriptor.consumer flips the verdict. FR-4\'s acceptance criterion ("drain-inventory no longer classifies this gauge NO_CONSUMER") is therefore satisfiable by editing ONE LINE in gauge-registry.js\'s \'worktree-reaper-refusals\' entry to add a `consumer: \'...\'` string, with ZERO change to runtime alarm behaviour — the exact vacuity class the codebase\'s own memory flags as ASSERT≠MEASURED / RATIONALE-WITHOUT-ASSERTION. Compounding this: drain-inventory.mjs (the OBSERVED-verdict reader) has explicit branches only for source.kind ∈ {feedback_category, table (adam_adherence_ledger / solomon_advice_outcome_ledger / quick_fixes)} — NO branch exists for source.kind===\'artifact\' (this descriptor\'s actual kind, backed by .claude/worktree-reaper-state.json). So even with consumer+closingPath added, classifyObserved would fall through to `!reading || reading.noData` => VERDICT.UNAVAILABLE, not PASS — technically "no longer NO_CONSUMER" (satisfying the letter of the acceptance criterion) while remaining explicitly "we could not measure" per that file\'s own docstring, not a genuine health signal. SEPARATELY: tests/unit/governance/drain-inventory.test.js:326 PINS `verdictOf(\'worktree-reaper-refusals\') === VERDICT.NO_CONSUMER` today as an assertion of CORRECT current behaviour — this existing regression test MUST be edited as part of FR-4\'s own acceptance criterion, and none of TS-4/TS-5/TS-7 name it. Landing FR-4 without touching that line breaks an existing green test; the PRD test scenarios do not surface that as a required edit.',
    recommendation: 'Do not accept FR-4 on drain-inventory verdict flip alone. Require: (1) an \'artifact\' source.kind reader added to drain-inventory.mjs so this descriptor can reach a genuine PASS/CLOSING_PATH_UNEXERCISED verdict, not just escape NO_CONSUMER into UNAVAILABLE; (2) TS-4/TS-5 assert an ACTUAL runtime side effect from the alarm consumer (a written row, a matched log pattern something downstream reads, a nonzero exit somewhere scheduled) — not merely that gauge-registry.js\'s descriptor object grew a truthy field; (3) explicitly list tests/unit/governance/drain-inventory.test.js:326 as a file this SD must edit (change the expected verdict, or move the fixture to a different entry), or the SD\'s own diff will show as breaking a passing test.',
  },
  {
    id: 'T8',
    severity: 'medium',
    verdict_on_claim: 'TS-4 "proven in the deployment environment, not only a fixture" cannot be satisfied by vitest alone — no FR names the alarm mechanism',
    note: 'FR-4\'s own text requires the alarm be "proven WHERE THE GUARD RUNS (deployment environment), not only against a fixture" — an explicit, deliberate design constraint (stated to avoid reproducing exactly the defect class this SD exists to fix: a green check that never fires where it matters). But no FR specifies WHAT the alarm actually is — a feedback-table row, an SMS, a log line scraped by an existing monitor, a nonzero exit code somewhere scheduled. Without that, TS-4/TS-5 cannot yet be written as concrete automated tests; at best they can assert a FIXTURE-level behaviour (which the PRD explicitly says is insufficient on its own) and leave the deployment-environment proof as a separate, manual, undefined verification step.',
    recommendation: 'PLAN or early EXEC must pin the alarm\'s concrete mechanism before TS-4/TS-5 can be implemented as anything more than fixture tests. Whatever is chosen, name the companion live-verification instrument explicitly in the PRD (a script, a query, a dashboard check) — "proven in deployment" without a named instrument is not verifiable by anyone downstream, including this sub-agent at EXEC-TO-PLAN.',
  },
  {
    id: 'T9',
    severity: 'low',
    verdict_on_claim: 'Coverage honesty — FRs with no test that can fail',
    note: 'FR-2 (ESM/CJS wall resolution) and FR-6 (demoted, no FR depends on it) have NO test scenario mapped to either. FR-2 is an architecture-choice FR ("pick one [dynamic import vs .cjs extraction] and record why") — its acceptance ("no copy-paste duplicate") is a structural/code-review property, not something TS-1..TS-8 assert; nothing in the plan would fail if EXEC quietly duplicated the refresh helpers into the tick file instead of sharing one definition (TR-3 also asks for this and is likewise untested). FR-6 is explicitly demoted and TR-1/TR-2/TR-3/TR-5 (the technical requirements) map to no test scenario either — TR-1 and TR-4 are asserted only by omission (no test flips allowSelfHeal or touches the live pool), which is correct behaviour but leaves the invariant itself unpinned (nothing would fail loudly if a future change flipped allowSelfHeal:true on the reaper\'s currency call).',
    recommendation: 'Add a narrow structural test asserting TR-3\'s "one definition" property (e.g. grep/import-count check that the refresh helper is imported, not duplicated, into worktree-reaper-tick.cjs) and a narrow regression pin for TR-1 (assert the reaper\'s enforceTreeCurrency call site still passes allowSelfHeal:false — a one-line assertion that would have caught a future accidental flip). Both are cheap and directly protect risks the PRD itself calls out as high-cost if violated.',
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 55,
  summary:
    'Adversarial review of PRD test scenarios TS-1..TS-8 for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001. VERDICT PER SCENARIO: TS-1 RUNNABLE (existing currencyRunner/currencyEnv injection seam in worktree-reaper-tick.cjs, proven in tests/unit/worktree-reaper/tick.test.js today, plus a real-tmp-git-repo fallback already precedented in tests/unit/fleet/tree-currency.test.js) but its post-fix target is architecturally undetermined (T2) — the PRD never states whether the currency check still targets repoRoot after FR-1 lands, or a new dedicated tree, and whether that new tree\'s own git calls will be injectable. TS-2 sound and already effectively covered by the existing AC-1 test pattern. TS-3 is VACUOUS AS SCOPED (T3): both of its asserted facts (census-runs-during-refusal, no-escalation-during-refusal) are ALREADY TRUE in today\'s unmodified code, so a test asserting only those two facts would pass unchanged and prove nothing about the fix — no self-check analogous to TS-1\'s "must fail against today\'s code" exists for it. TS-6 is ambiguous (T5) between a vacuous re-test of already-covered pure guard predicates and a genuinely novel, valuable integration assertion (does the dedicated tree serve CURRENT guard code) that the PRD does not distinguish. TS-7\'s mutation set does not explicitly name the one mutation the PRD\'s own Risks section calls a blocking finding (moving the destructive escalation above the refusal) (T4), which matters because TS-3\'s negative control has no other proof of discriminating power. TS-4/TS-5 rest on an unspecified alarm mechanism (T8) and, more seriously, FR-4\'s acceptance criterion is satisfiable by editing one descriptor string in gauge-registry.js with zero runtime behaviour change, because classifyStructural is a pure static check over declared descriptor fields (T7) — and the existing pinned test tests/unit/governance/drain-inventory.test.js:326 (NO_CONSUMER for this exact gauge) is not named anywhere as a file this SD must edit, despite FR-4 requiring its verdict to flip. FR-2/FR-6/TR-1/TR-3/TR-4 have no test scenario mapped to them at all (T9). No vitest exclude/quarantine collision found for any plausible target path (T6), though a caution is recorded about the ambient-FLEET_*-env neutralization block if EXEC\'s port introduces a new nullish-coalesced env var. CONDITIONAL_PASS: the load-bearing TS-1 claim holds and the injection architecture is sound, but TS-3, TS-4/TS-5, and FR-4\'s acceptance criterion as currently scoped can be satisfied by changes that would not actually fix anything — these must be sharpened before EXEC starts, not discovered at EXEC-TO-PLAN.',
  findings,
  conditions: [
    { action: 'Pin the post-FR-1 currency-check target (repoRoot vs. new dedicated tree) and confirm the new refresh mechanism exposes an injectable runner, before TS-1/TS-2 are implemented.', priority: 'high', blocking: true },
    { action: 'Rewrite TS-3 to assert something FALSE in today\'s code (e.g. the collapse of the two independent pool-utilization computations into one, or a positive escalation-reachable companion), not the two facts that already hold today.', priority: 'high', blocking: true },
    { action: 'Name the exact TS-7 mutation that relocates the destructive escalation above the currency refusal, since TS-3\'s negative control has no other proof of discriminating power.', priority: 'high', blocking: true },
    { action: 'Require FR-4 acceptance to include an actual runtime alarm side-effect assertion (not a descriptor-string edit) plus an explicit edit to tests/unit/governance/drain-inventory.test.js:326, and add an artifact-kind reader to drain-inventory.mjs so the verdict can reach PASS rather than UNAVAILABLE.', priority: 'high', blocking: true },
    { action: 'Pin the alarm\'s concrete delivery mechanism before TS-4/TS-5 are implemented as anything beyond fixture tests.', priority: 'medium', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS rather than FAIL: TS-1 (the PRD\'s own designated load-bearing test) is genuinely runnable using seams already proven in this exact module\'s existing test suite, and TS-2/TS-6/TS-7/TS-8 are sound in intent. CONDITIONAL_PASS rather than PASS: TS-3 and FR-4\'s acceptance criterion are provably satisfiable by changes that fix nothing (T3, T7), which is disqualifying for a PRD written specifically to correct a pattern of root-cause claims retracted three times already on this SD.',
  metadata: {
    attack_mode: true,
    scenarios_reviewed: ['TS-1', 'TS-2', 'TS-3', 'TS-4', 'TS-5', 'TS-6', 'TS-7', 'TS-8'],
    scenarios_runnable_as_scoped: ['TS-1', 'TS-2', 'TS-7', 'TS-8'],
    scenarios_needing_rescoping: ['TS-3', 'TS-6'],
    scenarios_blocked_on_undecided_design: ['TS-4', 'TS-5'],
    frs_with_no_mapped_test: ['FR-2', 'FR-6', 'TR-1', 'TR-3', 'TR-4'],
    vitest_exclude_check: 'no collision for tests/unit/{fleet,worktree-reaper,governance}/** — checked SHARED_EXCLUDE, DB_INCLUDE, QUARANTINE_EXCLUDE in vitest.config.js against every plausible target path',
    existing_test_precedents_cited: [
      'tests/unit/worktree-reaper/tick.test.js:266-320 (currencyRunner injection, staleRunner => refused_stale_tree today)',
      'tests/unit/worktree-reaper/tick.test.js:176-227 (AC-1 fake-reaper-stub spawn technique, CURRENT_RUNNER)',
      'tests/unit/fleet/tree-currency.test.js:28-118 (real tmp git repos, upstream/downstream, rewind)',
      'tests/unit/worktree-reaper/production-wiring.test.js (names PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001 explicitly, behavioural mutation-tested guard pattern)',
      'lib/governance/drain-inventory.js:89-100 classifyStructural (pure descriptor-field check, no runtime verification)',
      'tests/unit/governance/drain-inventory.test.js:326 (pins NO_CONSUMER for this exact gauge today)',
    ],
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY', '=======', results.summary, '',
  'FINDINGS (adversarial test-plan review, file:line citations)',
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
