#!/usr/bin/env node
/**
 * One-off: REGRESSION sub-agent RE-CHECK for SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001,
 * PLAN_VERIFICATION phase, following the prior PASS (cd7d74d7-4002-430c-b380-7cf4d92eb567,
 * confidence 95, commits 313884be1ab + 7bf552b9fdc).
 *
 * Since that PASS, VALIDATION found a FAIL (evidence c39db537, score 88): the first
 * implementation only instrumented the _handleChairmanGate() -> _advanceStage() pathway, missing
 * 3 pre-existing call sites (pre_exec_skip_trigger, pre_exec_skip, re_entry) that advance off an
 * already-approved chairman_decisions row WITHOUT calling _handleChairmanGate() in that tick.
 * Fix commit b25ef69a64eaaa5c4912f0fef6619807170d1359 added an explicit `chairmanGateSource`
 * context parameter to _advanceStage() and threaded 'chairman_decision' through those 3 call
 * sites. This review independently re-verifies backward compatibility of THAT NEW change only.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'c0d3fcc7-dfd8-4c00-a9e9-1ec49fe48f7f';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';
const PRIOR_REGRESSION_EVIDENCE_ID = 'cd7d74d7-4002-430c-b380-7cf4d92eb567';
const VALIDATION_FAIL_EVIDENCE_ID = 'c39db537';
const FIX_COMMIT = 'b25ef69a64eaaa5c4912f0fef6619807170d1359';

const findings = [
  {
    id: 'signature-change-is-a-pure-additive-destructure-default',
    severity: 'INFO',
    summary: "`git show b25ef69a64e -- lib/eva/stage-execution-worker.js` confirms the ONLY change to _advanceStage()'s own body is its destructure line: `const { result = null, durationMs = 0, advancementType = 'normal' } = context;` -> `const { result = null, durationMs = 0, advancementType = 'normal', chairmanGateSource = null } = context; `. Adding a new destructured key with its own default (`= null`) cannot change behavior for a caller whose context object omits that key -- `context.chairmanGateSource` is `undefined` there, and the default applies, producing the identical local value (`null`) the function would have had if the parameter did not exist at all.",
  },
  {
    id: 'guard-condition-change-is-a-pure-OR-addition-provably-false-when-omitted',
    severity: 'INFO',
    summary: "The only other functional line touched is the recordGateAttempt guard: `if (result?._chairmanGateSource === 'chairman_decision')` -> `if (result?._chairmanGateSource === 'chairman_decision' || chairmanGateSource === 'chairman_decision')`. For every call site that does not set `chairmanGateSource` in its context object, the local variable is `null` (per the destructure default above), so the added disjunct evaluates to `null === 'chairman_decision'` = `false` unconditionally. Boolean OR with a provably-false right-hand side leaves the left-hand side (the pre-existing, previously-verified condition) as the sole determinant of the guard -- behaviorally identical to the pre-fix code for those callers, not merely 'probably the same'.",
  },
  {
    id: 'all-7-call-sites-enumerated-3-touched-4-untouched-by-this-commit',
    severity: 'INFO',
    summary: "Re-enumerated all `this._advanceStage(` call sites in the current worktree (7 total, matching the repo's own DR-22/VA-25 regression tests): lines 899 ('pre_exec_skip', non-blocking-gate branch), 1002 ('auto_approved'), 1090 ('pre_exec_skip_trigger', NOW tagged chairmanGateSource:'chairman_decision'), 1194 ('pre_exec_skip', blocking-gate branch, NOW tagged), 1256 ('re_entry', NOW tagged), 1517 ('governance_override'), 1882 ('normal'). Diffed each of the 4 untouched sites (899, 1002, 1517, 1882) against the pre-fix commit (313884be1ab) and confirmed byte-identical call-site text -- this commit did not modify their argument objects at all, so their behavior is unchanged by construction, independent of the guard-logic argument above.",
  },
  {
    id: 'no-other-file-or-test-passes-a-colliding-chairmanGateSource-key',
    severity: 'INFO',
    summary: "Grepped the full repo for `chairmanGateSource` (case-sensitive): every occurrence outside stage-execution-worker.js itself is inside the new test file tests/unit/eva/advance-stage-chairman-attempt-recording.test.js, and all of its assertions are pure source-string inspection (`source.split(...)`, `source.toContain(...)` against the file's own text) -- it never constructs a live context object, so there is no runtime collision surface there. Separately grepped every `_advanceStage(` and `advanceStage(` call across tests/ (both the worker's private method and the unrelated standalone `advanceStage(supabase, opts)` exported from artifact-persistence-service.js, confirmed to be a different function in a different module with a different (supabase, opts) signature -- no shared object shape, so no collision is possible between the two similarly-named functions). No test in the repo other than the new source-inspection file references the `chairmanGateSource` key at all, and no existing test constructs a context object containing that key incidentally.",
  },
  {
    id: 'full-eva-suite-independently-rerun-matches-commit-messages-claimed-baseline',
    severity: 'INFO',
    summary: "Independently ran `npx vitest run tests/unit/eva/` fresh in this session: 569 files passed / 1 failed / 6 skipped (576 total), 7406 tests passed / 34 skipped (7440 total) -- exactly matching the fix commit's own stated post-change baseline (569/570 files, 7406/7440 tests). The 1 failing file (path-integrity-flags-live-defaults.db.test.js) fails on DB_TIER_BLOCKED (no live non-production Supabase target configured via VITEST_DB_ALLOW_REF) -- the same pre-existing, environment-gated failure already confirmed unrelated to this SD in the prior REGRESSION PASS (cd7d74d7). No new failing test files and no new failing test cases appeared versus that prior baseline.",
  },
  {
    id: 'module-loads-cleanly-under-plain-node-not-just-vitest',
    severity: 'INFO',
    summary: "Ran `node -e \"import('./lib/eva/stage-execution-worker.js').then(()=>console.log('OK')).catch(e=>{console.error(e.message);process.exit(1)})\"` directly (bypassing vitest's module graph/mocking entirely) -- printed 'OK' with exit code 0, confirming the module's import graph (including its dynamic imports of artifact-persistence-service.js, chairman-decision-watcher.js, health-score-computer.js referenced elsewhere in the same function) has no syntax error or top-level throw introduced by this commit.",
  },
];

const warnings = [];

const recommendations = [
  "No corrective action required for backward compatibility. Note (informational, out of scope for this REGRESSION recheck): line 899's pre_exec_skip call site (the non-blocking-gate branch, distinct from line 1194's blocking-gate pre_exec_skip branch) was not tagged with chairmanGateSource by this fix and was not in VALIDATION's named list of 3 -- if that omission is intentional (non-blocking stages may not warrant a chairman_adjudicated ledger row), no action is needed; if not, that is a completeness question for VALIDATION/PLAN, not a backward-compatibility regression, since this commit did not touch that call site at all.",
];

const summary = `REGRESSION re-check of SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 fix commit ${FIX_COMMIT}, which closed VALIDATION FAIL (evidence ${VALIDATION_FAIL_EVIDENCE_ID}) by adding an explicit chairmanGateSource context parameter to _advanceStage() and threading 'chairman_decision' through 3 previously-uninstrumented call sites (pre_exec_skip_trigger, pre_exec_skip, re_entry). Confirmed via direct diff that the signature change is a pure additive destructure default (chairmanGateSource = null) and the guard-condition change is a pure boolean-OR addition whose new disjunct is provably false (null !== 'chairman_decision') for every one of the 4 call sites that omit the key -- behaviorally identical to pre-fix code, not merely likely-identical. Re-enumerated all 7 call sites and confirmed the 4 untouched ones (899, 1002, 1517, 1882) are byte-identical to the pre-fix commit. Confirmed no other file or test in the repo constructs a context object that could collide with the new key, and that the similarly-named standalone advanceStage() function in artifact-persistence-service.js is a wholly separate function/module/signature. Independently re-ran the full tests/unit/eva/ suite fresh (569/570 files, 7406/7440 tests -- exact match to the fix commit's stated baseline, only the same pre-existing DB-tier-gated failure). Confirmed the module loads cleanly under plain node (not just vitest's mocked module graph).`;

const justification = "Backward compatibility was proven by direct diff inspection of the exact two lines this commit changed (the destructure and the guard), not by re-running the same tests and inferring compatibility from green results alone -- the boolean-OR argument holds independent of test coverage. All 7 call sites were re-enumerated from the current file (not assumed from the prior PASS's line numbers, which had already shifted since the prior evidence was written pre-fix) and the 4 untouched ones were diffed against the pre-fix commit to rule out any incidental collateral edit. The collision check for the new key was a repo-wide grep, not a sample. Test execution was performed fresh in this session against the current worktree HEAD, and the resulting counts were compared numerically against the fix commit's own stated claim rather than trusted at face value. The plain-node load check exercises the real import graph outside vitest's mock/transform pipeline, which the prior PASS's evidence did not include for this specific file.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 96,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_VERIFICATION',
      prior_regression_evidence_id: PRIOR_REGRESSION_EVIDENCE_ID,
      validation_fail_evidence_id: VALIDATION_FAIL_EVIDENCE_ID,
      fix_commit_reviewed: FIX_COMMIT,
      advanceStage_call_sites: {
        total: 7,
        lines: [899, 1002, 1090, 1194, 1256, 1517, 1882],
        newly_tagged_chairmanGateSource: [1090, 1194, 1256],
        untouched_no_chairmanGateSource: [899, 1002, 1517, 1882],
      },
      test_suite_results: {
        full_eva_directory: '569 files passed / 1 failed (pre-existing, DB_TIER_BLOCKED, unrelated) / 6 skipped (576 total); 7406 tests passed / 34 skipped (7440 total) -- matches commit message baseline exactly',
      },
      plain_node_module_load: 'PASS -- import(\'./lib/eva/stage-execution-worker.js\') resolves cleanly, prints OK, exit 0',
    },
    phase: 'PLAN_VERIFICATION',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'REGRESSION',
    SD_ID,
    { name: 'Regression Validator Sub-Agent' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
