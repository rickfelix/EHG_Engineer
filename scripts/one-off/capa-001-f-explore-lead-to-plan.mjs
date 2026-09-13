#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F — Explore breadth search at LEAD-TO-PLAN.
 *
 * Records the findings from the Explore sub-agent run (Task tool, subagent_type=Explore)
 * into sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE's "Explore"
 * requirement -- the Explore agent itself does not write this row.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 90,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: "Mapped every chairman_decisions touch in lib/eva/stage-templates/analysis-steps/. stage-17-blueprint-review.js: createOrReusePendingDecision (lines 499-506, legitimate create/reuse-pending) stays untouched by C4.1; the ONLY literal .from('chairman_decisions') write is the self-approval UPDATE at lines 510-513 (status=approved/decision=approve/resolved_at=...) paired with a log line at 514, both inside the PASS branch of an if/else at line 508 -- nothing downstream reads decisionId or gateRecommendation after line 522, so removal is self-contained to lines 508-517/re-collapsing the PASS branch to the same pending-log the else branch already uses. Directory-wide sweep found only ONE other file touching this table: stage-22-distribution-setup.js, which only SELECTs (findApprovedSkipDecision line 429, findPendingBlockDecision line 453) and creates pending rows via an external helper (recordPendingDecision) -- it never self-approves. So the self-approval anti-pattern this SD's C4.1 targets exists ONLY in stage-17 today; a CI grep predicate should match the specific self-approval shape (update ... status:'approved'/decision:'approve' against chairman_decisions), not a blanket no-writes-at-all rule, or it would false-positive on stage-22's legitimate pending-decision creates. For C4.3: identified 3 test files exercising stage-23-launch-readiness.js directly (stage-23-launch-readiness-fr1-4-6.test.js, -fr7-category-coverage.test.js, -telemetry-analytics.test.js); confirmed NONE assert the literal string 'chairman attestation suffices' for analytics or monitoring, and none touch the default: branch (lines 338-346) where monitoring currently lands -- so wiring a real monitoring producer into its own case would not break any existing assertion. Documented the shared buildMockSupabase(...) fixture pattern (chainable .from(table){...} branches keyed by table name, throw on unexpected table) used across all three test files so a new monitoring-producer test can match it.",
  critical_issues: [],
  warnings: [],
  recommendations: [
    "PLAN: scope C4.1's CI grep predicate to the self-approval shape specifically (chairman_decisions + status:'approved'/decision:'approve'), not a blanket ban on writes to chairman_decisions -- stage-22-distribution-setup.js's legitimate pending-decision reads/creates must not false-positive.",
    "PLAN: for C4.1, when removing stage-17's PASS-branch self-approval block (lines 508-517), collapse the PASS branch to the same 'chairman decision pending' log the else branch already emits (line 515-516) rather than leaving an empty branch -- createOrReusePendingDecision's already-created decisionId is not read again downstream.",
    "EXEC: wire the new monitoring producer as its own explicit case 'monitoring': in stage-23-launch-readiness.js's checklist switch (pulled out of the generic default: at lines 338-346), and extend the shared buildMockSupabase fixture pattern in a new/existing test file rather than inventing a new mock shape.",
  ],
  detailed_analysis: {
    searched_identifiers: ['chairman_decisions', 'createOrReusePendingDecision', 'findApprovedSkipDecision', 'findPendingBlockDecision', 'recordPendingDecision', 'chairman attestation suffices', 'buildMockSupabase'],
    searched_paths: [
      'lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js',
      'lib/eva/stage-templates/analysis-steps/ (full directory sweep)',
      'lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js',
      'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
      'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js',
      'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr7-category-coverage.test.js',
      'tests/unit/eva/stage-templates/stage-23-launch-readiness-telemetry-analytics.test.js',
    ],
    self_approval_anti_pattern_scope: 'stage-17-blueprint-review.js only (confirmed sole occurrence directory-wide)',
  },
  metadata: {
    breadth_search: true,
    exhaustive: true,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/capa-001-f-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
