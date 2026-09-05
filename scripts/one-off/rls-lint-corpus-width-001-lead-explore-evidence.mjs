#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-RLS-LINT-CORPUS-WIDTH-001, LEAD-TO-PLAN phase.
 *
 * Records independent re-verification of the SD's 5 factual claims by reading the exact cited
 * files/lines and by RE-EXECUTING lintSql() against the two currently-unscanned directories
 * (database/manual-updates, supabase/migrations) rather than trusting the SD's transcription.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-RLS-LINT-CORPUS-WIDTH-001';

const findings = [
  {
    id: 'lintsql-returns-violations-only-clean-policies-skipped',
    severity: 'INFO',
    summary: 'scripts/lint/rls-anon-tenant-predicate-lint.mjs confirmed: classifyViolation() (:171-190) returns null for clean policies; lintSql() (:216-231) does `if (!violationClass) continue;`, so only actual violations are ever returned -- lintSql() cannot be mistaken for a full-corpus policy inventory.',
  },
  {
    id: 'lint-corpus-filter-hard-restricted-to-database-migrations',
    severity: 'HIGH',
    summary: 'Both the diff-mode corpus filter (:244) and the --all-mode corpus enumeration (:249-251) in rls-anon-tenant-predicate-lint.mjs hard-restrict to `database/migrations/` only -- confirmed by direct read, not inferred from the SD description.',
  },
  {
    id: 'ddl-writer-of-record-scans-three-directories-lint-scans-one',
    severity: 'HIGH',
    summary: 'scripts/modules/handoff/pre-checks/pending-migrations-check.js (:799-803, repeated :896) enumerates THREE directories as the actual DDL-auto-apply writer of record: database/migrations, database/manual-updates, supabase/migrations. The lint corpus (one directory) is a strict subset of the writer\'s corpus (three directories) -- confirmed structurally, not just by directory-name comparison.',
  },
  {
    id: 'ci-trigger-and-invocation-also-restricted-to-database-migrations-blocking-diff-mode',
    severity: 'INFO',
    summary: '.github/workflows/rls-anon-tenant-predicate-lint.yml paths trigger (:20-23) matches only database/migrations/**/*.sql; line 40 invokes the lint without --all, i.e. blocking diff mode only fires for that one directory -- a violation newly introduced under database/manual-updates/ or supabase/migrations/ would never trigger this workflow at all, not even in advisory form.',
  },
  {
    id: 'baseline-posture-and-live-violation-counts-remeasured-with-expected-drift',
    severity: 'INFO',
    summary: 'Workflow lines 10-12 confirmed: explicit advisory-only/never-retroactive baseline posture for database/migrations\' own pre-existing violations (deliberate ratchet, not a defect -- the defect is the ratchet\'s width, not its baseline). Re-executed lintSql() directly against the two unscanned directories: supabase/migrations measured 86 top-level .sql files / 56 violations (SD claimed 90/58) and database/migrations currently 1483 files (SD claimed 1477) -- both deltas are normal drift from new migrations landing since the SD was authored, not a contradiction of the SD\'s premise. All 5 claims independently CONFIRMED.',
  },
];

const warnings = [
  'Live counts (86/56 for supabase/migrations, 1483 total for database/migrations) will keep drifting as new migrations land during PLAN/EXEC -- PLAN should treat the corpus-widening fix itself (directory list + shared artifact) as the acceptance criterion, not a frozen violation count.',
];

const recommendations = [
  'PLAN should require classifying the ~61 existing violations in the two newly-scanned directories before EXEC begins (mirroring database/migrations\' own advisory-only baseline posture), so widening the corpus does not retroactively turn pre-existing violations into blocking CI failures.',
  'PLAN should require ONE shared directory-list artifact (e.g. exported from a single module) imported by both scripts/lint/rls-anon-tenant-predicate-lint.mjs and .github/workflows/rls-anon-tenant-predicate-lint.yml\'s paths trigger, so the lint corpus and the CI trigger corpus can never silently diverge again the way lint-vs-pending-migrations-check.js did.',
  'PLAN should require an end-to-end test/fixture PR proving the corpus-widening actually catches a violation seeded in database/manual-updates/ or supabase/migrations/ -- a directory-list change alone, without a red-then-green proof, would not verify the fix closes the gap.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-RLS-LINT-CORPUS-WIDTH-001 independently re-verified all 5 factual claims in the SD description by reading the exact cited files/lines (rls-anon-tenant-predicate-lint.mjs, pending-migrations-check.js, rls-anon-tenant-predicate-lint.yml) and by re-executing lintSql() directly against the two currently-unscanned directories (database/manual-updates, supabase/migrations). The lint corpus is confirmed to be a strict, structural subset (one directory) of the DDL-auto-apply writer\'s corpus (three directories), and the CI trigger/invocation is confirmed to share the same one-directory restriction, blocking diff mode entirely for the other two. Minor count drift (86/56 vs claimed 90/58 for supabase/migrations; 1483 vs claimed 1477 for database/migrations) is expected drift since SD authoring, not a contradiction. No claim was found to be inaccurate; no duplicate or overlapping open SD was found on this topic.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/lint/rls-anon-tenant-predicate-lint.mjs',
        'scripts/modules/handoff/pre-checks/pending-migrations-check.js',
        '.github/workflows/rls-anon-tenant-predicate-lint.yml',
      ],
      re_execution_commands: [
        'lintSql() invoked directly against database/manual-updates/**/*.sql',
        'lintSql() invoked directly against supabase/migrations/**/*.sql',
      ],
      quick_fixes_reviewed: [],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
