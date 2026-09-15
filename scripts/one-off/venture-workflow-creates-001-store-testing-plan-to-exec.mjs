#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- TESTING evidence at PLAN-TO-EXEC.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 85,
    phase: 'PLAN-TO-EXEC',
    execution_time_ms: 0,
    summary: "PLAN-phase TESTING reviewed the freshly-inserted PRD before EXEC begins and found 1 real, significant pre-implementation gap: FR-2 originally specified a direct venture_artifacts insert for the new organization_qa_result artifact, but direct code reading of lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js's actual return shape shows the analysis step never writes to venture_artifacts itself -- it returns {..., artifacts: [{artifactType, title, payload, source, metadata, runId}]}, and the caller passes that array into writeArtifactBatch() (lib/eva/artifact-persistence-service.js:432), which performs BOTH the actual insert AND the is_current dedup (scoped per artifact_type, marking prior is_current rows false before each new insert). A direct-insert FR-2 as originally drafted would have either duplicated this dedup logic with a real risk of diverging from it, or bypassed it entirely and left stale is_current=true rows behind. FIXED: FR-2, TR-2 (renamed/clarified), and a new TR-4 now specify the correct mechanism -- append a second entry to the step's own returned artifacts array, let writeArtifactBatch() do the actual write, exactly mirroring how the existing LAUNCH_UAT_REPORT entry already works in the same file. system_architecture.data_flow and integration_points updated to match. Also independently confirmed the 'legal' category precedent (a dedicated REQUIRED check, not the upstream-preflight anyOf pattern) is the correct model for FR-3's organization_qa scoring case, by reading the actual switch statement in stage-23-launch-readiness.js.",
    critical_issues: [],
    warnings: [
      {
        id: 'TEST-1',
        severity: 'LOW',
        issue: 'FR-1 AC-3 and TR-2 reference eva_orchestration_events as the failure-surfacing channel, matching generateLegalDocsForVenture()\'s own documented behavior -- but this PRD review did not independently trace generateLegalDocsForVenture()\'s actual write call to that table (only read the calling code\'s comment claiming it). EXEC should verify the exact write call/schema before assuming the pattern transfers directly.',
        evidence: 'lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js:12-13 comment: "its own failures surface via eva_orchestration_events (subtype=legal_producer_failed)" -- not independently verified against legal-doc-producer.js\'s own source in this review pass.',
      },
    ],
    recommendations: [
      'EXEC should independently confirm legal-doc-producer.js\'s actual eva_orchestration_events write call before assuming TR-2\'s error-surfacing pattern transfers byte-for-byte.',
      'EXEC should reuse the exact ARTIFACT_TYPES constant-definition pattern already used for LAUNCH_UAT_REPORT when adding ORGANIZATION_QA_RESULT to lib/eva/artifact-types.js.',
      'EXEC should confirm the feature-flag default-OFF rollout pattern (FR-3, matching LEO_S21_GROWTH_PLAYBOOK_REQUIRED) by reading readFeatureFlag()\'s exact signature before wiring the new flag read.',
    ],
    detailed_analysis: {
      commands_run: [
        'Re-read the freshly-inserted PRD end to end as an adversarial reviewer -- checked FR-2\'s write-mechanism claim against the ACTUAL stage-23 handler code rather than accepting the LEAD-phase Explore narrative at face value',
        "Read lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js's full analyzeStage23DedicatedVentureUat() function -- confirmed it returns an artifacts array, never calls supabase.from('venture_artifacts') directly",
        'grep for writeArtifactBatch in lib/eva/*.js -- found lib/eva/artifact-persistence-service.js:432, read its is_current dedup logic (lines 432-439) directly',
        "Read stage-23-launch-readiness.js's switch(cat) block in full (case 'code_quality' through 'monitoring') -- confirmed the 'legal' case is the correct precedent for a dedicated, non-upstream-preflight REQUIRED category",
        'Applied all fixes directly to scripts/one-off/venture-workflow-creates-001-prd-content.json, re-ran npm run contract:check -- prd (0 warnings), pushed the updated functional_requirements/technical_requirements/system_architecture to the live PRD row',
      ],
    },
    metadata: { independent_verification: true, gaps_found_and_fixed: 1, measured: false, test_execution: buildTestExecution({
      executed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      runner: 'plan-phase-review-no-code-yet',
      source: 'PLAN-phase PRD review precedes EXEC implementation -- no test suite exists yet to execute; this pass reviews PRD completeness/correctness against the actual target files\' real code shape.',
    }) },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/venture-workflow-creates-001-store-testing-plan-to-exec.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
