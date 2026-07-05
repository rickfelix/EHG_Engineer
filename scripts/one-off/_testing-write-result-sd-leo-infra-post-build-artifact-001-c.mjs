#!/usr/bin/env node
/**
 * Write TESTING sub-agent EXEC-phase verdict (retrospective mode) for
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C ("Adherence Rubric Scoring +
 * Convergence Loop") ahead of its EXEC-TO-PLAN handoff.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage path
 * (lib/sub-agent-executor/results-storage.js storeSubAgentResults) per
 * CLAUDE.md prologue rule 11 — no hand-rolled INSERT.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '18129ef6-5615-468e-b8da-d99f9833b213';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C';

const findings = [
  {
    id: 'F1-new-suites-all-pass',
    severity: 'INFO',
    summary: 'npx vitest run tests/unit/eva/adherence-scorer.test.js tests/unit/eva/convergence-loop.test.js -> 2 files, 28/28 pass, 1.28s. adherence-scorer: 12 tests (classifyDeviationReason x5, scoreDimension/scoreVerdictTable x5, DIMENSION_ARTIFACT_MAP coverage x1, buildDeviationLedger x1). convergence-loop: 16 tests (classifyGaps x1, backfillCompletenessGap x3, classifyRemediationTier x2, routeRemediation x3, buildEscalationPacket x3, runConvergenceLoop x4). Counts match the SD brief (12 + 16).'
  },
  {
    id: 'F2-sibling-regression-clean',
    severity: 'INFO',
    summary: "Re-ran the Child A/B sibling suites that share lib/eva/: tests/unit/eva/deviation-ledger.test.js, tests/unit/eva/post-build-verdict-engine.test.js, tests/unit/eva/rubric-generator.test.js -> 3 files, 51/51 pass, 749ms. Child C adds two new modules (adherence-scorer.js, convergence-loop.js) and consumes Child A/B exports read-only; no sibling test regressed."
  },
  {
    id: 'F3-eslint-clean',
    severity: 'INFO',
    summary: 'npx eslint on all four SD files (lib/eva/adherence-scorer.js, lib/eva/convergence-loop.js, and the two test files) exits 0 with no output — zero lint errors or warnings.'
  },
  {
    id: 'F4-reason-heuristic-genuinely-exercised',
    severity: 'INFO',
    summary: "classifyDeviationReason() tests are substantive, not tautological — they exercise each distinct branch of the heuristic (adherence-scorer.js:68-83): (a) SENSIBLE requires length>=15 AND a causal-marker regex hit AND wordCount>=6; (b) the 'because reasons' case is a deliberate word-count-floor probe — it is exactly 15 chars and DOES trip the causal-marker regex on 'because', so it can only be classified THIN via the SENSIBLE_MIN_WORDS=6 floor (2 words), directly testing that guard rather than the length floor; (c) the GENERIC_ONLY circular-phrase reject and (d) the long-but-non-causal 'fails toward THIN' case are both covered."
  },
  {
    id: 'F5-circularity-guard-genuinely-exercised',
    severity: 'INFO',
    summary: "backfillCompletenessGap() circularity guard (convergence-loop.js:80-89) is tested on all three paths: source:'build' result rejected with /circularity guard/, a genuinely-upstream source accepted and stamped retroactive=true/confidence=low, and a missing sourceFn rejected with /no default/. The guard rejects source==='build'||'repo' — the tests hit the 'build' rejection and a passing non-build source, confirming both sides of the branch."
  },
  {
    id: 'F6-cap-overflow-and-early-exit-genuinely-exercised',
    severity: 'INFO',
    summary: "routeRemediation() per-cycle cap (convergence-loop.js:141-143) verified with 7 gaps @ cap 5 -> routed=5, deferred=2, errors=0, createQuickFixFn called exactly 5x (overflow deferred, never silently dropped); a filing rejection is surfaced into deferred+errors, not swallowed. runConvergenceLoop() monotone-convergence early exit (TS-4) verified: with a stalled fix (mock remediation succeeds but the verdict table never changes), the deficit series is flat, isTrendingDown([D,D]) returns false (confirmed by reading lib/coordinator/convergence-ledger.js:35-43 — flat series returns false because xs[last] < xs[0] is false), so the loop breaks with cycles<3 and status ESCALATED before burning cycle 3."
  },
  {
    id: 'F7-minor-coverage-gaps-non-blocking',
    severity: 'LOW',
    summary: "Two non-blocking coverage gaps (not defects — the code is correct, just not directly asserted): (1) scoreDimension() mid-gradient scores are untested — only goodFraction===1 (=>5) and ===0 (=>1) are asserted; the 2/3/4 branches (adherence-scorer.js:158-160, including the undocumentedOrThin===0 && >=0.5 => 4 rule) have no direct test. (2) fileAdherenceFix() tier-3 path (createSdFn, convergence-loop.js:115-120) is never exercised — classifyRemediationTier() correctly returns 3 in its own unit test, but routeRemediation()/loop tests all use empty ledgers -> tier 2 -> createQuickFixFn, so the SD-filing branch is unrun. Recommend adding a tier-3 routing case and a mid-gradient scoreDimension case in a follow-up; neither blocks this handoff."
  },
  {
    id: 'F8-e2e-not-applicable',
    severity: 'INFO',
    summary: 'E2E/browser testing is not applicable to this SD. Child C is a pure backend/data-layer change: two new lib/eva/*.js modules with no UI, route, component, or HTTP surface. There is nothing for Playwright to navigate. This matches the CONDITIONAL_PASS + E2E-not-applicable shape used for the other backend-only children of this orchestrator (e.g. Child B). Unit coverage against the documented behaviors is the correct and sufficient verification tier here.'
  }
];

const warnings = [
  {
    severity: 'LOW',
    issue: 'scoreDimension() mid-gradient scores (2/3/4) have no direct unit assertion — only the 1 and 5 extremes are covered.',
    recommendation: 'Add a scoreDimension case with a mixed BUILT/DEVIATED fraction between 0 and 1 to lock in the 2/3/4 anchor mapping.'
  },
  {
    severity: 'LOW',
    issue: 'fileAdherenceFix() tier-3 (createSdFn) branch is unexercised — routeRemediation/loop tests only reach tier 2 via empty ledgers.',
    recommendation: 'Add a routeRemediation case with a critical-weight ledger entry so a tier-3 gap routes through createSdFn and returns filed:"sd".'
  }
];

const recommendations = [
  'Allow EXEC-TO-PLAN handoff to proceed — the dual new suites (28/28) and sibling regression (51/51) are clean, eslint is clean, and the four called-out behaviors (reason-quality heuristic, circularity guard, per-cycle cap/overflow, monotone early-exit) are each genuinely exercised, not tautological.',
  'PLAN verification: treat E2E as not-applicable for this backend-only child; no browser/UI surface exists.',
  'Follow-up (non-blocking): add a mid-gradient scoreDimension test and a tier-3 fileAdherenceFix/routeRemediation test to close the two identified coverage gaps.'
];

const summary = 'CONDITIONAL_PASS (confidence 90) — backend/data-layer-only SD, E2E not applicable by construction. New suites tests/unit/eva/adherence-scorer.test.js (12) + tests/unit/eva/convergence-loop.test.js (16) = 28/28 pass. Sibling Child A/B regression (deviation-ledger, post-build-verdict-engine, rubric-generator) 51/51 pass — zero regressions. eslint clean on all four files. Test QUALITY verified as substantive on every behavior the brief called out: the classifyDeviationReason word-count floor is probed by a case ("because reasons") that trips the causal-marker regex yet is correctly THIN on word count; the backfill circularity guard rejects build/repo-sourced results and the no-default-fn path; routeRemediation caps at 5 and defers overflow (never drops) and surfaces filing failures into deferred/errors; and runConvergenceLoop early-exits on a flat deficit series (isTrendingDown flat->false confirmed by source read) before exhausting cycles. Two NON-BLOCKING coverage gaps noted: scoreDimension mid-gradient (2/3/4) scores and the tier-3 createSdFn filing branch are correct but not directly asserted. CONDITIONAL rather than full PASS reflects the E2E-N/A shape plus those two minor gaps; neither blocks the handoff.';

const justification = `CONDITIONAL_PASS (confidence 90) — SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C EXEC-phase test evidence is sufficient for EXEC-TO-PLAN handoff. Retrospective validation from a fresh checkout of feat/${SD_KEY} @ 0dfd3c7575.

EVIDENCE:
1. New suites: npx vitest run tests/unit/eva/adherence-scorer.test.js tests/unit/eva/convergence-loop.test.js -> 2 files, 28/28 pass, 1.28s (12 + 16, matching the SD brief).
2. Regression: npx vitest run tests/unit/eva/deviation-ledger.test.js tests/unit/eva/post-build-verdict-engine.test.js tests/unit/eva/rubric-generator.test.js -> 3 files, 51/51 pass, 749ms. No sibling regression.
3. Lint: npx eslint lib/eva/adherence-scorer.js lib/eva/convergence-loop.js + both test files -> exit 0, no output.
4. Quality trace #1 (reason heuristic): the 'because reasons' test case is exactly 15 chars and trips the causal-marker regex on 'because', so it can ONLY be classified THIN via SENSIBLE_MIN_WORDS=6 (2 words) — a direct probe of the word-count floor, not a length-floor duplicate. SENSIBLE/generic/long-non-causal/empty branches all covered.
5. Quality trace #2 (circularity guard): backfillCompletenessGap rejects source:'build' (/circularity guard/), accepts a genuine upstream source (retroactive=true, confidence=low), and rejects a missing sourceFn (/no default/).
6. Quality trace #3 (cap/overflow): routeRemediation with 7 gaps @ cap 5 -> routed=5/deferred=2/errors=0, createQuickFixFn called 5x; a rejected filing goes to deferred+errors, never counted as success.
7. Quality trace #4 (monotone early-exit): runConvergenceLoop with a stalled fix (verdict table unchanged between rescores) yields a flat deficit series; isTrendingDown([D,D]) returns false (lib/coordinator/convergence-ledger.js:42 requires xs[last] < xs[0], false when flat), so the loop breaks at cycles<3 with status ESCALATED and a 3-disposition escalation packet.

E2E JUSTIFICATION (why CONDITIONAL_PASS is the correct shape, not a blocker):
This child ships two pure backend modules (lib/eva/adherence-scorer.js, lib/eva/convergence-loop.js) with zero UI/route/HTTP surface. There is no page for Playwright to drive; E2E is not-applicable by construction. Unit coverage against the documented behaviors is the correct verification tier, mirroring the accepted verdict shape for the other backend-only children of orchestrator SD-LEO-INFRA-POST-BUILD-ARTIFACT-001.

NON-BLOCKING GAPS:
(a) scoreDimension mid-gradient scores (2/3/4) are untested — only the 1 and 5 extremes are asserted. (b) fileAdherenceFix tier-3 createSdFn branch is unexercised (loop/route tests use empty ledgers -> tier 2). Both are correct-but-unasserted; recommended as a follow-up, not a handoff blocker.`;

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'E2E not applicable — backend/data-layer only, no UI surface (expected shape for this SD class).',
      'Two non-blocking unit-coverage gaps (scoreDimension mid-gradient scores; fileAdherenceFix tier-3 branch) recommended as follow-up.'
    ],
    metadata: {
      test_files: [
        'tests/unit/eva/adherence-scorer.test.js',
        'tests/unit/eva/convergence-loop.test.js',
      ],
      regression_test_files: [
        'tests/unit/eva/deviation-ledger.test.js',
        'tests/unit/eva/post-build-verdict-engine.test.js',
        'tests/unit/eva/rubric-generator.test.js',
      ],
      tests_total: 28,
      tests_passed: 28,
      tests_failed: 0,
      adherence_scorer_tests: 12,
      convergence_loop_tests: 16,
      regression_tests_total: 51,
      regression_tests_passed: 51,
      regression_tests_failed: 0,
      eslint_exit_code: 0,
      eslint_clean: true,
      e2e_applicable: false,
      e2e_not_applicable_reason: 'Pure backend/data-layer SD — two new lib/eva/*.js modules, no UI/route/HTTP surface for a browser test to drive.',
      quality_checks: {
        reason_quality_heuristic: 'GENUINE — word-count floor probed by "because reasons" (15 chars + causal marker, THIN only via <6 words)',
        circularity_guard: 'GENUINE — build-source reject, upstream accept, no-default-fn throw all covered',
        per_cycle_cap_overflow: 'GENUINE — 7 gaps @ cap 5 -> 5 routed / 2 deferred / 0 dropped; filing failure -> deferred+errors',
        monotone_early_exit: 'GENUINE — flat deficit series -> isTrendingDown false -> break before cycle 3 (ESCALATED)',
      },
      non_blocking_coverage_gaps: [
        'scoreDimension() mid-gradient scores (2/3/4) not directly asserted',
        'fileAdherenceFix() tier-3 createSdFn branch not exercised',
      ],
      branch: 'feat/SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C',
      commit: '0dfd3c7575',
      fresh_checkout: true,
      model: 'Opus 4.8',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001',
      checks_performed: {
        new_dual_suite: '28/28 pass (12 adherence-scorer + 16 convergence-loop)',
        sibling_regression: '51/51 pass (deviation-ledger, post-build-verdict-engine, rubric-generator)',
        eslint: 'exit 0, clean on all 4 files',
        reason_heuristic_trace: 'GENUINE — word-count floor directly probed',
        circularity_guard_trace: 'GENUINE — all 3 paths covered',
        cap_overflow_trace: 'GENUINE — cap + deferred + error-surfacing covered',
        monotone_early_exit_trace: 'GENUINE — flat series -> isTrendingDown false confirmed by source read',
        e2e: 'NOT APPLICABLE — backend/data-layer only',
      },
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
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
