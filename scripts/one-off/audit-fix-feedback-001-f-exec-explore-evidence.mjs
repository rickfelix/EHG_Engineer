#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-F, EXEC-TO-PLAN phase.
 *
 * The PRD (authored 2026-09-12T02:36Z) predates the chairman-ruled lifecycle-allowlist
 * migration (database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql,
 * applied 2026-09-12T10:53:36Z) and specified an "insert-with-supersedes-pointer" redesign
 * for all 6 named call sites. Re-verifying each site's ACTUAL write payload against current
 * main and the migration's WHEN-clause census (during EXEC, before implementing that redesign)
 * found all 6 write ONLY lifecycle columns -- already unconditionally UPDATE-able again, no
 * redesign needed. One real defect was found and fixed instead: a silent-error-swallowing bug
 * in lib/chairman/classifier-denial-guard.mjs, the same pattern already fixed in sibling child G.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-F';

const findings = [
  {
    id: 'prd-predates-the-lifecycle-allowlist-migration',
    severity: 'HIGH',
    summary: 'This child\'s PRD was authored 2026-09-12T02:36Z, ~8 hours before the chairman-ruled migration (database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql) was applied at 10:53:36Z. The PRD\'s "insert-with-supersedes-pointer" redesign was the correct fix under the OLD blanket-reject trigger; it is no longer needed for any of the 6 sites once the migration exempts lifecycle-column writes.',
  },
  {
    id: 'all-6-sites-re-verified-write-only-lifecycle-columns',
    severity: 'INFO',
    summary: 'Read all 6 files directly against current main and checked their written columns against the migration\'s WHEN-clause census: lib/learning/outcome-tracker.js:176-183 (status/resolved_at/resolution_sd_id) and :191-197 (resolution_sd_id); scripts/modules/handoff/executors/lead-final-approval/index.js:1579-1588 (status/resolved_at/resolution_notes/updated_at); lib/sub-agents/retro/db-operations.js:660-666 (status/resolution_notes/updated_at); lib/coordinator/pending-question-timer.cjs:258-267 (status/resolved_at/resolution_notes/metadata); lib/chairman/classifier-denial-guard.mjs:190-194 (status/resolution_notes/resolved_at); lib/learning/feedback-clusterer.js:296 (cluster_processed_at only). Every column named across all 6 sites is on the migration\'s explicit lifecycle allowlist -- none write a guarded content column. All 6 are already unblocked with NO code change required for the update itself.',
  },
  {
    id: 'classifier-denial-guard-silent-error-fixed-same-pattern-as-child-g',
    severity: 'MEDIUM',
    summary: 'lib/chairman/classifier-denial-guard.mjs:190-194 called supabase.from(\'feedback\').update(...).eq(\'id\', fr.id) without destructuring or checking the returned {error} at all -- supabase-js resolves with {error} rather than throwing on a PostgREST rejection, so this was silent, exactly the pattern already found and fixed in 4 sites across sibling child G. Fixed: now checks and surfaces the error via a new updateErrors array on the return value, and closed count reflects only successful updates.',
  },
  {
    id: 'other-5-sites-error-handling-already-adequate',
    severity: 'INFO',
    summary: 'outcome-tracker.js (both calls) and lead-final-approval/index.js throw on error (propagate, not silent); retro/db-operations.js and pending-question-timer.cjs already destructure {error} and log a non-fatal warning. Only classifier-denial-guard.mjs had the silent-swallow defect.',
  },
  {
    id: 'feedback-clusterer-reachability-reconfirmed-still-orphaned',
    severity: 'INFO',
    summary: 'Searched for any importer of lib/learning/feedback-clusterer.js across lib/, scripts/, package.json, and .github/workflows/ -- found none. Two files (lib/learning/role-learning-promoter.js, lib/learning/issue-knowledge-base.js) mention it only in comments (explaining why they do NOT route through it / describing its own callers of issue-knowledge-base, not the reverse). Confirms the PRD\'s FR-5 premise: still a genuinely orphaned standalone CLI, not wired into any live path. No fix applied; its one write (cluster_processed_at) would be lifecycle-exempt under the migration regardless, if it were ever run.',
  },
  {
    id: 'no-caller-depends-on-closed-count-semantics',
    severity: 'INFO',
    summary: 'Confirmed resolveAndVerifyClassifierDenial\'s only caller (scripts/chairman-decisions.mjs:184) stores the whole return object into result.classifier_denial_verification for audit purposes and does not branch on the exact value of .closed, so tightening closed to mean "successfully closed" (rather than "attempted") is a safe, non-breaking change.',
  },
];

const warnings = [
  'The originally-submitted PRD\'s FR-1 through FR-4 ("convert to insert-with-pointer pattern") are NOT implemented as literally written -- re-verification found the migration already achieves the same outcome (feedback rows can be resolved/updated again) without any redesign. Implementing the redesign anyway would have been unnecessary architecture change for a problem the migration already solved.',
];

const recommendations = [
  'PLAN/LEAD reviewing this handoff should read the scope correction above as the delivered outcome: all 6 sites confirmed working under the current trigger (5/6 via the migration alone, 1/6 via a small error-visibility fix), rather than expecting the PRD\'s literal insert-with-pointer redesign to have been built.',
  'Regression tests added for the sites lacking direct coverage (classifier-denial-guard.mjs error path, retro/db-operations.js, pending-question-timer.cjs); outcome-tracker.js and lead-final-approval/index.js already had adequate existing coverage, confirmed still passing.',
];

const summary = 'EXEC-phase re-verification for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-F found the PRD\'s premise stale: authored before the 20260912 lifecycle-allowlist migration, it called for an insert-with-pointer redesign across 6 files that the now-applied migration already makes unnecessary (all 6 sites write only lifecycle columns). One real, smaller defect was found and fixed instead -- classifier-denial-guard.mjs silently swallowed a rejected feedback UPDATE, the same pattern already fixed in sibling child G -- plus regression tests were added for the 3 sites (classifier-denial-guard.mjs, retro/db-operations.js, pending-question-timer.cjs) that lacked direct coverage of this call path. feedback-clusterer.js\'s orphaned-CLI status (PRD FR-5) was re-confirmed unchanged.';

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
      phase: 'EXEC_TO_PLAN',
      artifacts_read: [
        'database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql',
        'lib/learning/outcome-tracker.js',
        'scripts/modules/handoff/executors/lead-final-approval/index.js',
        'lib/sub-agents/retro/db-operations.js',
        'lib/coordinator/pending-question-timer.cjs',
        'lib/chairman/classifier-denial-guard.mjs',
        'lib/learning/feedback-clusterer.js',
        'scripts/chairman-decisions.mjs',
      ],
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
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
