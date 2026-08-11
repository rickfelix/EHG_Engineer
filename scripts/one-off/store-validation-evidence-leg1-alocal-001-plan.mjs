// SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — VALIDATION sub-agent evidence writer (PLAN-TO-LEAD phase).
// Independent adversarial re-verification of the three fixes claimed by the prior rounds
// (PLAN TESTING 8606170f, EXEC SECURITY f84884eb, EXEC TESTING 7b22c9ee) against the SHIPPED code on
// branch feat/SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 (01603df45a2, 51f180adbcf, 2b10e108323).
// Every claim below was MEASURED by this agent — by mutation testing (revert the fix, prove the test
// goes RED), by empirical probing of the shipped functions, and by a non-destructive merge-tree.
// Commit messages were not trusted as evidence.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001';
const PHASE = 'PLAN-TO-LEAD';

const results = {
  verdict: 'CONCERNS',
  confidence: 93,
  summary:
    'ALL THREE PRIOR FIXES GENUINELY CLOSE THE FINDINGS THEY CLAIM TO CLOSE — verified by mutation, not by reading '
    + 'commit messages. (T1) scoreLeg1ALocal fetches the git corpus EXACTLY ONCE regardless of population size: measured '
    + '1 spawn at 1, 20 and 200 unique sd_keys (the N+1 is really gone, not just refactored). Enumerated every failure '
    + 'mode empirically — runner throws, returns null, returns [], returns a non-array — and ALL FOUR degrade to '
    + 'unavailable(); there is no code path where an empty-length or errored git-log result yields a points node. '
    + '(T2) fetch-depth: 0 is really set on the ONLY checkout step of the ONLY job (produce) in drive-report-cron.yml, '
    + 'the same job that runs the sweep at line 91 — not merely claimed in a commit message. (T3) The windowHours:720 '
    + 'pin is REAL: reverting to a bare computePlanCheckStatus(supabase) turns exactly one test RED '
    + '(drive-report-sweep.test.js:425, "expected undefined to deeply equal { windowHours: 720 }"). (T4) TS-8 is REAL: '
    + 'renaming done[].sd_key -> promoted_to_sd_key in the actual producer lib/roadmap/plan-check-status.js:235 turns '
    + 'TS-8 RED ("expected ... to have property sd_key with value SD-X-001") — it drives the real computePlanCheckStatus, '
    + 'it is not two hand-typed objects. Both mutations were reverted; tree verified clean; 73/73 green restored, and '
    + 'the wider tests/unit/cron + tests/unit/drive-loop sweep is 536/536 across 39 files. '
    + 'VERDICT IS CONCERNS ON THREE ITEMS THE PRIOR ROUNDS DID NOT COVER, ONE OF WHICH IS BLOCKING. '
    + 'V1 (BLOCKING, merge integrity): PR #6953 (SD-LEO-INFRA-DRIVE-SCORE-LEG2-001) MERGED to main at '
    + '2026-08-11T03:42:33Z and edits the SAME two files. This branch is 17 commits BEHIND origin/main and '
    + '`git merge-tree --write-tree HEAD origin/main` reports CONFLICT (content) in BOTH '
    + 'scripts/cron/drive-report-sweep.mjs AND tests/unit/cron/drive-report-sweep.test.js. The SD KNEW this was coming — '
    + 'its own repair script records TR-3 as priority:high, blocking:true ("rebase onto origin/main AFTER PR #6953 merges '
    + '... re-verify buildGather()\'s required injections and update BOTH copies of the leg-set identity pin") — but the '
    + 'rebase has NOT been done, and the EXEC TESTING evidence\'s F7 note ("this branch is 0 commits behind origin/main, '
    + 'so there is no conflict") is now STALE AND FALSE. The danger is specific: the windowHours:720 argument and the F1 '
    + 'test that pins it are BOTH inside the conflicted region, so a careless "take ours/theirs" resolution can drop the '
    + 'guard and its subject together and the suite stays green. V2 (HIGH, the shallow-clone fix is one edit from blind): '
    + 'the empty-corpus guard keys on subjects.length === 0, but runHardenedGit returns stdout as a STRING, and an empty '
    + 'git log is \'\' -> \'\'.split(\'\\n\') === [\'\'] -> length 1, which does NOT trip the guard. The ONLY thing '
    + 'converting that to [] is the .filter(Boolean) in the CLI lambda at drive-report-sweep.mjs:441 — and that lambda is '
    + 'covered by ZERO tests (no test file references filter(Boolean), runHardenedGit, or split). MEASURED the '
    + 'composition directly: with .filter(Boolean) -> unavailable (safe); without it -> SCORED points=0, the exact false '
    + '0/2 that f84884eb exists to prevent. Both ends are green and the wire between them is unverified. V3 (MEDIUM, PRD '
    + 'drift): the DB PRD (still status=in_progress) FR-1 AC-1/AC-4 still describe the PRE-FIX signature '
    + 'isSdLandedInMainHistory(sdKey, {runGitLog}); the shipped signature is (sdKey, subjects) with the injection moved to '
    + 'fetchMergeSubjects({runGitLog}) as part of the very N+1/shallow-clone fix. The code is better than the PRD; the PRD '
    + 'was never updated to match. No duplicate implementation was found, the leg-id SSOT is intact, and FR-4 shipped.',
  critical_issues: [
    {
      severity: 'critical',
      title: 'V1 BLOCKING — PR #6953 (LEG2-001) has MERGED and now conflicts with this branch in both changed files; the branch is 17 commits behind and the SD\'s own blocking TR-3 rebase is outstanding',
      detail:
        'MEASURED, not inferred. `gh pr view 6953` => state MERGED, mergedAt 2026-08-11T03:42:33Z, and its file list '
        + 'includes scripts/cron/drive-report-sweep.mjs and tests/unit/cron/drive-report-sweep.test.js — the same two '
        + 'files this SD edits. `git rev-list --count HEAD..origin/main` => 17 (behind); origin/main..HEAD => 3 (ahead). '
        + '`git merge-tree --write-tree --messages HEAD origin/main` => CONFLICT (content) in BOTH files, with all three '
        + 'stages present for each. '
        + 'THE OVERLAP IS STRUCTURAL, NOT INCIDENTAL — three collision points measured against origin/main: '
        + '(a) buildGather signature — main now reads `{..., capacityRunId = null, readLeg2Cohort, nowMs }` '
        + '(drive-report-sweep.mjs:271 on main) while this branch reads `{..., capacityRunId = null, runGitLog }`; both '
        + 'sides added a MANDATORY injection with a throw, so the merge must preserve all three (runGitLog AND '
        + 'readLeg2Cohort AND nowMs) or buildGather throws at construction. '
        + '(b) the `legs` array — this branch rewrites the LEG1 entry, main rewrote the LEG2 entry (main:341-350), '
        + 'adjacent lines in the same literal. '
        + '(c) the planStatus call — main is still `computePlanCheckStatus(supabase)` (main:306) while this branch is '
        + '`computePlanCheckStatus(supabase, { windowHours: 720 })` (branch:271). '
        + 'WHY THIS IS BLOCKING AND NOT MERELY MECHANICAL: the windowHours:720 argument and the F1 test that pins it are '
        + 'BOTH inside the conflicted region (the test file is conflicted too). A resolution that takes main\'s side on '
        + 'the planStatus line while also losing the F1 test hunk silently reverts the entire SD to a no-op — measured '
        + 'EMPTY at 48h/168h — and the suite still reports green, because the only instrument that can see the loss is '
        + 'in the same conflict. '
        + 'THE SD ANTICIPATED THIS AND THE ACTION IS STILL OPEN: '
        + 'scripts/one-off/repair-testing-evidence-leg1-alocal-001.mjs:141 records TR-3 { priority: high, blocking: true } '
        + '= "rebase onto origin/main AFTER PR #6953 merges before touching the legs array or the test fixtures; '
        + 're-verify buildGather()\'s required injections and update BOTH copies of the leg-set identity pin." '
        + 'STALE PRIOR EVIDENCE: store-testing-evidence-leg1-alocal-001-exec.mjs:137-140 filed F7 as INFO on the premise '
        + 'that "#6953 (LEG2-001) still OPEN ... buildGather is still the 5-arg shape, and this branch is 0 commits '
        + 'behind origin/main, so there is no conflict". Both halves of that premise are now false. The world moved '
        + 'between the observation and this verification. '
        + 'REMEDIATION: rebase/merge origin/main into this branch BEFORE the LEAD handoff; after resolving, re-assert by '
        + 'measurement (not by reading) that (i) `computePlanCheckStatus(supabase, { windowHours: 720 })` survives, '
        + '(ii) the F1 capturing test survives and still goes RED when the argument is removed, (iii) buildGather still '
        + 'refuses without EACH of runGitLog, readLeg2Cohort and nowMs, and (iv) both copies of the leg-set identity pin '
        + '(drive-report-sweep.test.js and drive-report-wiring.test.js) agree with RATIFIED_LEG_IDS.',
    },
  ],
  warnings: [
    {
      severity: 'high',
      title: 'V2 — the shallow-clone false-zero fix is load-bearing on an UNTESTED .filter(Boolean) in the CLI lambda; drop it and the false 0/2 comes straight back',
      detail:
        'The in-module guard is `if (!Array.isArray(subjects) || subjects.length === 0) return unavailable(...)` '
        + '(leg1-landed-alocal.js:187). But the production corpus is produced by '
        + '`runGitLog: (args) => runHardenedGit(args, { cwd: process.cwd() }).split(\'\\n\').filter(Boolean)` '
        + '(drive-report-sweep.mjs:441), and runHardenedGit\'s default (result:false) path returns `r.stdout` — a STRING '
        + '(lib/fleet/source-tree-refresh.cjs:136). An empty git log gives stdout === \'\', and \'\'.split(\'\\n\') is '
        + '[\'\'], length 1 — which does NOT satisfy length === 0. '
        + 'MEASURED the composition directly by executing the shipped function: '
        + 'with .filter(Boolean) -> corpus [] -> UNAVAILABLE (safe); without .filter(Boolean) -> corpus [\'\'] -> '
        + 'SCORED points=0 — a false 0/2 into the append-only chairman-facing drive_reports, i.e. exactly the harm '
        + 'SECURITY f84884eb was raised to prevent. '
        + 'COVERAGE MEASURED: grep of both suites (tests/unit/cron/drive-report-sweep.test.js, '
        + 'tests/unit/drive-loop/score/leg1-landed-alocal.test.js) for filter(Boolean) | runHardenedGit | split => ZERO '
        + 'matches. The lambda lives inside the `if (isMainModule(import.meta.url))` CLI block, which no unit test '
        + 'executes, and drive-report-wiring.test.js (which DOES source-pin other CLI-block wiring such as persist and '
        + 'produce) has no pin on the runGitLog injection. So the single line that makes the guard fire in production is '
        + 'both untested and unpinned. '
        + 'This is not a present-tense defect — the shipped wiring IS correct today. It is a blind-spot in the fix: the '
        + 'invariant "an empty corpus is never a score" is distributed across an in-module length check and an untested '
        + 'CLI string transform, rather than held in one place. '
        + 'REMEDIATION (1 line, in-module, makes the invariant self-contained): have fetchMergeSubjects (or '
        + 'scoreLeg1ALocal) drop blank lines itself — e.g. `.filter((s) => typeof s === \'string\' && s.trim() !== \'\')` '
        + '— so a corpus of [\'\'] collapses to [] and trips the existing guard regardless of what any caller injects. '
        + 'Optionally add a source-pin in drive-report-wiring.test.js for the runGitLog injection, matching the existing '
        + 'persist/produce pin idiom.',
    },
    {
      severity: 'medium',
      title: 'V3 — DB PRD FR-1 AC-1/AC-4 still specify the pre-fix isSdLandedInMainHistory(sdKey, {runGitLog}) signature that the N+1 fix deliberately replaced',
      detail:
        'The shipped API is isSdLandedInMainHistory(sdKey, subjects) — a pure matcher over an already-fetched corpus — '
        + 'with the runner injection moved to fetchMergeSubjects({ runGitLog }). That change is correct and is the very '
        + 'mechanism of the fetch-once fix. But product_requirements_v2 PRD-SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 '
        + '(status still in_progress) FR-1 still reads "exports a pure function (sdKey, {runGitLog}) -> boolean", with '
        + 'AC-1 "isSdLandedInMainHistory(\'SD-...\', {runGitLog}) returns true..." and AC-4 "Throws if runGitLog is not '
        + 'injected". As literally written, AC-1 is not satisfiable against the shipped signature, and AC-4 is satisfied '
        + 'by DIFFERENT functions (fetchMergeSubjects and scoreLeg1ALocal both throw on a missing runGitLog — verified '
        + 'empirically). The intent of both ACs is met; the text is stale. LEAD should not read FR-1 AC-1 as a '
        + 'gap-in-delivery, and the PRD should be amended so the record matches what shipped rather than leaving a '
        + 'future reader to reconcile it. Everything else reconciles: all 4 FRs shipped (FR-4\'s reference-only header '
        + 'amendment on leg1-landed.js and its test-message update are present in the diff), and all 8 PRD test '
        + 'scenarios TS-1..TS-8 appear across the shipped suites.',
    },
    {
      severity: 'low',
      title: 'V4 — the "NEVER THROWS" banner in scoreLeg1ALocal\'s docblock is contradicted 15 lines later by an unconditional throw',
      detail:
        'leg1-landed-alocal.js:137 states "NEVER THROWS. Every failure mode this function can encounter ... degrades to '
        + 'the unavailable() shape rather than propagating". Line 151-153 then throws unconditionally when runGitLog is '
        + 'not a function (verified: `scoreLeg1ALocal({items:[...]})` with no runner => THREW "scoreLeg1ALocal(): '
        + 'runGitLog must be injected"). The throw is DELIBERATE and correct — it is a wiring error, it mirrors the '
        + 'buildGather refuse-without-injection idiom, and buildGather guards it upstream, so it cannot reach production. '
        + 'The issue is only that an absolute claim sits above a counterexample in the same function, and a future reader '
        + 'relying on the banner could wrap a caller without a try. Suggest narrowing the banner to "never throws on a '
        + 'RUNTIME failure; a missing injection is a wiring error and still throws by design".',
    },
    {
      severity: 'low',
      title: 'V5 — workflow_dispatch from a non-default branch would leave `main` unresolvable; fail-safe, but worth knowing',
      detail:
        'drive-report-cron.yml triggers on schedule (two cron entries) and workflow_dispatch. On the scheduled path the '
        + 'checkout is the default branch, so a local `main` ref exists and fetch-depth: 0 gives the full merge history — '
        + 'the fix works. On a manual workflow_dispatch against some OTHER ref, actions/checkout fetches other branches '
        + 'into refs/remotes/origin/* only, and a bare `main` does not resolve through refs/remotes/origin/main, so '
        + '`git log main --merges` would fail. That path is FAIL-SAFE, not a false zero: the runner throws (non-zero '
        + 'status => source-tree-refresh.cjs:133 throws) and scoreLeg1ALocal\'s try/catch converts it to unavailable() — '
        + 'confirmed empirically ("runner throws -> unavailable (safe)"). No action required; noted so a future operator '
        + 'reading an unavailable leg after a manual dispatch knows why.',
    },
  ],
  detailed_analysis: {
    task1_fetch_once: 'PASS — MEASURED with a spawn counter against the shipped function: 1 unique key => 1 git spawn; 20 keys => 1 spawn; 200 keys => 1 spawn. fetchMergeSubjects is called once at leg1-landed-alocal.js:176, outside any loop; isSdLandedInMainHistory(k, subjects) is pure and never fetches. The N+1 TESTING measured (20 keys = 20 spawns, ~9.9s) is genuinely eliminated.',
    task1_no_false_zero_path: 'PASS — enumerated every reachable failure mode empirically: runner throws => unavailable; returns null => unavailable; returns [] => unavailable; returns a non-array string => unavailable. Code paths: denominator===0 => unavailable (:159); fetch throws => unavailable (:177); !isArray||length===0 => unavailable (:187); regex compile throws => unavailable (:205). Only a non-empty, well-formed corpus reaches the points node. CAVEAT: see warning V2 — a corpus of [\'\'] (length 1) is semantically empty but does NOT trip the length===0 guard; production is saved only by the untested .filter(Boolean) in the CLI lambda.',
    task2_fetch_depth: 'PASS — .github/workflows/drive-report-cron.yml:71-79. `uses: actions/checkout@v4` followed by a with: block containing `fetch-depth: 0` at line 79. Verified in the LIVE file, not just the diff. It is the ONLY checkout step in the file, inside the ONLY job (`produce`, runs-on ubuntu-latest), and that same job runs `node scripts/cron/drive-report-sweep.mjs` at line 91 — so the leg that needs the history is in the job that got the history.',
    task3_windowhours_pin_mutation: 'PASS (mutation-verified RED) — reverted drive-report-sweep.mjs:271 from `computePlanCheckStatus(supabase, { windowHours: 720 })` to `computePlanCheckStatus(supabase)` and re-ran. Result: 1 failed | 72 passed. The failing test is drive-report-sweep.test.js "[F1, TESTING evidence 7b22c9ee] computePlanCheckStatus is called with windowHours: 720 -- reverting to the 48h/168h default silently no-ops the whole SD", AssertionError "expected undefined to deeply equal { windowHours: 720 }" at line 425 (expect(receivedOptions[0]).toEqual({ windowHours: 720 })). It is a real capturing assertion on the argument actually passed, not a stub. Mutation reverted; git diff HEAD clean.',
    task4_ts8_non_vacuous_mutation: 'PASS (mutation-verified RED) — renamed lib/roadmap/plan-check-status.js:235 `sd_key: item.promoted_to_sd_key` to `promoted_to_sd_key: item.promoted_to_sd_key` (mutating the REAL producer, not the test) and re-ran leg1-landed-alocal.test.js. Result: 1 failed | 20 passed. Failing test: "[TS-8] the done[]-shaped test fixture is bound to the REAL computePlanCheckStatus output shape > fixture-factory keys match the REAL producer\'s actual return value, not a parallel hand-typed guess", AssertionError "expected { item_id: \'item1\', title: \'T\', ...(3) } to have property \'sd_key\' with value \'SD-X-001\'". TS-8 genuinely drives computePlanCheckStatus against a faked supabase client; the vacuous two-hand-typed-objects version is gone. Mutation reverted; git diff HEAD clean.',
    task5_overlapping_sds: 'CONCERNS — see critical issue V1. PR #6953 / SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 is no longer merely "known and in flight": it MERGED 2026-08-11T03:42:33Z and now CONFLICTS (measured via git merge-tree) in both scripts/cron/drive-report-sweep.mjs and tests/unit/cron/drive-report-sweep.test.js. BEYOND #6953 I found NO other overlapping work: scanned all 35 open PRs (the only drive-related one, #6926, touches docs/reference/drive-state.md only — no overlap); scanned origin/main commits over the last 14 days on lib/drive-loop/, scripts/cron/drive-report-sweep.mjs and .github/workflows/drive-report-cron.yml (all from already-landed predecessor SDs: LEG2-001, LEG1-001, DENOMINATOR-001, UNCAPPED-ROADMAP-ITEMS-001, PERSIST-BELT-CAPACITY-001, DRIVE-LOOP-INSTRUMENT-001-B/-D); and confirmed no unmerged remote branch targets these paths.',
    task6_prd_vs_shipped: 'MOSTLY PASS — 4/4 FRs shipped, 8/8 test scenarios (TS-1..TS-8) present across the suites, leg-id SSOT intact. Two drift items: warning V3 (FR-1 AC-1/AC-4 describe the superseded signature) and warning V4 (the NEVER THROWS banner). No duplicate implementation and no scope creep detected.',
    duplicate_check: 'CLEAN — no duplicate implementation. leg1-landed-alocal.js is a genuinely new rule superseding leg1-landed.js, and FR-4 correctly demotes the old file to reference-only rather than leaving two live rules. Confirmed scoreLeg1 (old) has ZERO production callers: drive-report-sweep.mjs imports only `{ LEG_ID as LEG1_ID }` from leg1-landed.js. The SD also correctly REUSED existing infrastructure instead of re-deriving it — runHardenedGit (THE published shell-injection-safe runner) rather than a hand-rolled execSync, and unavailable()/cite() from the existing report-posture and citation modules.',
    leg_set_ssot_intact: 'VERIFIED — leg1-landed-alocal.js exports LEG_ID = \'leg1_landed\', identical to the old module, so the emitted leg-id set is unchanged and assertProducedLegsMatchSSOT / assertLegSetRatified (lib/drive-loop/score/drive-score-legs.js, RATIFIED_LEG_IDS = [leg1_landed, leg2_uptake, leg4_capacity]) still hold. No phantom leg, no silent denominator widening. LEG_POINTS = 2 matches the ratified 3-leg/6-point denominator.',
    test_evidence: 'Baseline before mutations: 73/73 passed across tests/unit/drive-loop/score/leg1-landed-alocal.test.js + tests/unit/cron/drive-report-sweep.test.js. Broader sweep: 536/536 passed across 39 files in tests/unit/cron/ + tests/unit/drive-loop/. After both mutations were reverted, 73/73 restored and `git diff HEAD` is empty (only untracked .artifacts/tst/ remains).',
    mutations_applied_and_reverted: [
      'scripts/cron/drive-report-sweep.mjs:271 windowHours:720 removed -> 1 RED -> reverted via git checkout',
      'lib/roadmap/plan-check-status.js:235 sd_key renamed to promoted_to_sd_key -> TS-8 RED -> reverted via git checkout',
    ],
    branch_position_measured: 'HEAD..origin/main = 17 (behind), origin/main..HEAD = 3 (ahead), merge-tree = CONFLICT in 2 files',
    prior_findings_reverified: {
      'PLAN TESTING 8606170f (wrong population / earnability)': 'CLOSED — windowHours:720 is wired AND pinned by a capturing test (mutation-verified).',
      'EXEC SECURITY f84884eb (shallow-clone false zero)': 'CLOSED at both layers — fetch-depth:0 in the workflow (the real fix) and empty/errored corpus => unavailable in the module (the backstop). Residual blind spot documented as V2.',
      'EXEC TESTING 7b22c9ee (windowHours untested, TS-8 vacuous)': 'CLOSED — both mutation-verified RED.',
    },
    gates: {
      gate4_subagent_coverage: 'VALIDATION (this run), TESTING (8606170f PLAN, 7b22c9ee EXEC), SECURITY (f84884eb EXEC) present for this SD.',
      gate4_scope_creep: 'NONE — delivered files map 1:1 to FR-1..FR-4 plus evidence writers.',
      gate4_ui_integration: 'N/A — backend/cron scoring leg, no UI entry point.',
    },
  },
  execution_time_ms: 1620000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'VALIDATION',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
