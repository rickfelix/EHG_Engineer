#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H — Explore breadth search at LEAD-TO-PLAN.
 *
 * Records the findings from the Explore sub-agent run (Task tool, subagent_type=Explore)
 * into sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE's "Explore"
 * requirement -- the Explore agent itself does not write this row.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H';

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
  summary: "Breadth search across three questions. (1) Stale stage-number literals BEYOND the SD's named 5 sites: confirmed SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001 (PR #7628) already fixed the primary sites (gate-constants.js, stage-execution-worker.js MAX_STAGE, asset-view-gate.js, constraint-drift-detector.js, stage-contracts.js:705, launch-workflow/index.js, DB config rows) -- those are NOT stale. Found 5 additional still-stale sites the SD does not name: lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js:229 (telemetry stage_number:23, live-dispatched as stage 24 -- same defect class as the SD's named item 4, different file); lib/eva/stage-templates/analysis-steps/index.js:140 (a dead/unreachable duplicate dispatch registry, confirmed dead via stage-02.js:160-170's own docblock); lib/eva/lifecycle/bind-criterion-checker.js:26-30 (CANDIDATE_GATE_STRINGS hardcodes stage_number:19 and :24 for deployment/go-live content that is now live at stage 25 -- authored 2026-08-17/18, predates the 2026-08-28 renumber, and is live-consumed at :207,:223); scripts/governance-stages.js:20-49 (HARD_GATE_STAGES + PIPELINE_STAGES name table, already flagged stale by a prior RENUMBER-DRIFT-001 VALIDATION pass, still unchanged); scripts/monitor-venture-run.cjs:27-29 (KILL_GATES/BLOCKING_GATES sets keyed to stale stage 23 as the kill gate, now stage 24). (2) Full census of ventures.current_lifecycle_stage write sites: an existing maintained census already exists at docs/architecture/stage-advancement-path-census.md (v1.2.0) cross-checked against scripts/lint/stage-advancement-chokepoint-allowlist.json (a CI lint). Confirmed via fn_advance_venture_stage RPC (artifact-persistence-service.js:992, stage-advance-worker.js), a second differently-named advance_venture_stage RPC (reconciliation-packet-apply.mjs:106, 4 ehg-repo callers), direct .update() writes at stage-execution-worker.js:1377/1501/3420 and saga-coordinator.js:207 (allowlisted via stage_write_token self-stamp per SD-LEO-INFRA-STAGE-WRITER-CHOKE-001), and TWO OPEN BYPASSES already flagged in the census as unresolved: venture-ceo/handlers.js:663-671 (writes current_lifecycle_stage with zero artifact/gate check) and post-lifecycle-decisions.js:256-264 (writes the SEPARATE eva_ventures table's stage, can move backward, no gate check). The FR-7 refusing triggers (aaa_enforce_canonical_stage_write / zzz_enforce_canonical_stage_write_final) exist in database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql but that migration's own header shows @approved-by: PENDING -- CORRECTION to the companion VALIDATION agent's finding that this trigger is 'already armed': the migration file's header is unapplied per the migration-file-header-is-ceremony-marker convention; the trigger's LIVE armed status must be verified directly against the database, not inferred from the migration file existing in the repo. (3) Test coverage for stage-execution-worker.js's exit-status handling: zero test files anywhere assert on the arguments passed to _logStageTransition (grep for .toHaveBeenCalledWith / .mock on that method returns nothing) -- every test that touches it stubs it as an unchecked no-op. tests/unit/eva/stage-execution-worker.test.js:310-339 asserts on the function's RETURN VALUE (lastResult.status), a separate code path from the fire-and-forget _logStageTransition telemetry call -- this test provides no signal on X1 either way. X1's bug is UNCOVERED, not covered-wrong.",
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'HIGH',
      issue: "The companion VALIDATION agent reported the FR-7 refusing trigger (zzz_enforce_canonical_stage_write_final) as 'already armed' based on the migration file's existence in database/chairman-gated/. That directory's own convention (confirmed in this SD's own worktree via the ceremony README) is that a file's presence is a STAGED, NOT-YET-APPLIED marker, and the migration's own header literally reads '@approved-by: PENDING'. PLAN must independently verify the trigger's LIVE state via a direct read-only DB introspection query (e.g. querying pg_trigger for the trigger name), not trust either the file's presence or the migration header as proof of live enforcement.",
      evidence: 'database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql header: @approved-by: PENDING.',
      location: 'database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql',
    },
    {
      id: 'EXP-2',
      severity: 'MEDIUM',
      issue: 'Two additional stale-stage-literal sites beyond the SD-named 5 exist (bind-criterion-checker.js and monitor-venture-run.cjs) and are live-consumed, not dead code -- PLAN should decide whether to fold these into C5.1 scope or explicitly descope them with a written reason, since leaving them unaddressed means the "one stage identity" goal is not actually achieved by this SD alone.',
      evidence: 'lib/eva/lifecycle/bind-criterion-checker.js:26-30,207,223; scripts/monitor-venture-run.cjs:27-29.',
      location: 'lib/eva/lifecycle/bind-criterion-checker.js',
    },
  ],
  recommendations: [
    'PLAN: independently verify (read-only DB introspection, not file-presence inference) whether zzz_enforce_canonical_stage_write_final is actually live/armed before deciding C5.2 is already satisfied by prior work.',
    'PLAN: explicitly disposition the 5 additional stale-literal sites found here (in scope for C5.1, or written-reason descope) rather than silently leaving them unaddressed.',
    'PLAN: write a new test asserting the CORRECT status value reaches _logStageTransition/workflow_executions on a blocked/held/failed/killed exit for X1 -- no existing test provides any signal, so this is net-new coverage, not a fix to a wrong assertion.',
    'EXEC: confirmed no real file-overlap conflict with sibling PR #8912 (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I, still OPEN) -- its diff does not touch lib/eva/stage-execution-worker.js despite the SD metadata\'s not_before_reason citing that overlap; the not_before fence (2026-09-13T17:05:02Z) has also already passed. Safe to proceed without waiting further, but re-check gh pr diff 8912 --name-only again at EXEC time in case -I\'s scope changes before it merges.',
  ],
  detailed_analysis: {
    searched_identifiers: ['stage_number', 'stage23', 'stage24', 'CROSS_STAGE_DEPS', 'current_lifecycle_stage', 'fn_advance_venture_stage', 'advance_venture_stage', '_logStageTransition', 'HARD_GATE_STAGES', 'KILL_GATES'],
    searched_paths: [
      'lib/eva/ (broad)', 'lib/marketing/', 'lib/venture-*', 'scripts/governance-stages.js', 'scripts/monitor-venture-run.cjs',
      'docs/architecture/stage-advancement-path-census.md', 'database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql',
      'tests/ (grep for stage-execution-worker + _logStageTransition assertions)',
    ],
    sibling_pr_checked: { pr: 8912, sd_key: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I', touches_stage_execution_worker: false, state: 'OPEN', mergeStateStatus: 'BLOCKED' },
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/capa-001-h-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
