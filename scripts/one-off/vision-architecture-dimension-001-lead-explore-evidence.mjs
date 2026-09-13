#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001,
 * LEAD-TO-PLAN phase.
 *
 * Records the dedup check and consumer survey run via the Explore agent before LEAD approval:
 * confirms the positional-dimension-id defect is real, unclaimed, and enumerates every live
 * V-/A-code consumer plus the evidence-rubrics/index.js dead-vs-live status.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001';

const findings = [
  {
    id: 'defect-confirmed-v03-v04-reversal',
    severity: 'HIGH',
    summary: "Confirmed on main: scripts/archive/202606-reachability-sweep/eva/evidence-rubrics/ names V03=analysisstep-active-intelligence.js and V04=decision-filter-engine-escalation.js, while docs/architecture/vision-gap-analysis.md (grep 'VGAP-V0') names VGAP-V03=decision_filter_engine_escalation and VGAP-V04=analysisstep_active_intelligence -- the exact reverse mapping the SD description claims. scripts/eva/vision-scorer.js dimensionsToCriteria (around line 200-206) assigns `${prefix}${String(i+1).padStart(2,'0')}` purely from extracted_dimensions array index with no persisted stable id.",
  },
  {
    id: 'not-a-duplicate-of-open-work',
    severity: 'INFO',
    summary: "No competing SD claims this fix. extracted_dimensions schema (docs/reference/schema/engineer/tables/eva_vision_documents.md, eva_architecture_plans.md) is still plain jsonb [{name,weight,description}] with no id field; no migration under database/migrations/ adds one. A second, independently-measured specimen of the same defect class (PAT-LES-8b992a608975, a V07/V08 mismatch, recorded in scripts/one-off/sd-learn-149-lead-explore-evidence.mjs / sd-learn-149-scope-reduction.mjs) was explicitly deferred as 'a separate, small correction' and never picked up by any SD -- corroborates this is a real, recurring, still-open defect class, not a one-off.",
  },
  {
    id: 'consumer-survey-complete',
    severity: 'HIGH',
    summary: 'All 8 consumer files named in the SD scope exist under lib/eva/. Three carry real runtime coupling to a hardcoded V-code literal in their module-info object: cli-authority-tracker.js (line ~185, dimension:"V06"), cli-write-gate.js (line ~194, dimension:"V06"), compute-posture-scorer.js (line ~118, dimension:"V07"). Five carry comment-only provenance references with no runtime parse/compare logic: chairman-dashboard-scope.js, chairman-sla-enforcer.js, chairman-governance-panels.js, concurrent-venture-orchestrator.js, artifact-versioning.js.',
  },
  {
    id: 'evidence-rubrics-index-is-live-not-dead',
    severity: 'HIGH',
    summary: "scripts/eva/evidence-rubrics/index.js is NOT dead code (the SD scope's item (4) had hedged 'or delete the dead index.js'). It is imported by lib/eva/rubric-generator.js and scripts/eva/vision-evidence-scorer.js (selectRubricMap). Its loadAllRubrics() does readdirSync on its own directory matching ^(V\\d{2}|A\\d{2}|T\\d{2})- -- since only index.js remains there (the V01-V11/A01-A07/T01-T02 rubric files were moved to scripts/archive/202606-reachability-sweep/eva/evidence-rubrics/), it silently returns an empty rubric Map at runtime for every live call. This changes the PLAN-phase decision for scope item (4): restoring the archived files (renamed to the new stable ids) is the only option that doesn't require also auditing/patching both live callers' empty-map handling.",
  },
];

const warnings = [
  'No backlog items and no existing-infrastructure semantic-search matches (VALIDATION sub-agent, CONDITIONAL_PASS) -- expected for a directly-measured harness defect whose scope is fully defined by the sourcing signal, not by a backlog entry.',
];

const recommendations = [
  'PLAN should author a PRD with FRs matching the 5 scope items, and record the rubric decision (restore from archive under new ids, given index.js is confirmed live) with the evidence above as rationale.',
  'PLAN should scope the consumer-audit FR to the 3 runtime-coupled files (cli-authority-tracker.js, cli-write-gate.js, compute-posture-scorer.js) as MIGRATE and the 5 comment-only files as EXEMPT (reason: provenance comment only, no runtime V-code parsing) rather than treating all 8 identically.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001 confirmed the positional-dimension-id defect is real (verified the V03/V04 reversal between the archived rubric and docs/architecture/vision-gap-analysis.md), unclaimed by any other SD, and corroborated by a second deferred specimen (PAT-LES-8b992a608975). Enumerated all 8 named consumer files (3 runtime-coupled, 5 comment-only) and established that scripts/eva/evidence-rubrics/index.js is live code currently returning an empty rubric map, not dead code -- informing the PLAN-phase rubric decision.';

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
        'scripts/eva/vision-scorer.js',
        'scripts/archive/202606-reachability-sweep/eva/evidence-rubrics/',
        'docs/architecture/vision-gap-analysis.md',
        'scripts/eva/evidence-rubrics/index.js',
        'lib/eva/rubric-generator.js',
        'scripts/eva/vision-evidence-scorer.js',
        'lib/eva/cli-authority-tracker.js',
        'lib/eva/cli-write-gate.js',
        'lib/eva/compute-posture-scorer.js',
        'lib/eva/chairman-dashboard-scope.js',
        'lib/eva/chairman-sla-enforcer.js',
        'lib/eva/chairman-governance-panels.js',
        'lib/eva/concurrent-venture-orchestrator.js',
        'lib/eva/artifact-versioning.js',
        'scripts/one-off/sd-learn-149-lead-explore-evidence.mjs',
      ],
      specimens_reviewed: ['PAT-LES-a773150263e6', 'PAT-LES-8b992a608975'],
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
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
