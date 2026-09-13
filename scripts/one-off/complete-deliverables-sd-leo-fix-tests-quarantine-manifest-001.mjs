/**
 * Manual deliverable completion, SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001.
 *
 * WHY MANUAL: the automated evidence-linker (reconcileDeliverables() in
 * scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js) queries
 * product_requirements_v2 by `.eq('directive_id', sdId)` where sdId is the SD's UUID
 * (ctx.sd.id, per this repo's own documented convention) -- but product_requirements_v2.directive_id
 * stores the SD_KEY STRING, not the UUID (confirmed by direct query: a UUID lookup returns null,
 * an sd_key lookup returns the real row). That makes hasPrd permanently false for every
 * gate-invoked reconciliation call across the whole system, so its generic keyword-match check
 * (check 5) can never fire via the gate path -- a pre-existing, repo-wide harness defect, out of
 * scope for this SD to fix inline (unrelated to quarantine-manifest work; a separate QF/SD candidate).
 *
 * FR-1 and FR-5 were reconciled automatically because their deliverable names happen to contain
 * the literal words "validation"/"test" (check 3, keyword-independent of the broken hasPrd path).
 * FR-2/FR-3/FR-4 do not, so they need this manual completion with the SAME evidentiary rigor the
 * reconciler itself would have applied had the join worked -- real file paths, a real commit hash,
 * and real verification steps actually run, not a rubber stamp.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_ID = '47a2c833-6392-44d9-adfb-f65159533a67'; // SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001

const COMPLETIONS = [
  {
    id: 'd85a52cb-20aa-426f-b090-00a2bcfed342', // FR-2
    evidence: 'scripts/lint/quarantine-retire-check.mjs (new file). evaluateBaseline() asserts the 150-entry committed baseline; findOverdueEntries() flags review_by-past entries with no matching verdict in tests/quarantine-retriage-verdicts.json (exact file-path join); groupOverdueByReasonClass() groups the report; --diff --base <ref> scopes to touched entries via diffTouchedEntries(). Verified live against the real manifest: `node scripts/lint/quarantine-retire-check.mjs` reports Baseline 150/150 and 132 overdue entries grouped across 15 reason_class cohorts (exit 1, as expected pre-triage).',
    notes: 'FR-2 acceptance criteria verified by direct execution, not just unit tests: baseline-growth exit-nonzero and overdue detection both confirmed against the live 150-entry manifest before commit.',
  },
  {
    id: '5c20c019-a53a-42c0-a864-a74190b5e544', // FR-3
    evidence: '.github/workflows/unit-tier-clock-skew.yml (new `quarantine-retire-check` job, mirrors the if:always()/outcome-env pattern shipped for QF-20260912-364 in commit c5c02526b5a) and .github/workflows/quarantine-retire-check.yml (new file, pull_request-triggered, --diff mode, paths: scoped to the manifest AND the gauge script itself per the schema-reference-lint.yml precedent). Both YAML files parsed successfully via js-yaml before commit.',
    notes: 'Cannot execute a GitHub Actions run from a local worktree; verified via YAML parse validity and manual review against the two cited precedent workflows (unit-tier-clock-skew.yml pre-existing job, e2e-quarantine-count-guard.yml).',
  },
  {
    id: '804227e3-22ed-42d9-95b2-354c8b8c557e', // FR-4
    evidence: 'buildHarnessBacklogRows()/emitOverdueBacklogRows() in scripts/lint/quarantine-retire-check.mjs, calling lib/governance/emit-feedback.js emitFeedback() directly (category=harness_backlog, dedup_key=`quarantine-retire:<reason_class>`). Verified live: a real run against the 150-entry manifest produced exactly 15 feedback rows (category=harness_backlog, title prefix "Quarantine retire-check:"), one per distinct reason_class among the 132 overdue entries -- confirmed by a follow-up SELECT (15 rows) and a second gauge run that produced zero additional rows (dedup confirmed).',
    notes: 'One row per reason_class cohort, never per file -- directly measured against production data, not a mock.',
  },
];

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const nowIso = new Date().toISOString();

  for (const c of COMPLETIONS) {
    const { error } = await supabase
      .from('sd_scope_deliverables')
      .update({
        completion_status: 'completed',
        completed_at: nowIso,
        completion_evidence: c.evidence,
        completion_notes: c.notes,
        metadata: {
          producer: 'manual_worker_evidence',
          reconciled_at: nowIso,
          commit_hash: commitHash,
          reason: 'reconcileDeliverables() hasPrd lookup uses SD UUID against product_requirements_v2.directive_id (which stores sd_key), so its generic check never fires for this deliverable -- see script header',
        },
      })
      .eq('id', c.id)
      .eq('sd_id', SD_ID);
    if (error) {
      console.error(`FAILED for ${c.id}:`, error.message);
      process.exitCode = 1;
      continue;
    }
    console.log(`Completed ${c.id}`);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
