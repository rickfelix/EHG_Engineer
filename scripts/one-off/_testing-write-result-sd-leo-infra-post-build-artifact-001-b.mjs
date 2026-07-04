#!/usr/bin/env node
/**
 * Write TESTING sub-agent EXEC-phase verdict for
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B ("Artifact Walk + Verdict Table Engine")
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

const SD_ID = 'a64c62bd-b42d-406d-8688-9fca3ec154ab';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B';

const findings = [
  {
    id: 'F1-dual-test-suite-all-pass',
    severity: 'INFO',
    summary: 'npx vitest run on the two SD-specified files: tests/unit/eva/post-build-verdict-engine.test.js (24 tests, mocked + real-filesystem-fixture evidence-matching cases) and tests/integration/eva/post-build-verdict-engine-realdb.test.js (4 tests, real Supabase DB). Combined: 28/28 pass, 6.62s. HAS_REAL_DB sentinel was TRUE in this environment (SUPABASE_URL/SERVICE_ROLE_KEY are real, not the test.invalid.local placeholder) so the realdb suite genuinely executed against production Supabase rather than skipping.'
  },
  {
    id: 'F2-regression-suite-clean',
    severity: 'INFO',
    summary: "Re-ran Child A's own 4 test files as a regression check (this SD shares lib/eva/ with Child A but did not touch Child A's files): tests/unit/eva/artifact-types.test.js, tests/unit/eva/deviation-ledger.test.js, tests/integration/eva/deviation-ledger-realdb.test.js, tests/integration/eva/post-build-adherence-rubric-realdb.test.js. 40/40 pass, 874ms, run separately from the primary suite to avoid any real-DB write interleaving on the same MarketLens rows. No regression."
  },
  {
    id: 'F3-existsSync-guard-confirmed',
    severity: 'INFO',
    summary: "Read tests/integration/eva/post-build-verdict-engine-realdb.test.js lines 113-137 directly. The MarketLens smoke-check test guards its evidence-found assertion behind `const repoAvailableLocally = Boolean(repoPath) && existsSync(repoPath) && statSync(repoPath).isDirectory();` and only asserts `anyEvidenced` when repoAvailableLocally is true, with an inline comment explicitly documenting why (applications.local_path is dev-machine-specific and won't exist on a CI runner). Confirmed this cannot spuriously fail on a runner lacking that local path."
  },
  {
    id: 'F4-computeDisposition-traced-no-built-without-strong',
    severity: 'INFO',
    summary: "Traced lib/eva/post-build-verdict-engine.js computeDisposition() (lines 274-284) by hand: the ONLY branch returning DISPOSITIONS.BUILT is `evidenceConfidence === 'STRONG'` (line 276); WEAK maps to PARTIAL, everything else falls through to DEVIATED_* or MISSING. Traced findEvidenceForClaim()'s bestConfidence variable (lines 219-265): initialized to 'NONE', only promoted to 'STRONG' on a path/filename keyword hit OR >=2 distinct keyword matches in one file's body, only promoted to 'WEAK' when exactly 1 keyword matches AND not already STRONG — monotonic non-decreasing across the file-walk loop, no code path regresses or defaults upward to STRONG/BUILT on ambiguous input. FR-4 chairman's-honesty-rule (could-not-verify != built) holds by construction, not just by convention."
  },
  {
    id: 'F5-migration-live-marketlens-production-data',
    severity: 'INFO',
    summary: 'Queried post_build_verdicts directly against the real DB after the test run: table exists, 47 total rows, ALL 47 belong to the real MarketLens venture (ecbba50e-3c98-4493-9e77-1719cf6b6f00). Disposition breakdown: BUILT=24, PARTIAL=18, MISSING=5 — a genuine mix, not a single-bucket default, corroborating F4. Most recent updated_at (2026-07-04T20:42:14.436Z) matches the just-executed realdb test run, proving the artifact walk was actually exercised against production data during this SD\'s own testing (not only synthetic fixtures) and that the UPSERT grain (venture_id, artifact_type, claim_ref) is holding under a real repeated-write pattern (S19->S20 remediation-convergence re-fire scenario the schema comment anticipates).'
  },
  {
    id: 'F6-prompt-test-count-labeling-minor',
    severity: 'INFO',
    summary: 'The task brief attributed "28 tests" to the unit file alone; the actual split is 24 (unit, mocked + real-filesystem-fixture cases) + 4 (realdb) = 28 combined. Not a defect — flagging only so the count in the SD/PRD record, if it echoes "28" as the unit-file figure, gets corrected to 24 unit + 4 integration for future readers.'
  }
];

const warnings = [];

const recommendations = [
  'Allow EXEC-TO-PLAN handoff to proceed — all dual-test-suite and regression evidence is clean, migration is confirmed live against real production data.',
  'PLAN verification: if the PRD text cites "28 unit tests," correct to "24 unit + 4 real-DB integration = 28 total" for accuracy in the completed record.',
  'No additional E2E coverage required for this child — the realdb suite already exercises the full runArtifactWalk() path end-to-end against the real MarketLens venture.'
];

const summary = 'PASS (confidence 96). Dual-test requirement satisfied: 24 unit + 4 real-DB integration = 28/28 pass. Child A regression suite (40 tests across 4 files) clean, no interference. Both requested quality checks independently verified by direct code trace: (a) MarketLens real-DB test correctly guards its evidence-found assertion behind an existsSync()+isDirectory() check; (b) computeDisposition() has exactly one path to BUILT, gated on STRONG evidence confidence, which is itself only reachable via a path/name hit or >=2 distinct keyword matches in one file — no code path defaults toward BUILT on weak/ambiguous evidence. Migration confirmed live: post_build_verdicts has 47 real rows, all for MarketLens, with a genuine BUILT/PARTIAL/MISSING mix (24/18/5), timestamped to this test run.';

const justification = `PASS (confidence 96) — SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B EXEC-phase test evidence is sufficient for EXEC-TO-PLAN handoff.

EVIDENCE:
1. npx vitest run tests/unit/eva/post-build-verdict-engine.test.js tests/integration/eva/post-build-verdict-engine-realdb.test.js -> 2 files, 28/28 tests pass (24 unit + 4 realdb), 6.62s combined / verified per-file: unit 24 passed in 565ms, realdb 4 passed in 7.15s (real Supabase, HAS_REAL_DB sentinel true).
2. Regression: npx vitest run tests/unit/eva/artifact-types.test.js tests/unit/eva/deviation-ledger.test.js tests/integration/eva/deviation-ledger-realdb.test.js tests/integration/eva/post-build-adherence-rubric-realdb.test.js -> 4 files, 40/40 pass, 874ms. Child A's own suite is unaffected by Child B's additions.
3. Code-quality trace #1 (existsSync guard): tests/integration/eva/post-build-verdict-engine-realdb.test.js:129 -> \`const repoAvailableLocally = Boolean(repoPath) && existsSync(repoPath) && statSync(repoPath).isDirectory();\` gates the anyEvidenced assertion (line 130-135) so a CI runner without the dev-machine local_path cannot spuriously fail. Confirmed by direct read, not inference.
4. Code-quality trace #2 (no BUILT without STRONG): lib/eva/post-build-verdict-engine.js computeDisposition() (line 276) \`if (evidenceConfidence === 'STRONG') return DISPOSITIONS.BUILT;\` is the sole BUILT-returning branch. findEvidenceForClaim()'s bestConfidence starts 'NONE', promotes to STRONG only on pathHit or >=2 distinct keyword matches (line 256-257), to WEAK only on exactly 1 match and not already STRONG (line 258) -- monotonic, never regresses, never defaults upward without qualifying evidence.
5. Migration liveness: direct query against post_build_verdicts confirms the table exists (not just the .sql file on disk) with 47 rows, 100% attributable to the real MarketLens venture (ecbba50e-3c98-4493-9e77-1719cf6b6f00), disposition mix BUILT=24/PARTIAL=18/MISSING=5, most recent updated_at timestamp matching this test run -- proof the artifact walk ran against production data as part of this SD's own testing.

RATIONALE FOR PASS:
Every one of the 5 requested verification steps was independently confirmed by direct execution, direct file read, or direct DB query -- no step relied on trusting a prior claim. No blocking or non-blocking gaps were found; the one note raised (F6) is a cosmetic test-count labeling nuance in the task brief itself, not a code or test defect.`;

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
        'tests/unit/eva/post-build-verdict-engine.test.js',
        'tests/integration/eva/post-build-verdict-engine-realdb.test.js',
      ],
      regression_test_files: [
        'tests/unit/eva/artifact-types.test.js',
        'tests/unit/eva/deviation-ledger.test.js',
        'tests/integration/eva/deviation-ledger-realdb.test.js',
        'tests/integration/eva/post-build-adherence-rubric-realdb.test.js',
      ],
      tests_total: 28,
      tests_passed: 28,
      tests_failed: 0,
      unit_tests: 24,
      realdb_integration_tests: 4,
      regression_tests_total: 40,
      regression_tests_passed: 40,
      integration_gating: 'describeDb/HAS_REAL_DB sentinel (SUPABASE_URL + SERVICE_ROLE_KEY, excluding test.invalid.local placeholders) — genuinely ran against real DB in this environment',
      migration_file: 'database/migrations/20260704_create_post_build_verdicts.sql',
      migration_confirmed_live: true,
      post_build_verdicts_total_rows: 47,
      post_build_verdicts_marketlens_rows: 47,
      post_build_verdicts_disposition_breakdown: { BUILT: 24, PARTIAL: 18, MISSING: 5 },
      marketlens_venture_id: 'ecbba50e-3c98-4493-9e77-1719cf6b6f00',
      quality_check_existsSync_guard: 'CONFIRMED at tests/integration/eva/post-build-verdict-engine-realdb.test.js:129',
      quality_check_no_built_without_strong: 'CONFIRMED at lib/eva/post-build-verdict-engine.js:276 (sole BUILT branch, gated on STRONG confidence)',
      model: 'Claude Sonnet 5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001',
      checks_performed: {
        primary_dual_test_run: '28/28 pass (24 unit + 4 realdb)',
        regression_suite: '40/40 pass (Child A own tests, 4 files)',
        existsSync_guard_review: 'CONFIRMED present and correctly scoped',
        computeDisposition_trace: 'CONFIRMED — single BUILT branch gated on STRONG',
        migration_liveness_query: 'CONFIRMED — 47 rows, all MarketLens, mixed dispositions',
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
