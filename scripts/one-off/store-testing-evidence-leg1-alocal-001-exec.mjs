// SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — TESTING sub-agent evidence writer (EXEC-TO-PLAN phase).
// Retrospective validation of the ACTUALLY SHIPPED code on branch
// feat/SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 (01603df45a2, 51f180adbcf) — every number below
// was re-measured independently by this agent, not carried over from the author's report.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001';
const PHASE = 'EXEC-TO-PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'Independent retrospective validation of the SHIPPED code (not the PLAN-phase test plan). THE CORE OF THIS SD IS '
    + 'SOUND AND ITS CENTRAL PREMISE IS CONFIRMED BY LIVE MEASUREMENT. Re-ran the suites myself: 529/529 pass across 39 '
    + 'files in tests/unit/drive-loop + tests/unit/cron (author reported 528 — off by one, immaterial). Independently '
    + 'reproduced the anchor mutation-kill: reverting anchoredKeyPattern to a naive substring turns exactly TS-3a and '
    + 'TS-3b RED and nothing else, as claimed. Independently confirmed the empty-window fallback text IS byte-identical '
    + 'to the already-merged LEG1-001 copy — extracted the full 415-char string literal from origin/main and from HEAD '
    + 'and compared by sha256 (ea66aae6171a75c456932b5d both sides); this was verified from git directly, NOT from the '
    + 'test pin. Executed the production wiring for real against the live repo and live DB (no stubs): runHardenedGit '
    + 'accepts [log, main, --merges, --format=%s], returns 3776 subjects, and the leg scores a real 1.4/2. The widened '
    + 'window is genuinely load-bearing and genuinely effective: measured live, done[] is 0 at 48h, 0 at 168h, and 21 '
    + 'rows / 20 unique keys at 720h, on which A-LOCAL earns 14/20 = 70.0% — versus the 6.3% that made the old merge-base '
    + 'rule unearnable. The rule the chairman ratified does in fact earn. No regressions: 313/313 pass across every '
    + 'importer of the changed modules, and the new mandatory runGitLog injection breaks no caller (buildGather has '
    + 'exactly one production caller, the CLI, which injects it; drive-report-produce.mjs deliberately refuses and '
    + 'drive-report-sms-sweep.mjs imports only etParts/windowKey). '
    + 'SIX GAPS FOUND, ONE BLOCKING. (F1, BLOCKING) windowHours:720 — the single load-bearing production change of this '
    + 'SD — has ZERO test coverage: I deleted it (reverting to the default 48) and the suite stayed 529/529 GREEN, while '
    + 'live measurement shows 48h yields an EMPTY population, so that one-token revert silently turns the entire SD into '
    + 'a no-op with leg1 back to permanently unavailable and nothing red. (F2) leg1 has no failure containment while '
    + 'leg4 does: I made git log fail (the CI shallow / PR-head-checkout case where main is not a local ref) and the '
    + 'throw escaped scoreLeg1ALocal, escaped the legs array, and killed gather() entirely — NO drive report row written '
    + 'at all, versus leg4 which degrades to unavailable. A leg whose stated philosophy is "honestly unavailable, never a '
    + 'false zero" currently fails by taking down the whole sweep. (F3) N+1 unbounded git spawns: the fetch sits inside '
    + 'the per-key filter, so 20 keys = 20 subprocesses each re-reading all 3776 merge subjects = 9.87s measured, growing '
    + 'in both population and repo history; hoisting the fetch is a 3-line fix. (F4) mergeLogArgs sinceIso is unreachable '
    + 'dead code — isSdLandedInMainHistory hardcodes mergeLogArgs() with no pass-through, so production ALWAYS fetches '
    + 'unbounded history and the only exercise of the sinceIso branch is a direct unit test of a path no caller can '
    + 'reach. (F5) TS-8 is VACUOUS and re-commits the exact defect the PLAN-phase TESTING evidence raised as gap 5: it '
    + 'builds a local object literal and asserts its keys equal a local array — a tautology that imports nothing from '
    + 'plan-check-status.js. I renamed sd_key to promoted_to_sd_key in the REAL producer (the precise drift its own '
    + 'comment says it exists to catch) and 529/529 stayed GREEN. (F6) TS-7 is named "byte-identical" but asserts only 4 '
    + 'regex tokens; I reworded the sentence around those tokens and it stayed green. The text IS byte-identical today '
    + '(F5/F6 are pin-strength gaps, not present-tense defects). Only F1 blocks.',
  issues: [
    {
      severity: 'critical',
      title: 'F1 BLOCKING — windowHours:720 is unpinned; deleting it keeps 529/529 green while silently no-op-ing the SD',
      detail:
        'scripts/cron/drive-report-sweep.mjs:271 passes computePlanCheckStatus(supabase, { windowHours: 720 }). '
        + 'computePlanCheckStatus defaults to windowHours = 48 (lib/roadmap/plan-check-status.js:145). MEASURED LIVE: '
        + 'done[] is 0 rows at 48h, 0 rows at 168h, 21 rows / 20 unique keys at 720h. So the 720 literal is the ONLY '
        + 'reason leg1 takes its measured branch at all. MUTATION PERFORMED: replaced it with '
        + 'computePlanCheckStatus(supabase) and re-ran tests/unit/drive-loop + tests/unit/cron — 39 files, 529/529 '
        + 'PASSED. Nothing red. grep confirms the token 720 appears nowhere in tests/unit/cron/drive-report-sweep.test.js '
        + 'and windowHours appears in no test outside an unrelated switch-automation precheck. Every test stubs '
        + 'computePlanCheckStatus as async () => status, discarding the options argument entirely, so no test can observe '
        + 'WHAT was requested. The existing [WIRING] source-text test in the same file already establishes the pattern '
        + 'for pinning a CLI call shape but was not extended to this call. This is the same class the file\'s own comment '
        + 'warns about ("a defaulted injection hides an unwired CLI behind a green suite") — here a defaulted WINDOW '
        + 'hides an unmeasurable leg behind a green suite.',
    },
    {
      severity: 'high',
      title: 'F2 — leg1 has no failure containment; an unanswerable git question kills the ENTIRE sweep instead of degrading to unavailable',
      detail:
        'EXECUTED, not hypothesised. Made runGitLog target a nonexistent ref (the real CI case: actions/checkout with '
        + 'fetch-depth 1 or a PR-head-only clone leaves main absent as a local ref). runHardenedGit throws; the throw '
        + 'passes straight through isSdLandedInMainHistory and scoreLeg1ALocal (neither has a try/catch), through the '
        + 'legs array literal, and out of gather() — so runDriveReportSweep writes NO drive_reports row at all. Contrast '
        + 'scoreCapacityLeg in the same file, which catches and returns the unavailable shape ("scoreLeg4 could not be '
        + 'scored this run: ..."), verified in the same run. leg1\'s entire design rationale is honest unavailability '
        + 'over a false zero, but its actual failure mode is louder than a false zero — it destroys the whole report. No '
        + 'test injects a throwing runGitLog. Recommend wrapping the scoreLeg1ALocal call (or the predicate) so a git '
        + 'failure yields unavailable(...) naming the git error, plus a test that injects a thrower and asserts gather() '
        + 'still returns a row with leg1 unavailable.',
    },
    {
      severity: 'medium',
      title: 'F3 — N+1 unbounded git subprocess spawns: one full 3776-subject log re-read per unique SD key (9.87s measured)',
      detail:
        'isSdLandedInMainHistory calls runGitLog(mergeLogArgs()) internally, and scoreLeg1ALocal calls it from inside '
        + 'uniqueKeys.filter(...). MEASURED against the live 720h population: 20 unique keys produced 20 git subprocess '
        + 'spawns and 9871ms wall clock; a single unbounded call is 3776 subjects / ~400ms. Cost is O(unique_keys x '
        + 'merge_history) and both factors only grow. The subject list is identical for every key, so the fix is to '
        + 'fetch once and test all keys against the one list — roughly 3 lines, and it also removes the repeated-work '
        + 'objection to the unbounded fetch in F4. Non-blocking (cron context) but it is the difference between ~0.4s '
        + 'and ~10s today, and worse each month.',
    },
    {
      severity: 'low',
      title: 'F4 — mergeLogArgs({sinceIso}) is unreachable in production; the real runGitLog always fetches unbounded history',
      detail:
        'DIRECT ANSWER to the review question: no, sinceIso is never wired. isSdLandedInMainHistory:77 calls '
        + 'mergeLogArgs() with no arguments and exposes no pass-through, and the CLI at drive-report-sweep.mjs:442 '
        + 'builds runGitLog around whatever args it is handed — so the production command is always exactly '
        + '[log, main, --merges, --format=%s], verified by executing it. Unboundedness ALONE is acceptable: 3776 '
        + 'subjects in ~400ms, and a --since bound would introduce a genuine correctness hazard (an SD completed inside '
        + 'the 720h window can have merged earlier, so a naive --since tied to the same window would manufacture false '
        + 'negatives). The real cost is F3\'s 20x repetition, which should be fixed by memoising rather than by bounding. '
        + 'Recommend either wiring sinceIso through or deleting the parameter — an exported option no caller can reach, '
        + 'plus a unit test that exercises it (test line 86-87), is a test pinning a fact about an unreachable branch '
        + '(PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001).',
    },
    {
      severity: 'medium',
      title: 'F5 — TS-8 is vacuous: it claims to bind the fixture to the REAL producer but is a tautology over two local literals',
      detail:
        'tests/unit/drive-loop/score/leg1-landed-alocal.test.js:170-182, named "the done[]-shaped test fixture is bound '
        + 'to the REAL computePlanCheckStatus output shape". It constructs fixtureRow as a local object literal, '
        + 'constructs DOCUMENTED_DONE_ROW_KEYS as a local array, and asserts Object.keys(fixtureRow).sort() equals it. '
        + 'The file imports only vitest and leg1-landed-alocal.js — plan-check-status.js appears solely in a prose '
        + 'comment. MUTATION PERFORMED: renamed the real producer output field from sd_key to promoted_to_sd_key at '
        + 'lib/roadmap/plan-check-status.js:235 — precisely the drift the test comment says it exists to prevent — and '
        + 'the full suite stayed 529/529 GREEN. This directly re-commits gap 5 of the PLAN-phase TESTING evidence, which '
        + 'warned in these words: "a hand-written fixture agreeing with a mis-coded accessor is two green endpoints '
        + 'proving nothing". The real shape does match today (verified live: done[0] keys are exactly completed_at, '
        + 'item_id, sd_key, title, wave), so this is a pin-strength gap, not a present defect. Fix: import '
        + 'computePlanCheckStatus (or its done[]-row builder) and assert against a row it actually produces.',
    },
    {
      severity: 'low',
      title: 'F6 — TS-7 is named "byte-identical" but only asserts 4 regex tokens',
      detail:
        'tests/unit/cron/drive-report-sweep.test.js TS-7 asserts /unearnable/i, /7\\/111/, /ab82da6b/ and /fea8b4c4/. '
        + 'MUTATION PERFORMED: replaced the opening clause of the fallback string while preserving those four tokens — '
        + 'tests/unit/cron stayed 283/283 GREEN. The text IS byte-identical today (independently verified: 415 chars, '
        + 'sha256 ea66aae6171a75c456932b5d identical between origin/main and HEAD), so nothing is broken; the test name '
        + 'simply overclaims what it measures. Fix: pin the exact string as a constant, or rename the test.',
    },
    {
      severity: 'low',
      title: 'F7 INFO — PR #6953 (LEG2-001) still OPEN and edits the same buildGather signature, legs array and describe blocks',
      detail:
        'Confirmed via gh: PR #6953 feat/SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 is OPEN, mergedAt null. origin/main\'s '
        + 'buildGather is still the 5-arg shape, and this branch is 0 commits behind origin/main, so there is no conflict '
        + 'right now. But #6953 adds mandatory readLeg2Cohort + nowMs injections to the SAME function, touches the SAME '
        + 'legs array, and adds to the SAME test describe blocks — whichever lands second must rebase and re-verify the '
        + 'required-injection set. The PLAN-phase evidence already carried this as TR-3; restating it as a live ship-order '
        + 'note, not a code defect.',
    },
  ],
  recommendations: [
    'BLOCKING (F1): pin windowHours:720. Cheapest durable form is a source-text assertion in the existing [WIRING] '
    + 'block — expect(src).toMatch(/computePlanCheckStatus\\(supabase, \\{ windowHours: 720 \\}\\)/) — but the stronger '
    + 'form is a behavioural one: have the computePlanCheckStatus stub RECORD its second argument and assert '
    + 'gather() requested 720, since that also survives reformatting.',
    'STRONGLY RECOMMENDED (F2): contain leg1 failures the way leg4 already does — catch around the scoreLeg1ALocal '
    + 'call, return unavailable() naming the git error, and add a test injecting a throwing runGitLog that asserts '
    + 'gather() still produces a row.',
    'RECOMMENDED (F3): hoist runGitLog(mergeLogArgs()) out of the per-key loop; fetch the subject list once in '
    + 'scoreLeg1ALocal and test all unique keys against it. ~10s -> ~0.4s on today\'s population.',
    'F4: either wire sinceIso through isSdLandedInMainHistory or delete the parameter and its unit test; do NOT bound '
    + 'the log by the same window as the completed-items population (merge date and completion date differ).',
    'F5: make TS-8 import the real producer and assert against a row it actually emits.',
    'F6: pin the fallback string exactly, or rename TS-7 to match what it measures.',
    'F7: rebase and re-verify buildGather\'s required-injection set against whichever of #6953 / this branch lands second.',
  ],
  metadata: {
    validation_mode: 'retrospective_post_implementation_shipped_code',
    branch: 'feat/SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001',
    commits_verified: ['01603df45a2', '51f180adbcf'],
    suites_rerun: 'tests/unit/drive-loop + tests/unit/cron',
    tests_passed: '529/529 across 39 files (author reported 528)',
    regression_scope: '313/313 across all importers of changed modules (belt-verdict, drive-report-sms-sweep, drive-report-wiring, ismainmodule lint guard, drive-loop)',
    full_repo_unit_suite: 'not completed — npm run test:unit exceeded the 10-minute tool cap; scoped to importers instead',
    mutation_anchor_guard: 'REPRODUCED — naive substring revert kills exactly TS-3a + TS-3b, 527/529',
    mutation_windowhours: 'GAP FOUND — removing windowHours:720 leaves 529/529 GREEN',
    mutation_ts8_field_rename: 'GAP FOUND — renaming real producer sd_key -> promoted_to_sd_key leaves 529/529 GREEN',
    mutation_ts7_reword: 'GAP FOUND — rewording fallback text around the 4 asserted tokens leaves 283/283 GREEN',
    fallback_text_byte_identity: 'CONFIRMED from git (not from the test pin) — 415 chars, sha256 ea66aae6171a75c456932b5d on both origin/main and HEAD',
    live_window_measurement: { '48h': 'done=0 UNAVAILABLE', '168h': 'done=0 UNAVAILABLE', '720h': 'done=21, 20 unique keys, MEASURED' },
    live_production_score: 'points 1.4/2, landed 14/20 = 70.0% (old merge-base rule: 6.3%)',
    production_git_command: 'log main --merges --format=%s (always unbounded — no --since wired)',
    merge_corpus_size: 3776,
    n_plus_1_cost: '20 subprocess spawns / 9871ms for 20 unique keys',
    leg1_failure_mode: 'THROWS and kills gather() entirely (leg4 degrades to unavailable)',
    buildgather_callers: 'exactly 1 production caller (CLI, injects runGitLog); produce.mjs refuses by design; sms-sweep imports only etParts/windowKey',
    leg2_pr_6953_state: 'OPEN, not merged; branch 0 commits behind origin/main',
    real_done_row_keys: 'completed_at,item_id,sd_key,title,wave (matches the shipped accessor)',
    working_tree_restored_clean: true,
  },
  execution_time_ms: 1980000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
