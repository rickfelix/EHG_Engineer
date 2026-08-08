/**
 * EXEC-phase SECURITY **RE-REVIEW #4** for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001
 * (sd_id 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d), at HEAD 83f6b8d7399.
 *
 * Review target is HEAD 83f6b8d7399 (detectors.js + two test files only). The identity guard
 * module is BYTE-IDENTICAL to a0ea71c4300 at that commit, so the round-3 blocking findings
 * S2-R2 / S2-R3 were re-measured and reproduce unchanged.
 *
 * Round 3 (row 33616946) FAIL stands. This row adds the idle-route review and the test-vacuity
 * audit the lead explicitly requested, and records a labelled SNAPSHOT of uncommitted in-flight
 * work that addresses S2-R2/S2-R3 but is not part of any commit and is not reviewed here.
 *
 * TR-1/TR-4 honoured. detectors.js mutations were applied to a file-level backup and restored by
 * copy (never `git checkout`), and the lead's concurrent uncommitted edits were never touched.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'SECURITY';
const PHASE = 'EXEC';

const findings = [
  {
    id: 'S2-R2 / S2-R3 (CARRIED, UNCHANGED)',
    severity: 'critical',
    title: 'The round-3 blocking findings are untouched at HEAD 83f6b8d7399 — this commit changes detectors.js only',
    note:
      '`git diff a0ea71c4300..83f6b8d7399 -- lib/fleet/source-tree-refresh.cjs` is EMPTY. Re-ran the full attack '
      + 'lab against HEAD: the `.git`-FILE plant (mkdir + a ~50-byte file containing "gitdir: <repoRoot>/.git") is '
      + 'still ACCEPTED — {created:false, refreshed:true}, marker written into the attacker directory, payload '
      + 'intact — and the bare-mkdir + ambient GIT_DIR/GIT_WORK_TREE variant is still ACCEPTED. The handoff message '
      + 'accompanying this commit restates "S2-R via --show-toplevel == the dir itself" as addressed; that '
      + 'restatement is stale — it predates row 33616946, which refuted it by measurement.',
    consequence:
      'Unchanged from round 3: the tick would spawn attacker code with --execute --stage2 --yes, and the reuse '
      + '`merge --ff-only` moves the SHARED ROOT\'s own refs (observed HEAD 315f96ff -> 9452688a with the working '
      + 'tree left behind). Still BLOCKING.',
    recommendation:
      'See row 33616946. NOTE: uncommitted working-tree code implementing exactly that recommendation was observed '
      + 'during this review and snapshot-measured (see metadata.in_flight_snapshot) — but it is not committed, not '
      + 'pushed, and is NOT what this verdict is rendered against.',
    priority: 'critical',
    blocking: true,
  },
  {
    id: 'IDLE-2',
    severity: 'medium',
    title:
      'The two layer-2 mechanisms now share ONE list but use TWO different matching predicates, so they protect '
      + 'different sets — `.reaper-source-2` is protected by the orphan-sd route and reapable by the idle route',
    note:
      'lib/worktree-reaper/detectors.js: the new idle guard tests `SOURCE_TREE_DIRNAMES.includes(path.basename(...))` '
      + '— EXACT match — while isKnownNonSdPrefix (:487) tests `NON_SD_PREFIXES.some(p => basename.startsWith(p))` — '
      + 'PREFIX match — over a list that now spreads the same constant. MEASURED by calling both detectors directly: '
      + 'basename ".reaper-source-2" -> isIdle {matched:true, reason:"idle_beyond_threshold"} but hasOrphanSD '
      + '{matched:false, reason:"non_sd_prefix"}. The commit comment says "NON_SD_PREFIXES now spreads '
      + 'SOURCE_TREE_DIRNAMES so the two lists cannot drift". The LISTS cannot drift; the PREDICATES over them '
      + 'already have, and the single-representation refactor is what made that invisible — one constant now reads '
      + 'as one contract while backing two different membership tests.',
    consequence:
      'A source tree at any basename that merely STARTS WITH a protected name is stage-2 eligible via the idle route, '
      + 'protected only by the best-effort marker. Not reachable at the default paths; reachable via the source-dir '
      + 'override (see IDLE-3), which is the same axis.',
    recommendation:
      'Make the two sites use the SAME predicate over SOURCE_TREE_DIRNAMES — either both exact or both prefix — and '
      + 'export that predicate as one function rather than exporting the list and letting each call site choose how '
      + 'to match it. A shared list with per-site matching semantics is not single representation.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'IDLE-3',
    severity: 'medium',
    title:
      'Both layer-2 mechanisms are keyed on hardcoded BASENAMES, but FLEET_REAPER_SOURCE_DIR / FLEET_SPAWN_SOURCE_DIR '
      + 'let the tree live at any basename — so under a supported config knob "two independent layers" is false again',
    note:
      'resolveSourceTreeDir (lib/fleet/source-tree-refresh.cjs:84-88) honours the env override for the FULL path, '
      + 'with no constraint on basename beyond the .worktrees/ siting refusal. SOURCE_TREE_DIRNAMES is the literal '
      + '[".reaper-source", ".spawn-source"]. MEASURED: basename ".reaper-src" -> isIdle {matched:TRUE, '
      + 'reason:"idle_beyond_threshold"} AND hasOrphanSD {matched:TRUE, reason:"sdkey_not_in_db"} — stage-2 eligible '
      + 'via BOTH routes. Same for "reaper-source" without the leading dot, and for ".Reaper-Source" (the membership '
      + 'tests are case-sensitive while Windows paths are not). This is the SAME claim shape just retracted for the '
      + 'idle route, recurring one level up on the configuration axis rather than the route axis.',
    consequence:
      'For any override-configured source tree the only protection is markSourceTreeReapProtected, which is '
      + 'explicitly best-effort (it logs and continues on failure, source-tree-refresh.cjs:165-171) and is a deletable '
      + 'file — which is the exact reason layer 2 was built. The reaper can then classify and remove its own '
      + 'execution source on a host running WORKTREE_REAPER_EXECUTE=stage2.',
    recommendation:
      'Derive the protected set at RUNTIME from the resolved source-tree paths (resolveSourceTreeDir for both trees, '
      + 'reading the same env the reaper itself reads) instead of from a hardcoded basename literal, and compare '
      + 'resolved absolute paths rather than basenames. If that coupling is unwanted, then constrain the override to '
      + 'a fixed basename so the literal remains true — but do not leave the protection keyed on a name the '
      + 'configuration is free to change.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'TEST-1',
    severity: 'medium',
    title:
      'The vacuity class the lead asked me to look for is RE-COMMITTED in the new file: three assertions are '
      + 'generated by iterating SOURCE_TREE_DIRNAMES itself, so emptying that list ERASES the tests instead of failing them',
    note:
      'tests/unit/worktree-reaper/source-tree-idle-route.test.js drives `for (const dirname of SOURCE_TREE_DIRNAMES)` '
      + 'at the describe level (the two `isIdle REFUSES to match ${dirname}` cases) AND inside `it("the orphan-sd '
      + 'route still refuses them too — the original layer 2 is intact")`. MUTATION-MEASURED, M1 = set '
      + 'SOURCE_TREE_DIRNAMES to []: the suite went from 10 tests to 8 — the two isIdle cases were NOT generated at '
      + 'all, and the orphan-sd case PASSED with its loop body never entered, i.e. zero assertions executed. Only the '
      + 'literal-equality test caught M1. So the protection can be deleted from the constant and the suite that '
      + 'exists to pin it mostly disappears rather than turning red. The orphan-sd case is additionally the exact '
      + '`expect(r.matched).toBe(false)`-only shape this same commit message documents as measured-vacuous in the '
      + 'other file — the fix was applied to one file and the identical assertion was written fresh in the other.',
    consequence:
      'A test suite that cannot fail when the thing it protects is removed. Same class as the defect it was written '
      + 'to close, in the same commit.',
    recommendation:
      'Drive the loops from a HARDCODED literal list in the test (["\'.reaper-source\'", "\'.spawn-source\'"]) and '
      + 'assert SOURCE_TREE_DIRNAMES equals it, so the constant is the SUBJECT of an assertion rather than the source '
      + 'of the cases. Add `expect(SOURCE_TREE_DIRNAMES.length).toBeGreaterThan(0)` as a cheap guard against '
      + 'zero-case generation anywhere a test loop is fed by production data. Also assert `reason` in the orphan-sd '
      + 'case, matching the fix already applied in source-tree-self-protection.test.js.',
    priority: 'medium',
    blocking: false,
  },
  {
    id: 'TEST-2',
    severity: 'low',
    title:
      'it("the two lists are kept distinct, and the source trees are in both") asserts neither of the two things its '
      + 'name claims — it never touches NON_SD_PREFIXES',
    note:
      'The body is a single `expect(SOURCE_TREE_DIRNAMES).toEqual([\'.reaper-source\', \'.spawn-source\'])`. '
      + 'NON_SD_PREFIXES is module-local and unexported, so this test cannot observe "in both" or "kept distinct" '
      + 'even in principle. MUTATION-MEASURED, M2 = remove `...SOURCE_TREE_DIRNAMES` from NON_SD_PREFIXES: this test '
      + 'stayed GREEN. The property IS covered — by the rewritten `LAYER 2` test in '
      + 'source-tree-self-protection.test.js, which asserts reason === \'non_sd_prefix\' and was the single test M2 '
      + 'killed — just not by the test whose name claims it.',
    consequence:
      'A reader auditing coverage by test name would credit a property to an assertion that cannot see it. Coverage '
      + 'is real; the label is wrong.',
    recommendation:
      'Rename it to what it asserts (the literal contents of SOURCE_TREE_DIRNAMES), or export NON_SD_PREFIXES and '
      + 'assert containment directly.',
    priority: 'low',
    blocking: false,
  },
];

const confirmedSound = [
  {
    id: 'IDLE-1 — THE SCOPING BOUNDARY THE LEAD WAS LEAST SURE OF',
    title: 'CORRECT, and measured two-sided. Scoping to SOURCE_TREE_DIRNAMES rather than all of NON_SD_PREFIXES is the right call',
    note:
      'MEASURED by calling isIdle directly with an ancient last-commit and mtime and an empty claim map: '
      + 'qf-20260101-001, adhoc-thing, session-abc and _archive-old ALL return {matched:true, '
      + 'reason:"idle_beyond_threshold"} — they remain reapable; .reaper-source and .spawn-source return '
      + '{matched:false, reason:"source_tree_protected"}. The feared regression (blanket-applying NON_SD_PREFIXES '
      + 'and making every qf-/adhoc-/session- worktree immortal) does not occur, and the reasoning given for the '
      + 'narrower scope is correct: NON_SD_PREFIXES means "this basename is not an SD key", which is a statement '
      + 'about orphan-SD detection, not about reapability. The isIdle guard is also placed FIRST in the function, so '
      + 'it cannot be reached-around by claim/timing state, and its distinct reason string separates it from '
      + 'claim_active and no_timing_signal — those cases are NOT vacuous.',
  },
  {
    id: 'STAGE-2 ROUTE COMPLETENESS',
    title: 'Covering orphan-sd + idle is complete in practice — the third stage-2 route is unreachable for these trees',
    note:
      'stageForCategories (scripts/worktree-reaper.mjs:792-801) routes exactly three categories to stage 2: '
      + 'zombie-on-main, orphan-sd, idle. isZombieOnMain matches only when the branch is literally main/master; the '
      + 'dedicated trees are created with `-B` against the hardcoded REAPER_SOURCE_BRANCH / SPAWN_SOURCE_BRANCH '
      + '(\'reaper-source\'/\'spawn-source\', no env override for the branch), so that route cannot fire for them. '
      + 'The stage-1 routes are also accounted for: nested is impossible (the .worktrees/ siting refusal), '
      + 'shipped-stale resolves advisory-only for a branch with no PR (unchanged), and reap-eligible requires a '
      + 'planted marker.',
  },
  {
    id: 'LAYER 1 IS A TRUE CHOKEPOINT',
    title: 'The reap-protected marker gate sits before ALL classification, so layer 1 covers every route',
    note:
      'scripts/worktree-reaper.mjs:1371-1384 — `if (hasReapProtectedMarker(wt.path))` builds a keep record and '
      + '`continue`s, positioned immediately after the cursor guard and before isNested/isZombieOnMain/hasOrphanSD/'
      + 'isPatchEquivalentToMain/isIdle all run. So the retraction in the commit message is precisely calibrated: '
      + 'the tree was never UNPROTECTED via the idle route, the "two independent layers" claim was simply false for '
      + 'it. That is the right characterisation and it is now true.',
  },
  {
    id: 'THE M2 MUTATION IS CAUGHT',
    title: 'The rewritten LAYER 2 test does what its rewrite claims — the reason assertion is load-bearing',
    note:
      'MUTATION-MEASURED, M2 = drop `...SOURCE_TREE_DIRNAMES` from NON_SD_PREFIXES: exactly one test failed, '
      + '`LAYER 2 — the classifier REFUSES both dirnames as orphan SDs`, and it failed on the reason assertion. The '
      + 'stated lesson (matched:false is reachable by two paths; the reason string is the discriminator) is correct '
      + 'and the rewrite is effective for that mutation.',
  },
];

const results = {
  status: 'completed',
  verdict: 'FAIL',
  confidence: 93,
  score: 62,
  summary:
    'EXEC SECURITY re-review #4 at HEAD 83f6b8d7399. FIRST AND LOUDEST: this commit touches detectors.js and two '
    + 'test files ONLY — `git diff a0ea71c4300..83f6b8d7399 -- lib/fleet/source-tree-refresh.cjs` is empty — so the '
    + 'round-3 BLOCKING findings are untouched and were re-measured as reproducing identically at this HEAD: the '
    + '`.git`-file plant and the ambient GIT_DIR/GIT_WORK_TREE plant are both still ACCEPTED, marker written into the '
    + 'attacker directory. The handoff message restates "S2-R via --show-toplevel" as addressed; that is stale and '
    + 'was refuted by measurement in row 33616946. THE IDLE FIX ITSELF IS CORRECT, including the boundary the lead '
    + 'was least certain of: measured two-sided, qf-/adhoc-/session-/_archive all still return matched:true from '
    + 'isIdle while the source trees return source_tree_protected, so the immortality regression does not occur, and '
    + 'the narrow scoping is justified for the stated reason. Stage-2 route coverage is complete in practice — the '
    + 'third route (zombie-on-main) cannot fire for trees whose branch is hardcoded off main — and the marker gate at '
    + 'worktree-reaper.mjs:1371 is a genuine pre-classification chokepoint, so the retraction is calibrated '
    + 'correctly. THREE NEW FINDINGS. (1) The two layer-2 mechanisms now share one list but use two different '
    + 'predicates — exact `includes` in isIdle, `startsWith` in isKnownNonSdPrefix — so ".reaper-source-2" is '
    + 'protected by one route and reapable by the other; the lists cannot drift but the predicates already have. '
    + '(2) Both mechanisms are keyed on hardcoded basenames while FLEET_REAPER_SOURCE_DIR/FLEET_SPAWN_SOURCE_DIR let '
    + 'the tree live at any basename: ".reaper-src" measured stage-2 eligible via BOTH routes, leaving only the '
    + 'best-effort marker — the same "two independent layers" claim failing again, one level up on the configuration '
    + 'axis. (3) ANSWERING THE LEAD\'S DIRECT QUESTION: the vacuity class is re-committed in the new file. Three '
    + 'assertions are generated by iterating SOURCE_TREE_DIRNAMES itself; mutation-measured, emptying that constant '
    + 'took the suite from 10 tests to 8 — two cases were never generated and a third passed with its loop body '
    + 'never entered — so the protection can be deleted and the suite pinning it mostly disappears instead of '
    + 'turning red. Only the literal-equality test caught it. Separately, the test named "the two lists are kept '
    + 'distinct, and the source trees are in both" asserts neither, and survived the spread-removal mutation.',
  recommendations: [
    { action: 'Land the S2-R2/S2-R3 fix (row 33616946). Uncommitted working-tree code implementing it was snapshot-measured as effective (see metadata.in_flight_snapshot) but is not committed and is not what this verdict covers.', priority: 'critical', blocking: true },
    { action: 'Give SOURCE_TREE_DIRNAMES ONE exported membership predicate used by both isIdle and isKnownNonSdPrefix, instead of exporting the list and letting each site choose exact-vs-prefix matching.', priority: 'medium', blocking: false },
    { action: 'Key layer-2 protection on the RESOLVED source-tree paths (via resolveSourceTreeDir, reading the same env the reaper reads) rather than hardcoded basenames, so FLEET_REAPER_SOURCE_DIR/FLEET_SPAWN_SOURCE_DIR cannot configure the protection away.', priority: 'medium', blocking: false },
    { action: 'Drive the source-tree test loops from a hardcoded literal and assert SOURCE_TREE_DIRNAMES equals it, so the constant is the subject of an assertion rather than the generator of the cases; add a length>0 guard wherever production data feeds a test loop; assert `reason` in the orphan-sd case in the idle-route file.', priority: 'medium', blocking: false },
    { action: 'Rename it("the two lists are kept distinct, and the source trees are in both") to what it asserts, or export NON_SD_PREFIXES and assert containment.', priority: 'low', blocking: false },
  ],
  justification:
    'FAIL is carried forward from row 33616946, not re-derived: the blocking defect is in a file this commit does '
    + 'not touch, and it was re-measured at this HEAD rather than assumed. The commit itself is good work — it acts '
    + 'on a LOW finding, retracts an overstated claim precisely and correctly, gets the scoping boundary right where '
    + 'the obvious alternative would have caused a larger regression, and its rewritten layer-2 test is genuinely '
    + 'mutation-effective. The new findings are all in the "the fix for a blind check is usually blind too" family '
    + 'and are recorded as medium/low rather than blocking: the protection they weaken is layer 2, and layer 1 (the '
    + 'pre-classification marker chokepoint) is verified to cover every route. The test-vacuity finding is reported '
    + 'at medium despite being about tests because it is load-bearing on a data-loss path and because the lead asked '
    + 'for exactly this class by name.',
  metadata: {
    review_round: 4,
    supersedes_row: '33616946-7448-4a50-8cea-c5b07d288533',
    attack_mode: true,
    reviewed_head: '83f6b8d7399',
    reviewed_commits: ['83f6b8d7399'],
    carried_blocking_findings: ['S2-R2', 'S2-R3'],
    new_findings: ['IDLE-2', 'IDLE-3', 'TEST-1', 'TEST-2'],
    confirmed_sound: ['IDLE-1 scoping boundary', 'stage-2 route completeness', 'layer-1 chokepoint', 'M2 caught by rewritten test'],
    destructive_commands_run_against_live_pool: false,
    self_heal_enabled_on_shared_root: false,
    git_checkout_in_shared_root: false,
    live_repo_mutated: false,
    measurements: {
      identity_guard_diff_at_this_head: 'EMPTY — lib/fleet/source-tree-refresh.cjs unchanged from a0ea71c4300',
      attack_lab_rerun_at_head: {
        '.git FILE plant': 'ACCEPTED (still open)',
        'ambient GIT_DIR/GIT_WORK_TREE': 'ACCEPTED (still open)',
        'bare mkdir': 'refused',
        'git init / foreign repo / core.worktree': 'refused',
        'CONTROL genuine worktree': 'accepted',
      },
      idle_detector_two_sided: {
        '.reaper-source': 'matched:false reason:source_tree_protected',
        '.spawn-source': 'matched:false reason:source_tree_protected',
        'qf-20260101-001 / adhoc-thing / session-abc / _archive-old': 'matched:true reason:idle_beyond_threshold (still reapable — no regression)',
        '.reaper-source-2': 'isIdle matched:TRUE / hasOrphanSD matched:false — the predicates disagree',
        '.reaper-src (override basename)': 'isIdle matched:TRUE / hasOrphanSD matched:TRUE — stage-2 eligible via BOTH routes',
        'reaper-source (no dot)': 'stage-2 eligible via both routes',
        '.Reaper-Source (case)': 'stage-2 eligible via both routes',
        '.reaper-source/ (trailing sep)': 'protected (path.basename strips it)',
      },
      mutations: {
        'M1 SOURCE_TREE_DIRNAMES=[]': 'suite 10 tests -> 8 tests. The two loop-generated isIdle cases were ERASED, not failed; "the orphan-sd route still refuses them too" PASSED with zero assertions executed. Killed only: "the two lists are kept distinct", "LAYER 2 — classifier REFUSES both dirnames", "LAYER 1 — self-heals".',
        'M2 drop ...SOURCE_TREE_DIRNAMES from NON_SD_PREFIXES': 'exactly 1 test killed — "LAYER 2 — the classifier REFUSES both dirnames as orphan SDs" (on the reason assertion). "the two lists are kept distinct" stayed GREEN.',
      },
      stage2_routes: 'zombie-on-main | orphan-sd | idle. zombie-on-main requires branch===main/master; source-tree branches are hardcoded reaper-source/spawn-source with no env override, so it is unreachable for these trees.',
      layer1_chokepoint: 'scripts/worktree-reaper.mjs:1371-1384, before all classification, with continue',
      baseline_suite_state:
        'A run of the two source-tree suites showed 1 failure (LAYER 1 — protection SELF-HEALS). ATTRIBUTED TO '
        + 'UNCOMMITTED IN-FLIGHT WORK, NOT TO HEAD: git status showed lib/fleet/source-tree-refresh.cjs, '
        + 'lib/fleet/spawn-control.js, scripts/fleet/worktree-reaper-tick.cjs and '
        + 'tests/unit/fleet/source-tree-identity-realgit.test.js modified by a concurrent editor during this review. '
        + 'detectors.js was clean at HEAD, so the mutation results above are unaffected.',
    },
    in_flight_snapshot: {
      disclaimer:
        'NOT PART OF THIS VERDICT. Uncommitted working-tree content observed mid-review; measured because it is '
        + 'cheap and useful, not reviewed as a deliverable. It may have changed since.',
      blob_sha: '4e091403ef3734ebef98178b5ba2467fd0de7b95',
      file: 'lib/fleet/source-tree-refresh.cjs',
      observed_changes: 'adds CHECK 3 (--absolute-git-dir must live under <common>/worktrees/), a GIT_* env scrub, and realNorm() using fs.realpathSync.native',
      measured_effect: {
        '.git FILE plant': 'now REFUSED (SOURCE_TREE_NOT_LINKED_WORKTREE)',
        'ambient GIT_DIR/GIT_WORK_TREE': 'now REFUSED',
        'junction path to a genuine worktree': 'now ACCEPTED (FS-R2 closed)',
        'CONTROL genuine linked worktree': 'still ACCEPTED (no happy-path breakage)',
        'forged .git/worktrees metadata': 'still ACCEPTED — the documented residual, as predicted',
      },
    },
    files_reviewed: [
      'lib/worktree-reaper/detectors.js',
      'scripts/worktree-reaper.mjs',
      'lib/fleet/source-tree-refresh.cjs',
      'tests/unit/worktree-reaper/source-tree-idle-route.test.js',
      'tests/unit/worktree-reaper/source-tree-self-protection.test.js',
    ],
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY', '=======', results.summary, '',
  'OPEN FINDINGS (severity-ranked, file:line citations, measured exploits)',
  '='.repeat(72), '',
  findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + ' - ' + f.title + NL +
    'FINDING: ' + f.note + NL +
    'CONSEQUENCE: ' + f.consequence + NL +
    'RECOMMENDATION: ' + f.recommendation
  )).join(NL + NL + HR + NL + NL),
  NL + HR, '',
  'CLAIMS ATTACKED AND CONFIRMED CLOSED / SOUND',
  '='.repeat(72), '',
  confirmedSound.map((c) => '[CONFIRMED] ' + c.id + ' - ' + c.title + NL + c.note).join(NL + NL + HR + NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'Chief Security Architect' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence + ' SCORE=' + results.score);
