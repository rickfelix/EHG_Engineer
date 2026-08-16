// Final LEAD decision pass for SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001, incorporating the
// VALIDATION sub-agent's findings (evidence row 092fa8f6-b74a-4b11-842e-7b242f222fd8,
// CONDITIONAL_PASS/88) -- each independently re-verified against the live DB directly (not
// trusted on the sub-agent's word alone) before being folded into scope.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('key_changes, risks, metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const key_changes = (existing.key_changes || []).map((kc) => {
  if (kc.change?.startsWith('Replace the playwright_test_scenarios lookup')) {
    return {
      change: "REVISED (VALIDATION-informed, independently re-verified): the self-join lookback must be RUN-RELATIVE, not wall-clock-24h. Direct DB verification found 52/52 test_results rows have a UNIQUE (test_file_path,test_name) pair -- a same-pair self-join matches ZERO existing rows, and the table's actual write cadence has 8-24 DAY gaps between runs (most recent row is 127+ days stale), so a 24h wall-clock window would silently discard essentially every real regression even after the table/query fix. Compare instead to the same test's most recent row from a DIFFERENT, earlier test_run_id (test_results.test_run_id -> test_runs.started_at, ordered DESC, excluding the current run), regardless of wall-clock gap. Use test_full_title as the identity key, not test_file_path+test_name -- test_file_path was found to sometimes hold non-test source paths (different writers populate it with different semantics), so it is not a stable identity component.",
      impact: kc.impact,
    };
  }
  if (kc.change?.startsWith('CORRECTION: stage')) {
    return {
      change: kc.change + ' Wrap in an idempotency guard (check pg_publication_tables before ALTER PUBLICATION, or catch 42710) so a re-run of the staged migration is safe.',
      impact: kc.impact,
    };
  }
  return kc;
});

key_changes.push({
  change: 'PRD (PLAN phase) MUST define an observable, falsifiable proof that the monitor actually fires end-to-end: a test that inserts a passed test_results row then a failed row for the same test identity (from an earlier test_run) and asserts a new root_cause_reports row appears. Per VALIDATION: without this, the SD ships the same unfalsifiable-green class of defect it exists to remove.',
  impact: 'Directly closes the observability gap that let the original defect survive undetected since the file was written -- the failure mode this whole SD is about is "looks fine, never actually ran."',
});

const risks = [
  ...(existing.risks || []),
  {
    risk: 'VALIDATION found the LEO Playwright reporter (the writer into test_results) is overridden by explicit --reporter flags in .github/workflows/stories-ci.yml, so test_results is populated by local dev runs only, not CI -- post-fix, the monitor will be correctly wired but may see little real production inflow until that CI gap is separately closed.',
    impact: 'medium',
    likelihood: 'high',
    mitigation: 'Out of this SD\'s scope (a CI reporter-configuration issue, not a code defect in the monitor itself). The code fix and its tests are correct and verifiable via synthetic INSERTs regardless of real CI inflow; file the CI reporter-override gap separately if not already tracked.',
  },
];

const validation_findings = {
  evidence_id: '092fa8f6-b74a-4b11-842e-7b242f222fd8',
  verdict: 'CONDITIONAL_PASS (confidence 88)',
  independently_reverified_by_lead: [
    'self-join inertness: CONFIRMED directly (52 rows, 52 distinct (test_file_path,test_name) pairs, 0 pairs with >1 row).',
    'run cadence: CONFIRMED directly (test_runs.started_at gaps of days-to-weeks; the 1982-total_tests run on 2026-03-18 wrote ZERO test_results detail rows -- corroborates the CI-reporter-override finding).',
    'replica identity: CONFIRMED directly via pg_class (test_results, retrospectives, sub_agent_execution_results all relreplident=\'d\').',
    'publication membership: CONFIRMED directly via pg_publication_tables (all 21 published tables enumerated; sub_agent_execution_results and test_results/test_runs/test_failures absent from all of them).',
  ],
  scope_findings_filed_separately_not_fixed_here: [
    'feedback ade11984-0622-4bd1-8c6f-ecd6757a0122 -- monitorSubAgentFailures() dead (sub_agent_execution_results unpublished).',
    'feedback d9fcf973-6ae9-4dc5-b4da-ac992d1542e7 -- monitorQualityGates() dead (retrospectives replident=\'d\' strips payload.old down to PK-only).',
  ],
  design_corrections_applied: [
    'Self-join lookback switched from wall-clock 24h to run-relative (most recent prior test_run for the same test identity).',
    'Identity key switched from test_file_path+test_name to test_full_title (VALIDATION found test_file_path holds non-test paths from at least one writer).',
    'ALTER PUBLICATION staged migration made idempotent.',
    'Added an explicit PRD requirement for an end-to-end synthetic-fire test, not just unit coverage of the query logic.',
  ],
};

const updatePayload = {
  key_changes,
  risks,
  metadata: {
    ...(existing?.metadata || {}),
    lead_decision: {
      ...(existing?.metadata?.lead_decision || {}),
      validation_findings,
    },
  },
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update(updatePayload)
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('Final VALIDATION-informed LEAD decision recorded for', SD_KEY);
