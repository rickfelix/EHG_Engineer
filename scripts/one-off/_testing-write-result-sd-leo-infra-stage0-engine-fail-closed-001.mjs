#!/usr/bin/env node
/**
 * Write TESTING sub-agent EXEC-phase verdict for
 * SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001
 * (Stage-0 ENGINE FAIL-CLOSED: synthesis failure can never emit maturity=ready)
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

const SD_ID = 'ece35968-e155-4b25-bbda-c438ff783cb3';
const SD_KEY = 'SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001';

const findings = [
  {
    id: 'F1-full-stagezero-suite-green',
    severity: 'INFO',
    summary: 'npx vitest run tests/unit/eva/stage-zero/ -> 39 test files, 569/569 tests pass, 9.56s. Zero regressions across the entire Stage-0 unit surface, which includes both the new fail-closed test file and every pre-existing synthesis/archetype/narrative/tech-trajectory/virality/design test.'
  },
  {
    id: 'F2-target-files-per-test-verified',
    severity: 'INFO',
    summary: 'Ran the two SD-touched test files verbose: synthesis-fail-closed.test.js (3 tests: FR-4 seeded-defect canary all-15-fail, FR-5 partial 5/15-fail, FR-6 zero-failure baseline) plus the modified synthesis-engine.test.js (9 pre-existing tests including handles-component-failure-gracefully, maturity=blocked-when-constraints-fail, maturity=nursery-when-park_and_build_later). 12/12 pass. The pre-existing nursery/blocked branch tests still pass, proving the new fail-closed branch did not clobber the pre-existing maturity precedence.'
  },
  {
    id: 'F3-mutation-test-proves-non-tautological',
    severity: 'INFO',
    summary: 'To prove the canary is genuinely exercised (not tautological), I mutated lib/eva/stage-zero/synthesis/index.js back to pre-fix behavior (restored hardcoded componentsRun=15, disabled the anyComponentFailed->blocked branch) and re-ran synthesis-fail-closed.test.js: FR-4 canary FAILED and FR-5 partial FAILED against the mutant (exactly satisfying FR-4 AC that the test fails against the pre-fix code), while FR-6 baseline correctly stayed GREEN (it asserts unchanged happy-path behavior, so it is expected to pass under this mutation). Source was then restored from backup; git diff --stat and a grep for the MUTATION marker confirm zero residue (30 ins / 17 del vs HEAD = the real SD change only), and the full 569-test suite was re-run clean post-restore.'
  },
  {
    id: 'F4-fr1-fr2-fr3-source-verified',
    severity: 'INFO',
    summary: 'FR-1: grep for _failed:true in index.js returns 14 (not the literal 15 the AC wording predicts) because the 15th component, mentalModelAnalysis, fails to return null at line 152 rather than a zeroed _failed object, its pre-existing advisory contract. FR-2: no hardcoded components_run:15 literal remains; componentsRun is computed at line 220 as componentsTotal minus failedCount. FR-3: the failedCount filter at line 219 is (c === null || c._failed === true), so the null-returning mentalModel IS counted as a failure and the weakest-link maturity branch (line 227) fires correctly. The three fail-closed test outcomes (components_run 0 / 10 / 15) empirically confirm all 15 components, including the null one, are counted.'
  },
  {
    id: 'F5-fr1-ac-literal-wording-deviation',
    severity: 'LOW',
    summary: 'Non-blocking spec-vs-implementation note: FR-1 AC says grep for _failed:true should return exactly 15 matches, one per catch block. Actual is 14 markers + 1 fail-to-null (mentalModelAnalysis). The implementation is SEMANTICALLY correct and arguably better: forcing a _failed marker onto mentalModelAnalysis would change its established advisory-null contract, and the counting logic (null-or-_failed) already treats the null as a failure. The code comment at lines 213-216 explicitly documents this design choice. Recommend PLAN correct the FR-1 AC wording to 14 _failed:true markers plus mentalModelAnalysis fail-to-null, all 15 incorporated by the failedCount filter, for the completed record. No code change needed.'
  }
];

const warnings = [
  'FR-1 acceptance-criterion literal wording (exactly 15 _failed:true matches) does not match the implementation (14 markers + 1 fail-to-null). Semantically correct and intentional (documented in-code); recommend AC wording correction at PLAN, not a code change.'
];

const recommendations = [
  'Allow EXEC-TO-PLAN handoff to proceed: dual-source evidence (full-suite green + mutation-proven non-tautological canary) is clean.',
  'PLAN verification: correct the FR-1 acceptance-criterion wording from exactly-15-matches to reflect the 14-markers-plus-one-fail-to-null design; the counting filter incorporates all 15.',
  'No E2E coverage required: this is a pure server-side engine invariant (fail-closed maturity derivation) fully exercised by the unit-level seeded-defect canary + partial + baseline triad against the real runSynthesis import.'
];

const summary = 'PASS (confidence 95). Stage-0 fail-closed fix verified. Full suite: 39 files / 569 tests pass, zero regressions. Target triad (seeded-defect canary all-15-fail -> components_run 0 and maturity!=ready; partial 5/15-fail -> components_run 10 and maturity!=ready with pre-existing branches proven NOT the cause; zero-failure baseline -> 15/15 and maturity=ready) all pass against the REAL runSynthesis import, not a mock of it. Mutation test confirms non-tautology: reverting the counting + fail-closed branch makes the canary and partial tests FAIL (FR-4 AC satisfied) while the baseline correctly stays green; source restored clean with no residue. FR-1 through FR-6 all satisfied at source and behavior level. One LOW non-blocking note: FR-1 AC literal wording (15 _failed:true matches) predates the fail-to-null design for the advisory mentalModelAnalysis component (actual 14 markers + 1 null, all 15 counted); recommend AC text correction, no code change.';

const justification = [
  'PASS (confidence 95) - SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001 EXEC-phase test evidence is sufficient for EXEC-TO-PLAN handoff.',
  '',
  'EVIDENCE:',
  '1. Full suite: npx vitest run tests/unit/eva/stage-zero/ -> 39 files, 569/569 pass, 9.56s. Zero regressions. Re-run clean AGAIN after the mutation test restore.',
  '2. Target files verbose: synthesis-fail-closed.test.js (3) + synthesis-engine.test.js (9) = 12/12 pass. The modified pre-existing synthesis-engine.test.js added two mocks (attention-capital.js, mental-model-analysis.js) that were previously running their REAL implementations (rejecting in a no-DB/no-LLM test env), invisible under the old hardcoded 15/15 stamp, correctly surfaced as failures by the fix, hence the mocks were required to restore a true all-components-succeed baseline. Its nursery/blocked branch tests still pass -> pre-existing maturity precedence preserved.',
  '3. Non-tautology proof (mutation test): reverted index.js to pre-fix (hardcoded componentsRun=15, fail-closed branch disabled) -> FR-4 canary FAILED + FR-5 partial FAILED (satisfies FR-4 AC that it fails against pre-fix code); FR-6 baseline stayed GREEN as expected (asserts unchanged happy path). Restored from backup; git diff --stat vs HEAD = 30 ins/17 del (real change only), grep MUTATION = clean, full 569 suite green post-restore.',
  '4. FR-1 source: 14 _failed:true markers + mentalModelAnalysis fail-to-null (line 152). FR-2 source: no hardcoded components_run:15; computed at line 220. FR-3 source: failedCount filter (line 219) = (c === null || c._failed === true) so the null 15th component IS counted; weakest-link branch at line 227. The empirical run counts (0/10/15) confirm all 15 incorporated.',
  '',
  'RATIONALE FOR PASS:',
  'Every FR (1-6) and test scenario (TS-1..TS-3) is confirmed both at source level and by real behavior against the un-mocked runSynthesis. The canary is proven non-tautological by direct mutation. The sole finding raised (F5) is a cosmetic FR-1 AC-wording deviation for the advisory mentalModelAnalysis component: the implementation is semantically correct, safer (preserves the null contract), self-documenting, and the failure IS counted. No blocking or code-level gaps found.'
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
    confidence: 95,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      test_files: [
        'tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js',
        'tests/unit/eva/stage-zero/synthesis/synthesis-engine.test.js',
      ],
      full_suite_scope: 'tests/unit/eva/stage-zero/',
      full_suite_files: 39,
      full_suite_tests_total: 569,
      full_suite_tests_passed: 569,
      full_suite_tests_failed: 0,
      target_triad_tests_total: 12,
      target_triad_tests_passed: 12,
      fr_coverage: {
        'FR-1': '14 _failed:true markers + mentalModelAnalysis fail-to-null (line 152); all 15 counted by failedCount filter. AC literal 15-matches wording deviation noted (F5)',
        'FR-2': 'no hardcoded components_run:15; computed at index.js:220 as componentsTotal-failedCount. VERIFIED',
        'FR-3': 'fail-closed maturity branch at index.js:227 (anyComponentFailed -> blocked), precedence after constraints-fail, before nursery/ready. VERIFIED',
        'FR-4': 'seeded-defect canary (all 15 fail) -> components_run 0, maturity!=ready; PROVEN to fail against pre-fix via mutation. VERIFIED non-tautological',
        'FR-5': 'partial 5/15 fail -> components_run 10, maturity!=ready, and asserts constraints.verdict!=fail and time_horizon!=park_and_build_later so only the NEW branch can block. VERIFIED',
        'FR-6': 'zero-failure baseline -> components_run==components_total==15, maturity==ready. VERIFIED (stays green under mutation, as expected)',
      },
      non_tautology_check: 'mutation test: reverted counting + fail-closed branch -> FR-4 and FR-5 FAIL, FR-6 GREEN; source restored with zero residue (git diff --stat + grep MUTATION clean)',
      target_source_file: 'lib/eva/stage-zero/synthesis/index.js',
      regression_status: 'zero regressions; full 569-test suite green pre- and post-mutation-restore',
      e2e_applicable: false,
      e2e_exemption_reason: 'server-side engine invariant (fail-closed maturity derivation) fully exercised at unit level against real runSynthesis; no UI/route surface',
      model: 'Opus 4.8',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        full_stagezero_suite: '569/569 pass across 39 files',
        target_triad_verbose: '12/12 pass (3 fail-closed + 9 synthesis-engine)',
        mutation_non_tautology: 'canary+partial FAIL vs pre-fix mutant, baseline GREEN, clean restore',
        fr1_source_grep: '14 _failed:true + 1 fail-to-null; failedCount filter counts null',
        fr2_source_grep: 'no hardcoded components_run:15 literal',
        fr3_maturity_trace: 'weakest-link branch present, correct precedence',
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
