#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- TESTING evidence at EXEC-TO-PLAN.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Built and ran the full corpus generator + regression suite against the REAL live database, which surfaced a real, unanticipated gap in the original design: "known-applied via ledger" does not guarantee the current live object still matches the migration file. Root-caused all 11 initial mismatches into 3 classes: (1) 7 entries are genuine post-apply content drift (a later migration/hotfix legitimately replaced the body, e.g. set_stage_override/set_global_auto_proceed gaining a chairman-only guard) -- correctly excluded from the corpus, not a defect. (2) 2 entries (trg_resolve_patterns_on_sd_complete, trg_chairman_decision_unblock) are a genuine, un-fixed normalizer gap: Postgres\'s deparser drops redundant outer parentheses the migration file\'s WHEN-clause source wrote, which SD-001\'s fix (case-fold/implicit-cast/quote-scoping) never addressed. (3) 1 entry (switch_sd_claim) revealed a quote/dollar-quote scanner state issue: \\r\\n line endings in a large real live body survive normalization untouched past a certain offset, while an isolated repro of the same collapse function works correctly -- symptomatic of the scanner misjudging a quote-region boundary earlier in that specific body and silently skipping all further normalization, not limited to line endings. FIXED the generator to be self-consistent: it now filters its own output to only entries where the SAME real normalizer functions (imported, not reimplemented) currently compare equal, logging every exclusion by name+path to the fixture\'s own excluded_current_mismatches array rather than asserting a false invariant or silently dropping the finding. Logged both new normalizer-gap classes to harness_backlog (feedback rows 8e7b9427, 9a3468c3) per chairman decision 27bfdde9\'s scope discipline (step B3 only; new normalizer fixes deferred). Final corpus: 264 entries (up from a projected 150 file-count -- objects, not files, since several files declare multiple functions/triggers), all independently verified matching. Ran the full existing apply-state test suite (117 tests across 2 files) plus 3 related test files (145 passed, 15 skipped -- DB-tier-gated, expected) confirming zero regressions to the pre-existing verifier test coverage. Mutation-tested: (a) both new TS-3 seeded-mutation tests genuinely fail when the code path is NOT exercised correctly (first attempt used a `--` comment mutation, silently stripped by stripSqlComments() before comparison -- caught by the test itself failing, fixed to a real-content mutation); (b) hand-mutated the confirmed_false_positive tag off the fixture (cp/restore discipline), confirmed exactly the 2 intended tests failed (the "exactly one confirmed" test and TS-1), restored, confirmed byte-identical via diff.',
    critical_issues: [],
    warnings: [
      {
        id: 'EXEC-1',
        severity: 'LOW',
        issue: 'The corpus size (264) and the excluded-mismatch population (11, likely to grow or shrink at each regeneration) are both measured, not fixed -- a future regeneration could see either number change materially as more migrations are applied to the fleet. This is documented behavior (README + PRD AC-1), not a defect, but worth restating as an operational note.',
        evidence: 'tests/fixtures/apply-state-verifier-corpus/corpus.json entry_count=264, excluded_current_mismatches.length=11 at generation time 2026-09-15.',
      },
    ],
    recommendations: [
      'VERIFY-phase VALIDATION should confirm the 2 filed harness_backlog rows (8e7b9427 redundant-paren, 9a3468c3 quote-scanner) are correctly categorized and not duplicates of any existing open item.',
      'A future SD picking up either harness_backlog item should re-run this SD\'s corpus generator after the fix to confirm the previously-excluded entries move into the must-match set.',
    ],
    detailed_analysis: {
      commands_run: [
        'node scripts/db/apply-state-verifier-corpus-generator.mjs -- first run, captured 275 candidate entries (before the self-consistency filter was added)',
        'Deep-dive inspection of 11 mismatching entries via scratchpad scripts (deleted after use) -- root-caused into 3 classes (drift, redundant-paren, scanner-state) by direct byte-level diffing of normalized text',
        'Fixed the generator to filter to self-consistent (currently-matching) entries only, logging exclusions -- re-ran, produced 264 clean entries',
        'unset DATABASE_URL SUPABASE_POOLER_URL SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY && npx vitest run tests/verify-migration-apply-state-corpus.test.js -- 7/7 passed with zero DB env vars set (TS-4 requirement)',
        'npx vitest run tests/verify-migration-apply-state.test.js tests/verify-migration-apply-state-corpus.test.js tests/integration/migration-apply-state-ledger-wiring.test.js tests/unit/chairman-apply-state-find-merged-pr-files.test.js tests/unit/scripts/complete-quick-fix-db-apply-state-gate.test.js -- 145 passed, 15 skipped (DB-tier gated), 0 failed',
        'Mutation test 1: seeded a `--`-comment mutation (caught as a test bug itself -- stripSqlComments() erases it before comparison), fixed to real-content mutation, re-verified both TS-3 mutations independently flip their respective comparison to false',
        'Mutation test 2: cp corpus.json to scratchpad backup, deleted confirmed_false_positive tag from the live fixture, re-ran suite -- exactly 2 tests failed (the "exactly one confirmed" assertion and TS-1), restored from backup, diff confirmed byte-identical',
        'node scripts/lint/require-main-guard-in-one-off-lint.mjs --working-dir -- 0 ungoverned violations (6 new untracked files all correctly guarded)',
      ],
    },
    metadata: {
      independent_verification: true,
      real_findings_count: 3,
      harness_backlog_filed: ['8e7b9427-3208-4087-b828-5fd39f755581', '9a3468c3-8619-41ab-bc21-81af66be5a4a'],
      test_execution: buildTestExecution({
        executed: 160,
        passed: 145,
        failed: 0,
        skipped: 15,
        runner: 'vitest',
        source: 'npx vitest run tests/verify-migration-apply-state.test.js tests/verify-migration-apply-state-corpus.test.js tests/integration/migration-apply-state-ledger-wiring.test.js tests/unit/chairman-apply-state-find-merged-pr-files.test.js tests/unit/scripts/complete-quick-fix-db-apply-state-gate.test.js',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/apply-state-verifier-002-store-testing-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
