#!/usr/bin/env node
/**
 * One-off: REGRESSION sub-agent backward-compatibility review for
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001, PLAN_VERIFICATION phase.
 *
 * Commits under review: 313884be1aba9617e82e78ba08dd345e356b704b (10 files, +929/-14) and
 * 7bf552b9fdcbad1488e1877f8fb571259bc6ffa8 (1 file, +146, TESTING evidence script — no
 * production code). This SD modified two PRE-EXISTING, load-bearing files in the
 * venture-lifecycle daemon: lib/eva/stage-execution-worker.js (5 new `source` return-path
 * fields on _handleChairmanGate(), one call-site tag assignment, one new recordGateAttempt()
 * call inside _advanceStage()) and lib/eva/artifact-persistence-service.js (comment-only
 * correction). Scope: prove backward compatibility independently of TESTING/SECURITY/VALIDATION.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'c0d3fcc7-dfd8-4c00-a9e9-1ec49fe48f7f';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';

const findings = [
  {
    id: 'single-production-caller-of-handleChairmanGate-confirmed',
    severity: 'INFO',
    summary: "Repo-wide grep for `_handleChairmanGate` across lib/ and tests/ (excluding comments) confirms exactly ONE production call site (stage-execution-worker.js:1401). All other non-test matches are code comments referencing the method by name, not calls. No other module invokes it, so the new `source` field on 5 of its ~11 return paths has exactly one production consumer to check for shape sensitivity.",
  },
  {
    id: 'no-strict-shape-equality-broken-at-the-production-call-site',
    severity: 'INFO',
    summary: "The production call site (stage-execution-worker.js:1401-1432) destructures nothing off the return value except `gateResult.source` (read, not destructured) and `gateResult.approved`/`.blocked`/`.killed` via plain property access elsewhere in the surrounding branch. No `toEqual`, `JSON.stringify`, `Object.keys().length`, or spread-based equality check exists against `_handleChairmanGate()`'s return object at this call site. A new key cannot break plain property access.",
  },
  {
    id: 'test-file-shape-assertions-inventoried-and-verified-consistent',
    severity: 'INFO',
    summary: "Grepped every test file under tests/unit/eva/ for `toEqual` combined with `approved`/`blocked.*killed`/`gateResult`/`chairmanGate`. Exactly 4 files assert the exact return shape of _handleChairmanGate(): stage-execution-worker-chairman-gate-source.test.js (NEW, 5 assertions, all include `source`), stage-execution-worker-fixture-venture-gate.test.js (updated in 313884be1ab, 1 toEqual assertion now includes `source: 'fixture_venture_skip'`), stage-execution-worker-high-consequence-mint.test.js (updated in 313884be1ab, 1 toEqual assertion now includes `source: 'autonomy_auto_approve'`). A second test in stage-execution-worker-fixture-venture-gate.test.js ('does NOT auto-approve...') asserts only `result.approved === false` via plain property access — unaffected by the new field by construction. stage-execution-worker.test.js references _handleChairmanGate only in comments and asserts on `result.status`/`result.gate` (different object, the outer processOneStage() result), never on the gate's own return shape. No other test file in the repo constructs or asserts against this method's return shape.",
  },
  {
    id: 'chairmanGateSource-field-has-zero-collision-risk-on-shared-result-object',
    severity: 'INFO',
    summary: "Grepped every reader/writer of `_chairmanGateSource` and `_gateApproved` repo-wide. `_gateApproved` (the pre-existing sibling field) is read by stage-work-sync.js:100 (`!result._gateApproved`) and stage-execution-worker.js:1465/3277-adjacent logic; `_chairmanGateSource` is written at exactly one line (stage-execution-worker.js:1432) and read at exactly one line (stage-execution-worker.js:3277) — both inside stage-execution-worker.js itself. stage-work-sync.js's JSDoc for its own `result` parameter shape does not mention `_chairmanGateSource` and its function body never reads it, so the new field passes through inertly wherever `result` is later handed to stage-work-sync (no destructuring there either — it uses `result._gateApproved` via bracket-free property access, same pattern, no collision). A structurally similar but ENTIRELY SEPARATE `_gateApproved` field exists in stage-execution-engine.js:712 (`output?.chairmanGate?.status === 'approved'`) — confirmed this is a different file, different object, different code path (stage-execution-engine.js, not stage-execution-worker.js; not touched by this SD; does not call _handleChairmanGate at all).",
  },
  {
    id: 'advanceStage-call-sites-inventoried-new-field-is-null-safe-at-4-of-7',
    severity: 'INFO',
    summary: "_advanceStage() is called from 7 sites (lines 899, 1002, 1086, 1187, 1245, 1506, 1871). Only 3 (1245 're_entry', 1506 'governance_override', 1871 'normal') pass `result` in their context object; the other 4 (899, 1002, 1086, 1187 — all pre_exec_skip/pre_exec_skip_trigger/auto_approved shortcuts) pass no `result` key at all. _advanceStage()'s destructure `const { result = null, ... } = context` (line 2836) defaults to null for those 4, and the new guard `result?._chairmanGateSource === 'chairman_decision'` optional-chains safely to `undefined === 'chairman_decision'` (false) — no throw, no crash, recordGateAttempt() correctly skipped for all 4 call sites that never went through _handleChairmanGate() in that iteration.",
  },
  {
    id: 'new-advanceStage-block-is-pure-additive-side-effect-verified-by-direct-read',
    severity: 'INFO',
    summary: "Read _advanceStage() in full (lines 2835-3430+) around the new block (3266-3291). The new `if (result?._chairmanGateSource === 'chairman_decision') { try {...} catch (err) {...} }` block: (a) declares no variable used outside its own block scope (recordGateAttempt is destructured from a block-scoped dynamic import binding); (b) contains no `return` statement — control flow falls through unconditionally to 'Side-effect 2' immediately after; (c) its catch clause only calls `this._logger.warn(...)`, never re-throws or mutates any outer-scope variable (`now`, `healthScore`, `existingStartedAt`, `toStage`, `fromStage`, `ventureId`, `advancementType` are all untouched by this block). All 7 existing callers read only `advanceResult.blocked`/`.advanced`/`.reason` after each call (confirmed via stage-execution-worker-path-integrity-gate.test.js:146, `expect(Object.keys(result).sort()).toEqual(['advanced', 'blocked', 'reason'])`, which passed unmodified) — none of those fields originate from or are affected by the new block. Exception behavior for all 7 callers is unchanged: the new block can only ever complete normally or log-and-swallow, never propagate.",
  },
  {
    id: 'comment-only-change-in-artifact-persistence-service-confirmed-via-diff',
    severity: 'INFO',
    summary: "`git show 313884be1ab -- lib/eva/artifact-persistence-service.js` shows the entire hunk is a block-comment rewrite immediately above `function describeGateAttemptError(error)` (correcting a stale 'migration not yet applied' claim to reflect a live-verified 2026-08-24 RPC probe). The function body itself (both the `if (error?.code === 'PGRST202')` branch and the fallback `return error?.message`) is byte-identical before and after — zero functional lines changed, confirmed by direct diff inspection, not by trusting the commit message.",
  },
  {
    id: 'full-touched-area-and-adjacent-suites-pass-independently-executed',
    severity: 'INFO',
    summary: "Independently ran (not reusing TESTING's cached numbers): `npx vitest run tests/unit/eva/` → 569 test files, 1 failed / 7401 passed / 34 skipped. The 1 failure (path-integrity-flags-live-defaults.db.test.js) is byte-identical to origin/main (diffed directly: `git show origin/main:<path>` vs the worktree copy — IDENTICAL) and fails on a DB_TIER_BLOCKED environment gate (no live non-production Supabase target configured), unrelated to chairman gates. Additionally ran 16 more test files outside tests/unit/eva/ that reference stage-execution-worker.js or artifact-persistence-service.js by name (tests/unit/audit/venture-capture-table-audit.test.js, tests/unit/chairman/all-paths-producers.test.js, tests/unit/handoff/wire-check-gate.test.js, tests/unit/lifecycle-sd-bridge/architectureLayer-signal.test.js, tests/unit/stage-15-template.test.js, tests/unit/stage-17/*, tests/unit/validation/hallucination-check.test.js, tests/unit/venture-ceo-task-completion-artifact-check.test.js, tests/unit/eva-phantom-column-alignment.test.js, tests/venture-artifact-storm.test.js, tests/venture-gate-binding.test.js, tests/eva/s15-design-studio-reliability.test.js) — all 16 files pass (210 passed, 4 pre-existing skips). Confirmed `git diff --stat <merge-base>..HEAD` touches EXACTLY the 11 files already declared in the two commits (1 PRD json, 2 lib files, 4 one-off .mjs evidence/execution scripts, 4 test files) — no silent collateral edits anywhere else in the tree.",
  },
];

const warnings = [];

const recommendations = [
  "No corrective action required. The two production-code changes (source-tagging + one new non-fatal ledger write) are additive-only at every call site checked, and the comment-only change in artifact-persistence-service.js carries zero functional risk.",
];

const summary = "REGRESSION review of SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 (commits 313884be1ab + 7bf552b9fdc) at PLAN_VERIFICATION, independent of TESTING/SECURITY/VALIDATION's prior evidence. Confirmed exactly ONE production caller of _handleChairmanGate() (stage-execution-worker.js:1401) uses plain property access, never a strict/deep equality check, so the new `source` field on 5 of its return paths cannot break it. Inventoried every test file asserting the method's exact shape via toEqual (4 files: 1 new, 2 already updated in-commit, 1 unaffected by construction) and confirmed no other test file in the repo constructs or asserts against this shape. Traced `_chairmanGateSource` and its sibling `_gateApproved` field to their actual readers/writers repo-wide and found zero collision — a structurally similar but entirely separate field of the same name in stage-execution-engine.js belongs to a different file/object/code path never touched by this SD. Verified all 7 _advanceStage() call sites: 4 pass no `result` context and safely no-op via optional chaining, 3 pass `result` and are correctly gated. Read the new _advanceStage() block directly and confirmed it is pure additive side effect — no return statement, no outer-variable mutation, non-fatal catch that only logs. Confirmed the artifact-persistence-service.js change is comment-only via direct diff (function body byte-identical). Independently re-ran the full tests/unit/eva/ suite (7401 passed, 1 pre-existing unrelated DB-tier-gated failure identical to origin/main, 34 skipped) plus 16 additional test files elsewhere in the repo that reference either touched file by name (210 passed). Confirmed the branch's total file footprint against its merge-base matches exactly the 11 files declared across both commits — no untracked collateral changes.";

const justification = "Every backward-compatibility risk named in the assigned scope was checked by direct code/test reading and independent test execution, not by re-trusting TESTING's prior evidence. The single production call site of _handleChairmanGate() and all shape-asserting test files were enumerated exhaustively via repo-wide grep, not sampled. The `_chairmanGateSource`/`_gateApproved` collision check traced actual read/write sites rather than assuming isolation from the field's naming. The _advanceStage() additive-only claim was verified by reading the function's full body around the new block (control flow, scoping, catch behavior) rather than accepting the commit message's description. Test execution was performed fresh in this session (not reused from TESTING's cached counts) and cross-checked byte-for-byte against origin/main for the one failing suite to rule out this SD as the cause.";

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
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_VERIFICATION',
      commits_reviewed: ['313884be1aba9617e82e78ba08dd345e356b704b', '7bf552b9fdcbad1488e1877f8fb571259bc6ffa8'],
      production_caller_count_handleChairmanGate: 1,
      shape_asserting_test_files: [
        'tests/unit/eva/stage-execution-worker-chairman-gate-source.test.js',
        'tests/unit/eva/stage-execution-worker-fixture-venture-gate.test.js',
        'tests/unit/eva/stage-execution-worker-high-consequence-mint.test.js',
      ],
      advanceStage_call_sites: {
        total: 7,
        lines: [899, 1002, 1086, 1187, 1245, 1506, 1871],
        pass_result_context: [1245, 1506, 1871],
        no_result_context_null_safe: [899, 1002, 1086, 1187],
      },
      test_suite_results: {
        full_eva_directory: '569 files, 1 failed (pre-existing, byte-identical to origin/main) / 7401 passed / 34 skipped',
        adjacent_files_outside_eva: '16 files, 210 passed, 4 pre-existing skipped',
        branch_diff_footprint_vs_merge_base: '11 files, matches both commits exactly, no collateral changes',
      },
      artifact_persistence_service_change: 'comment-only, function body byte-identical (verified via git show)',
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
