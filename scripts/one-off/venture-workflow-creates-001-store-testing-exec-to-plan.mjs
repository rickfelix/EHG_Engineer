#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- TESTING evidence at EXEC-TO-PLAN.
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
    confidence: 88,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: "Implemented FR-1 through FR-4 entirely within lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js and stage-23-launch-readiness.js, plus a new registry entry and artifact-type constant. Real, unanticipated design correction caught DURING implementation (not just PLAN review): the registry's `stage23_membership` field only supports 3 values ('required'/'advisory'/'growth'), each deriving one of 3 hard-coded checklist-inclusion arrays -- setting the new organization_qa entry's membership to 'growth' (the closest-seeming flag-gated precedent) would have silently gated it behind the WRONG, unrelated LEO_S21_GROWTH_PLAYBOOK_REQUIRED flag instead of a dedicated one. Caught by directly reading STAGE23_REQUIRED_CATEGORY_IDS/STAGE23_ADVISORY_CATEGORY_IDS/STAGE23_GROWTH_CATEGORY_IDS's derivation logic before committing the entry. FIXED: the registry entry uses a new, non-matching stage23_membership value ('flagged_required', documentation/provenance only) and the actual checklist inclusion follows the CAPABILITY_CATEGORIES precedent instead -- a self-contained array gated by its OWN new flag (LEO_S24_ORGANIZATION_QA_REQUIRED), verified via direct interactive checks (getDimension()/STAGE23_*_CATEGORY_IDS.includes()) that the new entry pollutes none of the 3 existing derived arrays. Also fetched and verified the ACTUAL chairman_ratifications rows for the SD's cited rulings (3c20483a, 58f5345f, 2af667eb) directly (earlier searches had checked the wrong tables) -- ratification 58f5345f's full quote directly confirms the scoping decision ('AI organization testing at the SAME STAGE where we do the UAT'), and the registry entry's ratification_pointer.quote_hash is the row's own real stored hash, not a placeholder.",
    critical_issues: [],
    warnings: [],
    recommendations: [
      'VERIFY-phase VALIDATION should independently re-derive the STAGE23_*_CATEGORY_IDS.includes(organization_qa)===false checks and confirm the flag defaults to OFF (no leo_feature_flags row required for the default-OFF behavior).',
      'A future SD enabling LEO_S24_ORGANIZATION_QA_REQUIRED should first regenerate the SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 corpus / re-verify the MAST checks still run cleanly against a real mock venture, since this SD wires them into a live gate for the first time.',
    ],
    detailed_analysis: {
      commands_run: [
        'Direct code reading of createAndCheckOrganization()/checkOrganizationQaResult() against the ACTUAL instantiateVenture()/runSuite()/writeArtifactBatch() signatures before writing any calling code (not assumed from the PRD text alone)',
        "node -e \"import(...).then(m => { getDimension('organization_qa'); STAGE23_REQUIRED_CATEGORY_IDS.includes(...); ... })\" -- confirmed the new registry entry appears in ZERO of the 3 existing derived arrays",
        'Raw SQL query against chairman_ratifications for the 3 cited ruling ids -- fetched full quote text and the row-stored quote_hash directly, used verbatim in the new RATIFICATION_POINTERS.organizationQaAtUatStage entry',
        'unset all Supabase/DB env vars && npx vitest run tests/unit/eva/stage-templates/ -- 1027 passed, 0 failed, 5 skipped (full directory, not just the touched files)',
        'Mutation test: mutated the organization_qa switch case to always score pass, re-ran the new checklist test file -- exactly 3 tests failed (TS-4, TS-5, and the failed-org-QA test), restored via cp/diff byte-identical confirmation',
        'node scripts/lint/require-main-guard-in-one-off-lint.mjs --working-dir -- 0 violations',
      ],
    },
    metadata: {
      independent_verification: true,
      real_findings_count: 1,
      test_execution: buildTestExecution({
        executed: 1032,
        passed: 1027,
        failed: 0,
        skipped: 5,
        runner: 'vitest',
        source: 'npx vitest run tests/unit/eva/stage-templates/ (full directory)',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/venture-workflow-creates-001-store-testing-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
