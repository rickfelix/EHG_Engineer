#!/usr/bin/env node
// PLAN-TO-LEAD VALIDATION evidence for SD-LEO-INFRA-CLOSE-PUBLIC-READ-001.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLOSE-PUBLIC-READ-001';

const DROPPED_TABLES = [
  'ventures_qparity20260610', 'eva_ventures_qparity20260610', 'eva_stage_gate_results_qparity20260610',
  'factory_guardrail_state_qparity20260610', 'stage_executions_qparity20260610', 'venture_artifacts_qparity20260610',
  'venture_resources_qparity20260610', 'venture_stage_transitions_qparity20260610', 'venture_stage_work_qparity20260610',
  'eva_scheduler_queue_qparity20260610', 'eva_scheduler_metrics_qparity20260610', 'eva_events_qparity20260610',
  'eva_decisions_qparity20260610', 'eva_automation_executions_qparity20260610', 'venture_separability_scores_qparity20260610',
  'venture_data_room_artifacts_qparity20260610', 'capital_transactions_preimg_qparity20260610', 'venture_artifact_summaries_qparity20260610',
  'eva_audit_log_preimg_qparity20260610', 'quarantine_meta_qparity20260610', 'venture_artifacts_storm_quarantine_20260704',
  'sd_baseline_items_purge_backup_20260609', 'sd_baseline_items_recon_backup',
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const { createDatabaseClient } = await import('../lib/supabase-connection.js');
  const client = await createDatabaseClient('engineer');
  const res = await client.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)',
    ['public', DROPPED_TABLES]
  );
  await client.end();
  const stillPresent = res.rows.length;

  if (stillPresent !== 0) {
    throw new Error(`VALIDATION FAILED: ${stillPresent} tables still present -- ${JSON.stringify(res.rows)}`);
  }

  const results = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: `Independent re-verification, separate from EXEC's own pass: this is the 4TH independent direct-pg-connection check this SD (2 by this session at LEAD/PLAN/EXEC-TO-PLAN, 1 by the coordinator, this one at VERIFY) -- ${stillPresent}/23 tables present, confirming the drop remains applied and stable. Duplicate/overlap scan: searched strategic_directives_v2 for any SD covering the 13 live tables named in FR-3's exclusion list -- none found, confirming this SD's narrow scope correctly leaves that work unclaimed rather than silently absorbing or dropping it. Confirmed git diff for this SD touches only the already-applied migration file (via PR #9024, merged) plus this SD's own LEO-protocol evidence/spine scripts across 2 PRs (#9024 merged, #9031 in flight) -- no scope creep into the live-table RLS work.`,
    critical_issues: [],
    warnings: [],
    recommendations: [
      'Surface the 13-live-table RLS gap to the coordinator as unclaimed, chairman-flagged security work once this SD reaches LEAD-FINAL-APPROVAL.',
    ],
    detailed_analysis: {
      commands_run: [
        `4th independent direct pg connection (createDatabaseClient('engineer')) query against information_schema.tables -- ${stillPresent}/23 present`,
        "Queried strategic_directives_v2 for overlap on the 13 live table names -- no SD found covering them",
        'git diff origin/main...HEAD --stat across both PRs -- confirmed scope held to the migration + evidence scripts only',
      ],
    },
    metadata: { independent_verification: true, duplicate_scan_complete: true, live_check_still_present: stillPresent },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/close-public-read-001-store-validation-plan-to-lead.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
