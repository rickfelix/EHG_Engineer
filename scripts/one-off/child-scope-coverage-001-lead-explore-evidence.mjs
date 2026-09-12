#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001, LEAD-TO-PLAN
 * phase. Persists the findings from a Task-tool Explore run (which alone does not write to
 * sub_agent_execution_results) via the canonical storeSubAgentResults writer.
 *
 * Scope question answered: whether other gates/paths share this defect class, whether the
 * fix's targeted code path (parent-orchestrator-handler.js) is actually live in production,
 * and whether any currently-blocked orchestrator SDs exist that this fix (plus the companion
 * backfill script, scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs)
 * resolves.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001';

const findings = [
  {
    id: 'no-other-gate-shares-the-identical-defect-shape',
    severity: 'INFO',
    summary: 'Only CHILD_SCOPE_COVERAGE computes parent-deliverable-vs-child-deliverable lexical coverage. Two structurally adjacent gates were checked and are NOT affected: OVERLAPPING_SCOPE_DETECTION (lead-to-plan/gates/overlapping-scope-detection.js) flags HIGH similarity between sibling SDs as duplication -- the opposite failure direction. CASCADE_ALIGNMENT (via lib in scripts/modules/governance/cascade-validator.js, wired at exec-to-plan/gates/cascade-alignment-gate.js) does parent/child keyword-overlap, but reads strategic_directives_v2.strategic_objectives/key_changes (LEAD-authored SD fields), not product_requirements_v2.functional_requirements -- not driven by parent-orchestrator-handler.js\'s 3 hard-coded FRs and not hit by this defect, though it would share the risk class if a parent\'s strategic_objectives were ever auto-populated with generic coordinator boilerplate.',
  },
  {
    id: 'parent-orchestrator-handler-generateParentPRD-is-live-not-dead-code',
    severity: 'HIGH',
    summary: 'Repo-wide grep for ParentOrchestratorHandler/generateParentPRD outside parent-orchestrator-handler.js itself returns nothing -- it is invoked only via its own CLI, not from any handoff executor (the automatic LEAD-TO-PLAN PRD path is add-prd-to-database.js, LLM-authored, with no orchestrator-specific branch). This initially read as dead code. Live DB evidence contradicts that: a direct query found 30 sd_scope_deliverables rows across 10 distinct orchestrator SDs (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001, vision-v2-chairman-os, SD-FOUNDATION-V3-000, SD-HARDENING-V2-000, SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001, SD-S17S19-LANDINGFIRST-BUILD-TRIM-ORCH-001, SD-DATADISTILL-LEO-ORCH-SPRINT-2026-SAAS-001 and its -H child, SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001, SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001) carrying deliverable_name values EXACTLY matching the 3 hard-coded titles this file emits ("Child SD Orchestration"/"Work Decomposition Structure"/"Progress Tracking") -- titles that occur nowhere else in the codebase. This confirms the function IS exercised in real orchestrator workflows (via manual CLI invocation per its documented usage), not abandoned tooling, and that this fix\'s scope is correctly targeted at a live, recurring defect class.',
  },
  {
    id: 'live-confirmed-blocking-instance-found-and-remediated',
    severity: 'HIGH',
    summary: 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001 (status deferred, current_phase EXEC, 100% progress) has a sd_phase_handoffs row: handoff_type=PLAN-TO-LEAD, status=rejected, rejection_reason="CHILD_SCOPE_COVERAGE validation failed - 2 parent deliverable(s) not covered by any child", created_at 2026-09-12T00:20:33Z -- roughly 1h before this fix was authored. Its 3 deliverable rows were exactly the coordination-template titles with metadata={"producer":"orchestrator_completion_guardian"} and no coordination_only key (predating this fix; extractAndPopulateDeliverables defaults skipIfExists:true so re-running PLAN-TO-LEAD alone would NOT retroactively tag them). Addressed: scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs was run --execute and backfilled metadata.coordination_only:true onto all 30 affected rows across all 10 orchestrators (verified: the guardian-set producer key was preserved via object-spread merge, not overwritten). This orchestrator (and the other 9) can now pass CHILD_SCOPE_COVERAGE on their next PLAN-TO-LEAD attempt.',
  },
  {
    id: 'no-other-consumer-of-coordination-only-or-metadata-collision',
    severity: 'INFO',
    summary: 'Repo-wide grep for "coordination_only" returns exactly 4 hits, all part of this fix (the gate, its test, extract-deliverables-from-prd.js, parent-orchestrator-handler.js). Other sd_scope_deliverables.metadata consumers use disjoint keys (auto_generated/source/producer in semantic-gate-utils.js and auto-complete-deliverables.js/orchestrator-completion-guardian.js) -- no naming collision or unintended interaction. SCOPE_AUDIT (which reads metadata.producer) is SKIP for sd_type=orchestrator per its own applicability matrix, so it never runs against these rows regardless.',
  },
];

const warnings = [
  'The gate\'s applicability check (getGateApplicability) defaults unlisted sd_type values to REQ (not SKIP), but the gate\'s own runtime auto-passes (score 100) whenever the parent has zero rows in strategic_directives_v2.parent_sd_id, so in practice it only produces a real (non-trivial) score for SDs that actually have children -- effectively orchestrator-only in behavior even though the applicability table technically defaults open.',
  'An orchestrator PRD authored through the OTHER live path (the automatic add-prd-to-database.js LLM generator, used for every sd_type including orchestrator when a human does not run parent-orchestrator-handler.js manually) would produce differently-phrased "coordinate the children" boilerplate that is neither identically-titled nor coordination_only-flagged. Such an SD would still hit the original CHILD_SCOPE_COVERAGE failure and this fix would not help it, since the hardened exclusion requires an exact name match against the 3 known titles. Out of scope for this SD (which targets exactly the QF\'s described 3-FR template defect); flagging as a residual gap PLAN or a follow-up may want to track.',
];

const recommendations = [
  'If LLM-authored orchestrator PRDs (via add-prd-to-database.js) are found to hit the same CHILD_SCOPE_COVERAGE failure in practice, a follow-up should either give that generator an orchestrator-specific coordination-only-tagged template (mirroring this fix) or make the gate detect coordinator-only phrasing more generally rather than relying on an exact title allowlist.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001 confirmed no other gate shares CHILD_SCOPE_COVERAGE\'s exact defect shape, and -- more importantly -- confirmed parent-orchestrator-handler.js\'s generateParentPRD is a LIVE code path (not dead code, despite having no automatic caller) via direct DB evidence: 30 sd_scope_deliverables rows across 10 real orchestrator SDs carry its exact 3 hard-coded titles. One of those, SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001, was found ACTIVELY BLOCKED at PLAN-TO-LEAD on this exact CHILD_SCOPE_COVERAGE failure (rejected ~1h before this fix was authored) with deliverable rows that predate the fix and would not be retroactively tagged by extraction alone (skipIfExists:true). A companion backfill script was written and executed, tagging all 30 affected rows across all 10 orchestrators with metadata.coordination_only:true (preserving existing metadata via merge), so this fix resolves both future orchestrators and the currently-live blocked instances. One residual gap noted for PLAN: orchestrator PRDs authored via the OTHER live path (the automatic LLM-based add-prd-to-database.js generator) are not covered by this fix\'s exact-title matching and could still hit an equivalent failure with different phrasing.';

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
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js',
        'scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js',
        'scripts/modules/governance/cascade-validator.js',
        'scripts/modules/handoff/executors/exec-to-plan/gates/cascade-alignment-gate.js',
        'scripts/modules/handoff/executors/exec-to-plan/gates/cross-child-integration-gate.js',
        'scripts/modules/parent-orchestrator-handler.js',
        'scripts/modules/handoff/extract-deliverables-from-prd.js',
        'scripts/modules/handoff/executors/lead-to-plan/prd-generation.js',
        'scripts/orchestrator-preflight.js',
        'scripts/modules/handoff/validation/semantic-gate-utils.js',
        'scripts/modules/handoff/auto-complete-deliverables.js',
        'scripts/modules/handoff/orchestrator-completion-guardian.js',
      ],
      re_execution_commands: [
        'node scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs (dry-run)',
        'node scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs --execute (applied: 30/30 rows)',
      ],
      quick_fixes_reviewed: ['QF-20260911-793 (escalated to this SD)'],
      live_db_findings: {
        orchestrator_sds_with_template_deliverables: 10,
        template_deliverable_rows_found: 30,
        rows_backfilled: 30,
        previously_blocked_sd: 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001',
      },
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
