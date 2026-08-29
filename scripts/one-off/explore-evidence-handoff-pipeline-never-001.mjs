#!/usr/bin/env node
/**
 * Explore sub-agent evidence writer — SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001, LEAD_TO_PLAN gate.
 *
 * Independently re-verified every mechanism claim in the SD spine against COMMITTED content in
 * this worktree's HEAD (branch feat/SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001, based on origin/main)
 * and against a live read-only query of the strategic_directives_v2_status_check CHECK
 * constraint. Did not trust the filing's line numbers — re-grepped each file fresh.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001';

const FINDINGS = [
  'FR-2 CONFIRMED — scripts/modules/handoff/executors/plan-to-lead/index.js:389 is exactly '
    + "`.eq('parent_sd_id', sdId)`, where sdId is the raw, unnormalized positional argument (can be "
    + 'either sd_key or UUID depending on caller). The same file already uses the defensive '
    + '`sd?.id || sdId` idiom elsewhere in this function for the PRD lookup.',
  'FR-1/FR-3 CONFIRMED — scripts/modules/handoff/executors/BaseExecutor.js:429-437 '
    + '(validationContext object literal) contains exactly the keys sdId, sd_id, sd, prd, prdId, '
    + 'options, supabase, gitContext, handoffType — there is NO sdKey key anywhere in this object. '
    + "db-content-parity-gate.js:157 is exactly `const sdKey = ctx.sdKey || ctx.sdId;` — since "
    + 'ctx.sdKey is always undefined, this always resolves to the raw ctx.sdId, and '
    + "validateDbContentParity()'s `.eq('sd_key', sdKey)` (line ~104) silently returns zero rows "
    + 'whenever ctx.sdId happens to be a UUID.',
  'FR-4 CONFIRMED — db-content-parity-gate.js:176 tags the lookup-failure branch with the literal '
    + "`failure_category: 'db_content_drift'`, the SAME category used for a genuine code/DB "
    + 'mismatch — an ID-form miss is indistinguishable from real drift to every downstream reader.',
  'FR-5 CONFIRMED VIA LIVE READ-ONLY DB QUERY, not just source inspection — queried '
    + "pg_get_constraintdef for strategic_directives_v2_status_check directly (read-only SELECT "
    + "against pg_constraint via the direct Postgres client, no writes): the allowed status values "
    + "are ('draft','active','in_progress','planning','review','pending_approval','completed',"
    + "'deferred','cancelled') — 'blocked' is NOT a member. skip-and-continue.js's "
    + ".update({status:'blocked', ...}) (~line 136) is therefore GUARANTEED to raise a Postgres "
    + "23514 check-violation on every call, whose error message does not contain the substring "
    + "'0 rows' — so it always falls through to the generic console.warn + {success:false} branch "
    + "(~line 148-151), never the '0 rows' false-success branch. Confirms the entire blocked-SD "
    + 'tracking feature (blocked_reason/blocked_by_gate/can_unblock/correlation_id in metadata) is '
    + 'dead by construction, exactly as filed.',
  'FR-2 asymmetry note CONFIRMED — scripts/modules/handoff/executors/plan-to-lead/'
    + 'state-transitions.js:419 (completeOrchestratorSD) calls '
    + '`await normalizeSDId(supabase, sdId)` before using it; the orchestrator-detection query at '
    + 'index.js:389 does not. The consumer normalizes, the detector does not — matches the filed '
    + 'asymmetry exactly.',
  'TEST-COVERAGE CLAIM CONFIRMED — tests/integration/plan-to-lead-db-content-parity-audit.test.js '
    + 'is 43 lines, readFileSync()s the gate source and regex-matches text (never imports or calls '
    + 'validateDbContentParity), and its own assertion at line 25 '
    + "(expect(src).toMatch(/failure_category:\\s*'db_content_drift'/)) PINS the FR-4 "
    + 'misclassification as expected behavior. This test will need updating as part of the fix, '
    + 'not treated as behavioral protection.',
  'NON-GOAL TRAP VERIFIED — grepped for other status:\'blocked\' writers: '
    + 'lib/handoff/HandoffRecorder.js:665 writes status=\'blocked\' to sd_phase_handoffs (a '
    + 'DIFFERENT table with its own, different CHECK constraint that does permit \'blocked\' — '
    + '1,133+ live rows use it validly). A blanket grep-and-fix would have broken this table; the '
    + 'filed scope is correctly restricted to strategic_directives_v2 writers only.',
];

const SUMMARY = 'Explore LEAD_TO_PLAN verdict: PASS. All five FRs mechanism claims (FR-1 through '
  + 'FR-5) independently re-verified against committed worktree HEAD content with fresh greps '
  + '(not the filing\'s own line numbers taken on faith), plus one claim (FR-5, the CHECK '
  + "constraint) verified via a live read-only DB query rather than source inspection alone. "
  + 'The recurrence-census framing (6th instance of one class, five prior point-fixes) and the '
  + 'explicit non-goal trap (HandoffRecorder.js status=\'blocked\' writes to a different, valid '
  + 'table) both hold up under independent check. Sizing (180-240 LOC, Tier 3) is consistent with '
  + 'touching 5 files plus new behavioral tests where the existing integration test is a pure '
  + 'source-pin. No new defects found during this review; filing is unusually rigorous and holds.';

async function main() {
  const supabase = await getSupabaseClient();

  const results = {
    verdict: 'PASS',
    confidence: 92,
    summary: SUMMARY,
    findings: FINDINGS,
    warnings: [
      'tests/integration/plan-to-lead-db-content-parity-audit.test.js line 25 pins the current '
        + 'misclassification and MUST be updated (not just left green) as part of FR-4\'s fix, per '
        + 'the SD\'s own explicit instruction.',
    ],
    recommendations: [
      'Implement a shared ID-resolution helper consumed by both plan-to-lead/index.js:389 and '
        + 'db-content-parity-gate.js:157 (FR-1), rather than two independent point-fixes, to close '
        + 'the class rather than produce a 6th instance-specific patch.',
      'Give the ID-lookup-failure branch in db-content-parity-gate.js a distinct '
        + "failure_category (e.g. 'id_resolution_error') separate from 'db_content_drift' (FR-4), "
        + 'so the two remain distinguishable to every downstream reader (bypass-rubric.js included).',
    ],
    validation_mode: 'prospective',
    metadata: {
      recorded_by: 'scripts/one-off/explore-evidence-handoff-pipeline-never-001.mjs',
      assessment_type: 'lead_phase_due_diligence',
      target_branch: 'feat/SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001',
      files_read: [
        'scripts/modules/handoff/executors/plan-to-lead/index.js',
        'scripts/modules/handoff/executors/BaseExecutor.js',
        'scripts/modules/handoff/gates/db-content-parity-gate.js',
        'scripts/modules/handoff/skip-and-continue.js',
        'scripts/modules/handoff/executors/plan-to-lead/state-transitions.js',
        'tests/integration/plan-to-lead-db-content-parity-audit.test.js',
        'lib/handoff/HandoffRecorder.js',
      ],
      live_db_query_run: "SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'strategic_directives_v2' AND contype = 'c' AND conname ILIKE '%status%' (read-only)",
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'EXPLORE',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('EXPLORE', SD_KEY, null, results, {
    phase: 'LEAD_TO_PLAN',
  });

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nEXPLORE evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
