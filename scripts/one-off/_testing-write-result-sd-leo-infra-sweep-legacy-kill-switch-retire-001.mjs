#!/usr/bin/env node
/**
 * Write TESTING sub-agent EXEC-phase verdict for
 * SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001
 * (SWEEP legacy kill-switch: machine-readable retirement record +
 *  CI parity test pinning the three duplicated legacy twins to their pass modules)
 * ahead of its EXEC-TO-PLAN handoff.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + the canonical storage path
 * (lib/sub-agent-executor/results-storage.js storeSubAgentResults) rather than a
 * hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '18343fb6-b637-466b-8c8c-e5eef0fa69da';
const SD_KEY = 'SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001';

const findings = [
  {
    id: 'F1-target-suite-green',
    severity: 'INFO',
    summary: 'npx vitest run over the new parity test plus the 5 pre-existing sweep-related suites (tests/ci/sweep-legacy-twin-parity.test.js, tests/unit/lib/sweep/pass-registry.test.js, tests/unit/scripts/stale-session-sweep-claim-safety.test.js, tests/unit/scripts/sweep-residuals.test.js, tests/unit/stale-sweep-qf211-claim-guards.test.js, tests/unit/stale-sweep-qf162-release-announce.test.js) -> 6 files / 77 tests pass, 405ms. Zero regressions across the sweep surface the SD touches.'
  },
  {
    id: 'F2-new-test-covers-what-it-claims',
    severity: 'INFO',
    summary: 'Read tests/ci/sweep-legacy-twin-parity.test.js (234 lines) and independently verified it covers all three twins (TS-1 intent-collision, TS-2 dead-letter, TS-3 coordination-detectors) plus the TS-5 SWEEP_PASS_REGISTRY_RETIREMENT shape check. Each describe compares the legacy-fallback.cjs function against its lib/sweep/passes/*.cjs counterpart over IDENTICAL fixture inputs: TS-1 asserts warnings + collisionsDetected arrays deep-equal; TS-2 asserts actions + supabase update() call log deep-equal given a shared fixed instant; TS-3 asserts the same 5 underlying functions are each invoked once with the same supabase arg. TS-5 asserts owner/condition/retirement_action are all non-empty strings.'
  },
  {
    id: 'F3-cjs-mock-strategy-correct',
    severity: 'INFO',
    summary: 'Verified the test correctly exploits the Node CJS require cache instead of vi.mock(): legacy-fallback.cjs requires ../../scripts/stale-session-sweep.cjs, ../coordinator/signal-router.cjs, ../coordinator/coordination-events.cjs; the pass modules require the SAME files (../../../scripts/... and ../../coordinator/...) which resolve to the same cache entries, so monkey-patching sweepModule.loadRecentIntents/detectCrossSessionCollisions, signalRouterModule.aggregateSignals, and coordEventsModule.* on the shared module.exports objects is visible to BOTH twins. The require-time-cached DECONFLICTION_ENABLED const (read from process.env.CROSS_SESSION_DECONFLICTION in both intent twins) is correctly set to true at the very top of the file BEFORE any require, which is required for the intent-collision path to execute at all.'
  },
  {
    id: 'F4-mutation-proves-nontautological',
    severity: 'INFO',
    summary: 'MUTATION-VERIFY on a twin independent from the dead-letter one already checked by the requester: edited runIntentCollisionLegacy in lib/sweep/legacy-fallback.cjs, changing the warning-line format string from " — collides with live session " to " — MUTATION-collides with live session ". Re-ran tests/ci/sweep-legacy-twin-parity.test.js -> TS-1 "legacy and pass produce identical warnings" FAILED at line 79 (expect(passCtx.warnings).toEqual(legacyCtx.warnings)), the vitest diff naming the exact diverging pair (legacy side carries MUTATION-collides, pass side carries collides). Reverted via sed; grep for the marker returns 0; re-ran the parity file -> 9/9 pass green again. This proves the intent-collision parity assertion is load-bearing, not tautological (independent of the dead-letter actions.push mutation the requester had already verified).'
  },
  {
    id: 'F5-eslint-clean',
    severity: 'INFO',
    summary: 'npx eslint scripts/stale-session-sweep.cjs lib/sweep/legacy-fallback.cjs tests/ci/sweep-legacy-twin-parity.test.js -> exit 0, no errors.'
  },
  {
    id: 'F6-diff-scope-clean',
    severity: 'INFO',
    summary: 'git diff --stat covers exactly the two expected tracked files (scripts/stale-session-sweep.cjs +34, lib/sweep/legacy-fallback.cjs +13/-2) and the new test file is untracked (?? tests/ci/sweep-legacy-twin-parity.test.js). No stray changes. Verified in scripts/stale-session-sweep.cjs: SWEEP_PASS_REGISTRY_RETIREMENT const (owner/condition/retirement_action) declared next to SWEEP_PASS_REGISTRY_ENABLED and exported via module.exports; 3 exemption comments at the shared-function-delegation call sites (clearStaleQfClaims, splitCollidingSessions, runClaimBoundaryProbe) explaining why no parity test applies (both branches call the SAME function, cannot diverge); legacy-fallback.cjs header updated to point at the retirement record.'
  }
];

const warnings = [];

const recommendations = [
  'Allow EXEC-TO-PLAN handoff to proceed: no runtime-logic change (metadata retirement record + CI-only parity test + exemption comments); target and pre-existing suites green, parity assertion proven load-bearing by mutation, eslint clean, diff scope clean.',
  'No E2E coverage required: this SD adds no UI/route/worker runtime behavior — it is a CI test + a machine-readable metadata record. The parity guarantee it provides is itself the test.',
  'PLAN verification: re-run tests/ci/sweep-legacy-twin-parity.test.js and confirm the SWEEP_PASS_REGISTRY_RETIREMENT record still exports owner/condition/retirement_action (TS-5).'
];

const summary = 'PASS (confidence 96). SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 verified. Target + pre-existing sweep suites: 6 files / 77 tests pass, zero regressions. The new tests/ci/sweep-legacy-twin-parity.test.js genuinely pins all three duplicated legacy twins (intent-collision, dead-letter, coordination-detectors) to their lib/sweep/passes/*.cjs counterparts over identical fixture inputs, plus a TS-5 shape check on the SWEEP_PASS_REGISTRY_RETIREMENT record. Its CJS require-cache mock strategy is correct (shared module.exports objects patched, DECONFLICTION_ENABLED env set before first require). Independently mutation-verified the intent-collision twin (changed runIntentCollisionLegacy warning-line text): the TS-1 parity assertion FAILED at line 79 and named the diverging pair, then reverted clean and re-ran green (9/9) with a clean git diff on that file — proving the assertion is load-bearing, not tautological, and independent of the dead-letter mutation the requester had already checked. ESLint clean (exit 0). git diff --stat scoped to exactly scripts/stale-session-sweep.cjs + lib/sweep/legacy-fallback.cjs with the test file untracked; no stray changes. No runtime behavior change — metadata record + CI-only test + comments.';

const justification = [
  'PASS (confidence 96) - SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 EXEC-phase test evidence is sufficient for EXEC-TO-PLAN handoff.',
  '',
  'EVIDENCE:',
  '1. Suite run: npx vitest run over the 6 requested files -> 6 files / 77 tests pass, 405ms. Zero regressions.',
  '2. Test-coverage audit: the new parity test compares each legacy-fallback twin against its pass-module counterpart over identical fixtures (TS-1 warnings+collisions deep-equal; TS-2 actions+update()-call-log deep-equal at a shared fixed instant; TS-3 same 5 underlying fns each called once with same supabase arg) plus TS-5 retirement-record shape. It correctly mocks the shared CJS require-cache modules (sweepModule.loadRecentIntents/detectCrossSessionCollisions, signalRouterModule.aggregateSignals, coordEventsModule.*) rather than vi.mock, and sets CROSS_SESSION_DECONFLICTION=true before the first require so the require-time-cached DECONFLICTION_ENABLED const is true in both intent twins.',
  '3. Non-tautology proof (mutation, intent-collision twin): changed runIntentCollisionLegacy warning-line text " — collides..." -> " — MUTATION-collides..." -> TS-1 assertion FAILED at line 79 naming the diverging legacy/pass pair; reverted via sed (grep marker = 0), re-ran parity file -> 9/9 green. Independent of the dead-letter actions.push mutation the requester had already verified.',
  '4. ESLint: scripts/stale-session-sweep.cjs, lib/sweep/legacy-fallback.cjs, tests/ci/sweep-legacy-twin-parity.test.js -> exit 0.',
  '5. Diff scope: git diff --stat = exactly scripts/stale-session-sweep.cjs (+34) and lib/sweep/legacy-fallback.cjs (+13/-2); test file untracked. SWEEP_PASS_REGISTRY_RETIREMENT const sits beside SWEEP_PASS_REGISTRY_ENABLED and is exported; 3 exemption comments at the delegating call sites; legacy header updated.',
  '',
  'RATIONALE FOR PASS:',
  'This SD makes no production-logic change (metadata retirement record + CI-only parity test + exemption comments). The parity test is the deliverable and it is verified to (a) test all three twins for real behavioral equality, (b) mock the shared CJS module cache correctly, and (c) be load-bearing (a real one-sided edit to a twin fails CI and names it). No blocking gaps found. E2E not applicable (no UI/route/worker runtime surface).'
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
    verdict: 'PASS',
    confidence: 96,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      test_files: [
        'tests/ci/sweep-legacy-twin-parity.test.js',
        'tests/unit/lib/sweep/pass-registry.test.js',
        'tests/unit/scripts/stale-session-sweep-claim-safety.test.js',
        'tests/unit/scripts/sweep-residuals.test.js',
        'tests/unit/stale-sweep-qf211-claim-guards.test.js',
        'tests/unit/stale-sweep-qf162-release-announce.test.js',
      ],
      suite_files: 6,
      suite_tests_total: 77,
      suite_tests_passed: 77,
      suite_tests_failed: 0,
      parity_test_scenarios: {
        'TS-1': 'intent-collision-detection: legacy runIntentCollisionLegacy vs intent-collision-detection.cjs run -> warnings + collisionsDetected deep-equal (plus error-path no-op parity). VERIFIED',
        'TS-2': 'dead-letter-planning: legacy runDeadLetterLegacy(nowMs) vs dead-letter-planning.cjs run(ctx.now) at a shared fixed instant -> actions + supabase update() call log deep-equal. VERIFIED',
        'TS-3': 'coordination-detectors: legacy runCoordinationDetectorsLegacy vs coordination-detectors.cjs run -> same 5 underlying fns each called once with same supabase arg. VERIFIED',
        'TS-5': 'SWEEP_PASS_REGISTRY_RETIREMENT exported with non-empty owner/condition/retirement_action strings. VERIFIED',
      },
      mutation_verified_twin: 'intent-collision (runIntentCollisionLegacy warning-line text) — independent from the dead-letter twin the requester pre-verified',
      non_tautology_check: 'mutation: " — collides..." -> " — MUTATION-collides..." made TS-1 assertion FAIL at line 79 naming the legacy/pass pair; reverted clean (grep marker=0), parity file re-ran 9/9 green',
      eslint_status: 'exit 0, no errors (scripts/stale-session-sweep.cjs, lib/sweep/legacy-fallback.cjs, tests/ci/sweep-legacy-twin-parity.test.js)',
      diff_scope: 'scripts/stale-session-sweep.cjs (+34), lib/sweep/legacy-fallback.cjs (+13/-2) tracked; tests/ci/sweep-legacy-twin-parity.test.js untracked; no stray changes',
      cjs_mock_strategy: 'require-cache shared module.exports patched (no vi.mock); CROSS_SESSION_DECONFLICTION=true set before first require to satisfy require-time-cached DECONFLICTION_ENABLED',
      runtime_behavior_change: false,
      change_class: 'metadata (retirement record) + CI-only parity test + exemption comments',
      e2e_applicable: false,
      e2e_exemption_reason: 'no UI/route/worker runtime surface; the SD adds a CI test and a machine-readable metadata record — the parity test IS the deliverable',
      model: 'Opus 4.8',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        target_suite: '77/77 pass across 6 files',
        parity_test_audit: 'all 3 twins + TS-5 retirement-record shape covered; CJS require-cache mocks correct',
        mutation_non_tautology: 'intent-collision twin mutated -> TS-1 FAIL naming pair; clean revert -> 9/9 green',
        eslint: 'exit 0',
        diff_scope: 'exactly 2 tracked files + 1 untracked test; retirement const + 3 exemption comments verified in source',
      },
    },
    phase: 'EXEC',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
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
