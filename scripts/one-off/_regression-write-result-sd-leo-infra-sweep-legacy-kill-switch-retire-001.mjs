#!/usr/bin/env node
/**
 * REGRESSION sub-agent PLAN_VERIFICATION verdict for
 * SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001.
 * Canonical repo-evidence pattern (applySubAgentRepoVerdict) + storeSubAgentResults.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '18343fb6-b637-466b-8c8c-e5eef0fa69da';
const SD_KEY = 'SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001';

const findings = [
  {
    id: 'F1-diff-additive-only',
    severity: 'INFO',
    summary: 'git diff of scripts/stale-session-sweep.cjs reviewed line-by-line. The ONLY non-comment change is a NET-NEW `const SWEEP_PASS_REGISTRY_RETIREMENT = {...}` object literal (lines ~382-392, immediately below the pre-existing SWEEP_PASS_REGISTRY_ENABLED flag) plus a NET-NEW `module.exports.SWEEP_PASS_REGISTRY_RETIREMENT = ...` at the end. Everything else in the diff is comment-only: 3 inline comment blocks added ABOVE existing `if (SWEEP_PASS_REGISTRY_ENABLED) {...} else {...}` call sites (EARLY_PASSES/clearStaleQfClaims, identity-collision-split/splitCollidingSessions, MAIN_PASSES[1]/runClaimBoundaryProbe). ZERO existing lines were deleted; ZERO if/else branch bodies were altered. Control flow is byte-for-byte identical except for the additive const/export.',
  },
  {
    id: 'F2-legacy-fallback-comment-only-exports-intact',
    severity: 'INFO',
    summary: 'git diff of lib/sweep/legacy-fallback.cjs is a header-comment-only change (a prose "if ever removed post-rollout" note replaced by a RETIREMENT cross-reference block). Verified the file still exports the SAME three function names: `module.exports = { runIntentCollisionLegacy, runDeadLetterLegacy, runCoordinationDetectorsLegacy }` — identical at HEAD (line 121) and post-change (line 130). No require() list changed; no executable line touched. The three legacy twins remain pinned to their lib/sweep/passes/*.cjs counterparts by the new tests/ci/sweep-legacy-twin-parity.test.js.',
  },
  {
    id: 'F3-exports-superset-no-removal',
    severity: 'INFO',
    summary: 'module.exports contract of scripts/stale-session-sweep.cjs is a strict SUPERSET: `git diff | grep module.exports` shows exactly ONE +line (`module.exports.SWEEP_PASS_REGISTRY_RETIREMENT = SWEEP_PASS_REGISTRY_RETIREMENT;`) and ZERO -lines. Every previously-exported function name (splitCollidingSessions, dispatchWorkAssignmentsIfAllowed, and all others) is unchanged. No existing consumer that destructures this module can break — only a new key is added.',
  },
  {
    id: 'F4-require-time-safety-const-is-static-literal',
    severity: 'INFO',
    summary: 'Require-time safety confirmed. Contrary to the brief\'s framing, SWEEP_PASS_REGISTRY_RETIREMENT does NOT read process.env at all — it is a PURE STATIC OBJECT LITERAL of three string fields (owner/condition/retirement_action, all constant string-concatenations). It performs no require(), no env read, no function call, no I/O. It is declared AFTER both require() calls (pass-registry.cjs line 372, legacy-fallback.cjs line 373), so it cannot affect require-graph ordering. It is therefore strictly SAFER than the adjacent SWEEP_PASS_REGISTRY_ENABLED (which does read process.env). The documented CIRCULAR-REQUIRE NOTE (lines 361-371) concerns destructured require of pass-registry.cjs mid-load; the new const touches the require graph zero times and is fully orthogonal to that hazard. No new require-time side effect, circular-require risk, or ordering hazard introduced.',
  },
  {
    id: 'F5-full-corpus-green-zero-regressions',
    severity: 'INFO',
    summary: 'Ran the broadest realistic regression sweep for this file: the full existing stale-session-sweep.cjs unit corpus (18 files across tests/unit/scripts, tests/unit, tests/unit/sweep, tests/unit/lib/sweep) PLUS the new tests/ci/sweep-legacy-twin-parity.test.js. Result: 19 test files passed, 143/143 tests passed, 0 failed, 635ms. Since the production control flow is byte-identical (additive const/export + comments only), the current green state is by construction consistent with what these tests asserted before this SD — there is no code path whose behavior could have changed for a test to observe. New twin-parity test passes, confirming the three legacy twins are in parity with their registry-path counterparts.',
  },
];

const warnings = [];

const recommendations = [
  'Allow PLAN_VERIFICATION to proceed: this is a genuinely additive, backward-compatible change to the fleet\'s most incident-prone script. Production control flow in scripts/stale-session-sweep.cjs is unchanged (byte-identical if/else bodies); the only functional additions are a metadata-only static const and its export, neither of which is read at runtime. Full test corpus (143 tests) green with zero regressions.',
  'No follow-up required. The new SWEEP_PASS_REGISTRY_RETIREMENT record + tests/ci/sweep-legacy-twin-parity.test.js make the kill-switch retirement checkable rather than permanent-by-default, which is the SD\'s intent.',
];

const summary = 'PASS (confidence 95). No regression risk from SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001. Independently confirmed the claim holds: (1) git diff of scripts/stale-session-sweep.cjs reviewed line-by-line — the ONLY non-comment changes are a NET-NEW static object-literal const (SWEEP_PASS_REGISTRY_RETIREMENT) and its NET-NEW module.exports line; all 3 other hunks are inline comments added above pre-existing `if (SWEEP_PASS_REGISTRY_ENABLED)` call sites, with zero deletions and zero branch-body edits (control flow byte-identical). (2) lib/sweep/legacy-fallback.cjs change is header-comment-only and still exports the identical 3 function names (runIntentCollisionLegacy, runDeadLetterLegacy, runCoordinationDetectorsLegacy — HEAD:121 vs now:130). (3) module.exports is a strict superset: exactly one +line (SWEEP_PASS_REGISTRY_RETIREMENT), zero -lines, so no existing export was removed/renamed. (4) Require-time safety: the new const reads NO process.env (it is a pure static string-literal object, unlike the brief\'s framing), makes no require()/call/IO, sits after both require() calls, and is fully orthogonal to the documented CIRCULAR-REQUIRE NOTE (lines 361-371) — zero new side effect / circular-require / ordering hazard, strictly safer than the adjacent env-reading flag. (5) Broadest regression sweep (18 existing corpus files + the new tests/ci/sweep-legacy-twin-parity.test.js) = 19 files / 143 tests / 100% pass / 0 regressions; green state is consistent-by-construction with pre-SD assertions since no observable code path changed. NOT rubber-stamped: I looked specifically for a hidden env/require dependency in the new const and for any altered branch body — found none; residual regression risk is effectively nil.';

const justification = [
  'PASS (confidence 95) — SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 is additive and backward-compatible; PLAN_VERIFICATION regression check clean with no findings above INFO.',
  '',
  'DIFF REVIEW (scripts/stale-session-sweep.cjs) — line-by-line:',
  'Non-comment changes = (a) NET-NEW `const SWEEP_PASS_REGISTRY_RETIREMENT = { owner, condition, retirement_action }` object literal at ~L382-392, directly below the untouched SWEEP_PASS_REGISTRY_ENABLED flag; (b) NET-NEW `module.exports.SWEEP_PASS_REGISTRY_RETIREMENT = ...` at EOF. All remaining hunks are inline comments added ABOVE 3 pre-existing `if (SWEEP_PASS_REGISTRY_ENABLED) {...} else {...}` sites. Zero lines deleted; zero if/else bodies changed. Control flow byte-identical apart from the additive const/export.',
  '',
  'LEGACY-FALLBACK (lib/sweep/legacy-fallback.cjs):',
  'Header-comment-only edit. Exports verified identical before/after: `module.exports = { runIntentCollisionLegacy, runDeadLetterLegacy, runCoordinationDetectorsLegacy }` (HEAD L121 == now L130). No require list or executable line touched.',
  '',
  'EXPORT CONTRACT:',
  'git diff | grep module.exports = exactly one +line (SWEEP_PASS_REGISTRY_RETIREMENT), zero -lines. Strict superset; no consumer destructure can break.',
  '',
  'REQUIRE-TIME SAFETY (explicitly interrogated, not assumed):',
  'The new const is a PURE STATIC OBJECT LITERAL — three constant string fields, NO process.env read (the brief\'s "references process.env" framing is inaccurate; the env read is the separate SWEEP_PASS_REGISTRY_ENABLED line above it), no require(), no call, no IO. It is declared after both require() statements (pass-registry.cjs, legacy-fallback.cjs) and touches the require graph zero times, so it is orthogonal to the documented CIRCULAR-REQUIRE NOTE (L361-371, which concerns destructured require of pass-registry.cjs mid-load). No new require-time side effect, circular-require risk, or ordering hazard; strictly safer than the adjacent env-reading flag.',
  '',
  'REGRESSION SWEEP:',
  '19 test files (18 existing stale-session-sweep.cjs corpus + new tests/ci/sweep-legacy-twin-parity.test.js) — 143/143 tests pass, 0 fail, 635ms. Because production control flow is byte-identical, the green state is consistent-by-construction with everything these tests asserted before this SD; there is no changed observable code path for a test to detect. New twin-parity test passes.',
  '',
  'RESIDUAL RISK: effectively nil. Specifically searched for a hidden env/require dependency in the new const and for any silently-altered branch body — neither exists. Not a rubber stamp.',
].join('\n');

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
    confidence: 95,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      target_source_file: 'scripts/stale-session-sweep.cjs',
      also_changed: ['lib/sweep/legacy-fallback.cjs (header comment only)', 'tests/ci/sweep-legacy-twin-parity.test.js (new)'],
      change_class: 'additive-only (metadata const + export + comments); zero production control-flow change',
      diff_verdict: 'no existing line deleted or logically altered; only additions',
      legacy_fallback_exports_before: ['runIntentCollisionLegacy', 'runDeadLetterLegacy', 'runCoordinationDetectorsLegacy'],
      legacy_fallback_exports_after: ['runIntentCollisionLegacy', 'runDeadLetterLegacy', 'runCoordinationDetectorsLegacy'],
      export_contract: 'strict superset — only +module.exports.SWEEP_PASS_REGISTRY_RETIREMENT, zero removals',
      require_time_safety: 'SAFE — new const is a pure static object literal (no process.env, no require, no call, no IO), declared after both require() calls; orthogonal to the documented CIRCULAR-REQUIRE NOTE (L361-371)',
      circular_require_note_line: 'scripts/stale-session-sweep.cjs:361-371',
      new_const_line_range: 'scripts/stale-session-sweep.cjs:382-392',
      regression_sweep: '19 files / 143 tests / 100% pass / 0 regressions (npx vitest run)',
      test_files_run: 18,
      new_test_file: 'tests/ci/sweep-legacy-twin-parity.test.js (passes)',
      regression_verdict: 'PASS — additive/backward-compatible; residual risk effectively nil',
      rubber_stamp: false,
      model: 'Opus 4.8 (1M context)',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        diff_line_by_line: 'scripts/stale-session-sweep.cjs — additive const+export + 3 inline comments; no deletions, no branch-body edits',
        legacy_fallback_diff: 'header comment only; 3 exported function names identical before/after',
        export_grep: 'git diff | grep module.exports — one +line, zero -lines',
        require_time_analysis: 'new const = static object literal, no env/require/call/IO, after both requires; orthogonal to CIRCULAR-REQUIRE NOTE',
        full_corpus_run: '19 files / 143 tests all pass',
      },
    },
    phase: 'PLAN_VERIFICATION',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'REGRESSION',
    SD_ID,
    { name: 'Regression Validation Specialist (regression-agent)' },
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

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
