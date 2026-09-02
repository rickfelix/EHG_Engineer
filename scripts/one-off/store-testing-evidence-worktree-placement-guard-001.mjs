// SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001 — TESTING sub-agent evidence writer (EXEC phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001';
const PHASE = 'EXEC';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Independently verified the worktree-placement guard build by RUNNING the suites and PROBING the live hook, not by ' +
    'reading claims. TESTS: `npx vitest run lib/__tests__/worktree-add-sibling-guard.test.js ' +
    'tests/unit/enforcement-worktree-add-sibling-guard.test.js tests/unit/worktree-reaper/` => 29 files / 334 tests PASSED. ' +
    'The two new files alone = 21 tests (15 unit + 6 subprocess integration), matching the build claim exactly. ' +
    'REGRESSION: enforcement-hook-registration, enforcement-npm-install-guard, enforcement-rca-tiered, ' +
    'enforcement-worktree-hygiene, pre-tool-enforce-schema + worktree-guards => 7 files / 48 tests PASSED, no regressions. ' +
    'LIVE HOOK PROBES (8, run by me as real subprocesses, NOT via the test harness): with cwd=main-repo-root semantics the ' +
    'guard REFUSES `git worktree add ../sibling-evil -b x` (exit 2, ENF-12e banner naming .worktrees/{sd,qf,adhoc}/<key>), ' +
    'REFUSES the `.worktrees-evil` separator-anchor bypass (exit 2 — F5 genuinely closed), ALLOWS ' +
    '`git worktree add .worktrees/qf/QF-PROBE -b qf/QF-PROBE` (exit 0, no ENF-12e), and honors LEO_WORKTREE_ADD_GUARD=off ' +
    '(exit 0). Crucially I probed BOTH input paths: the automated tests only exercise the CLAUDE_TOOL_INPUT env-var path, so ' +
    'I separately drove the real PRODUCTION stdin contract ({tool_name,tool_input,hook_event_name} piped to the hook) and ' +
    'confirmed identical refuse/allow behavior — a path the committed tests never cover. ' +
    'PRD COVERAGE: TS-1..TS-8 all have corresponding live tests (TS-1/TS-2 integration, TS-3 move+remove non-interception, ' +
    'TS-4/TS-5 detector unit, TS-6 docs verified by reading the quick-fix.md diff, TS-7 separator anchor, TS-8 gauge-only ' +
    'wiring with production-wiring.test.js passing). The reaper gauge is NOT a dead write: `reasons` flows into ' +
    'buildRecord({evidence: reasons}) -> emitJsonLine, so it is genuinely consumed. ' +
    'HOWEVER — two REAL defects, both invisible to every test that now exists, are recorded below (F-A, F-B). Neither is a ' +
    'test failure; both were found only by probing beyond the suite. Verdict is CONDITIONAL_PASS, not PASS, because F-A ' +
    'actively steers a worktree-resident worker into the nested-worktree anti-pattern while blocking the correct command.',
  findings: [
    {
      id: 'F-A-worktree-cwd-polarity-inversion',
      severity: 'high',
      note:
        'MEASURED DEFECT (live probes P5/P6). ENFORCEMENT 12e derives repoRoot by walking up from input.cwd doing ' +
        'fs2.statSync(path.join(dir, ".git")). statSync SUCCEEDS ON A FILE, and a git worktree\'s .git is a FILE ' +
        '(verified: `<worktree>/.git` = "gitdir: C:/Users/rickf/Projects/_EHG/EHG_Engineer/.git/worktrees/<name>"). So when ' +
        'cwd is itself a worktree, repoRoot resolves to THE WORKTREE, not the main repo, and .worktrees/ is anchored to the ' +
        'wrong root. Consequences, both probed as real subprocesses: (P5) targeting the CORRECT sanctioned location ' +
        '`git worktree add <mainRepo>/.worktrees/qf/QF-PROBE2 -b ...` from a worktree cwd is REFUSED with exit 2 — a false ' +
        'positive that blocks legitimate work; (P6) targeting `<worktree>/.worktrees/qf/QF-NEST` — a NESTED worktree, which ' +
        'the reaper\'s own isNested detector treats as bad — is ALLOWED with exit 0. The guard therefore has INVERTED ' +
        'polarity from inside a worktree, and its remediation banner ("Use .worktrees/{sd,qf,adhoc}/<key>") is actively ' +
        'wrong there: following it verbatim creates the nested anti-pattern. This matters in practice because fleet workers ' +
        'routinely run FROM worktrees (this very verification session does) and the hook is registered globally via ' +
        '${CLAUDE_PROJECT_DIR} in .claude/settings.json:320. NOT covered by any test: the integration suite sets ' +
        'cwd=path.resolve(".") which under vitest IS the worktree, so target `.worktrees/qf/...` resolves under the ' +
        'worktree and passes for the wrong reason — the suite is blind to exactly this case. FIX AVAILABLE AND CHEAP: ' +
        '`git rev-parse --git-common-dir` from the worktree already returns the main .git ' +
        '(C:/Users/rickf/Projects/_EHG/EHG_Engineer/.git) — verified by me; derive repoRoot from its dirname, or detect the ' +
        '.git-file case and follow the gitdir pointer, instead of accepting any statSync hit.',
    },
    {
      id: 'F-B-reaper-gauge-blind-to-active-claims',
      severity: 'medium',
      note:
        'MEASURED BY STATIC TRACE (unambiguous control flow, scripts/worktree-reaper.mjs:1511-1524). The per-worktree loop ' +
        'does `if (activeClaim) { ...buildRecord({evidence: {claim: activeClaim}}); emitJsonLine(rec); continue; }` BEFORE ' +
        'classifyWorktree is ever called at :1527. Since isOutsideWorktreesDir is invoked inside classifyWorktree (:798), ' +
        'the sibling gauge CANNOT FIRE for any actively-claimed worktree. That is precisely the state that matters: this ' +
        'SD\'s own witnessed trigger (EHG_Engineer-qf-117, a live seat frozen by a sibling worktree) is by definition an ' +
        'actively-claimed worktree. The gauge only reports siblings that are already unclaimed/stale — the less harmful ' +
        'ones. This is compounded by a documentation claim shipped in the same change: ' +
        'docs/protocol/fleet-worker-loop-directive.md now tells a frozen worker to confirm the diagnosis "by the reaper\'s ' +
        'isOutsideWorktreesDir gauge line" — but a frozen worker\'s worktree IS actively claimed, so that line will be ' +
        'ABSENT exactly when the doc sends someone to look for it. The doc points at a blind instrument. Advisory-only, so ' +
        'no incorrect reap results (the gauge-only wiring is correctly conservative), but the stated diagnostic purpose is ' +
        'not met. Secondary observability nit: the gauge surfaces only in the emitJsonLine JSON stream via evidence:reasons ' +
        '— humanTableRow prints `categories`, which the gauge deliberately never joins, so a human reading the plain table ' +
        'will not see it at all.',
    },
    {
      id: 'F-C-stdin-path-untested',
      severity: 'low',
      note:
        'The committed integration tests drive the hook ONLY through CLAUDE_TOOL_NAME/CLAUDE_TOOL_INPUT env vars. ' +
        'Production Claude Code delivers a {tool_name, tool_input, hook_event_name} payload on STDIN (the hook reads it at ' +
        'module load via fs.readFileSync(0), env vars are the documented FALLBACK). I probed the stdin path myself and it ' +
        'behaves correctly today (refuse exit 2 / allow exit 0), so this is not a live bug — but the real contract is ' +
        'currently unguarded by any test and could regress silently. Recommend one stdin-fed case in ' +
        'tests/unit/enforcement-worktree-add-sibling-guard.test.js.',
    },
    {
      id: 'F-D-work-is-uncommitted',
      severity: 'medium',
      note:
        'PROCESS observation, not a code defect. At verification time the entire implementation is UNCOMMITTED working-tree ' +
        'state: `git diff main...HEAD` is EMPTY and HEAD (baa261d98e2) carries no unique commits, while `git status` shows ' +
        '9 modified + 4 new untracked implementation/test files. Everything I verified I verified from the working tree. ' +
        'Nothing is on a pushed branch yet, so a reset/checkout in this worktree would destroy it and the GITHUB/PR stage ' +
        'has nothing to act on. Must be committed before EXEC-TO-PLAN is meaningful.',
    },
    {
      id: 'F-E-quick-fix-doc-prose-garbled',
      severity: 'low',
      note:
        'Cosmetic. .claude/commands/quick-fix.md step 2 contains a self-contradicting run-on: "...blocked by the ENF-12e ' +
        'worktree-placement guard\'s sibling case is a different failure, but a bare `git checkout -b` here is blocked by ' +
        'ENFORCEMENT 17...". The sentence never resolves; a reader cannot tell which guard blocks what. Worth one editing ' +
        'pass since this file is the primary human-facing remediation the SD ships.',
    },
    {
      id: 'V-verified-separator-anchor-fix-real',
      severity: 'info',
      note:
        'POSITIVE confirmation. The F5 bypass is genuinely closed, not just asserted: live probe P3 on ' +
        '`git worktree add .worktrees-evil/x` returns exit 2 with reason=outside_worktrees_dir_separator_anchor. The guard ' +
        'correctly does NOT modify validateWorktreePath (which still has the bare unanchored startsWith at ' +
        'scripts/resolve-sd-workdir.js:140), honoring TR-1, and instead applies its own anchored check first — both checks ' +
        'must pass. Note the underlying validateWorktreePath weakness still exists for its other ~2 callers.',
    },
  ],
  metadata: {
    tests_run_by_me: true,
    primary_suite_command: 'npx vitest run lib/__tests__/worktree-add-sibling-guard.test.js tests/unit/enforcement-worktree-add-sibling-guard.test.js tests/unit/worktree-reaper/',
    primary_suite_files_passed: 29,
    primary_suite_tests_passed: 334,
    primary_suite_failures: 0,
    new_files_test_count: 21,
    regression_suite_files_passed: 7,
    regression_suite_tests_passed: 48,
    regression_failures: 0,
    live_hook_probes_run: 8,
    probe_refuse_relative_sibling_exit: 2,
    probe_allow_in_tree_exit: 0,
    probe_separator_anchor_bypass_exit: 2,
    probe_off_switch_exit: 0,
    probe_stdin_refuse_exit: 2,
    probe_stdin_allow_exit: 0,
    probe_worktree_cwd_correct_target_exit: 2,
    probe_worktree_cwd_nested_target_exit: 0,
    prd_test_scenarios_total: 8,
    prd_test_scenarios_covered: 8,
    gauge_is_dead_write: false,
    gauge_consumed_via: 'buildRecord({evidence: reasons}) -> emitJsonLine (stderr JSON stream)',
    gauge_blind_to_active_claims: true,
    defects_found: ['F-A-worktree-cwd-polarity-inversion', 'F-B-reaper-gauge-blind-to-active-claims'],
    work_committed: false,
    recommended_fix_for_F_A: 'git rev-parse --git-common-dir (verified to return the main .git from inside a worktree)',
  },
  execution_time_ms: 900000,
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
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
