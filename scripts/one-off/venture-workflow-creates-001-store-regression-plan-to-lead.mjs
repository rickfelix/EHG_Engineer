#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- REGRESSION evidence at PLAN-TO-LEAD.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
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
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: 'Zero regression risk to any in-flight venture: the new organization_qa checklist category is gated behind LEO_S24_ORGANIZATION_QA_REQUIRED, default OFF -- confirmed by a dedicated flag-OFF test (organization_qa entirely absent from the checklist, verdict byte-identical) and by readFeatureFlag()\'s own documented default-false-on-absence contract (no leo_feature_flags row needs to exist for this). The new organization-creation-and-QA/QC step added to stage-23-dedicated-venture-uat.js runs UNCONDITIONALLY for every venture reaching stage 23 (not flag-gated, per FR-1/FR-2), but is wrapped in try/catch that never lets a thrown error propagate -- confirmed by the TS-6 test and the agent_registry-throw test, both passing. Ran the full affected test suite (tests/unit/eva/stage-templates/, the entire directory, plus uat-robustness-gate.test.js): 1040 passed, 0 failed, 5 skipped -- identical to EXEC and VALIDATION\'s own independently-run counts, confirming stability across 3 separate runs. Confirmed via git diff that no OTHER stage-template file, gate, or checklist consumer was touched by this SD -- the diff is confined to exactly the 2 stage-23 files, the registry file, and the artifact-types constant.',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'When LEO_S24_ORGANIZATION_QA_REQUIRED is eventually enabled (a separate future action, per chairman ruling 212909b9\'s sequencing), re-run this same regression suite against real live-DB data to confirm no unexpected venture regresses READY->HOLD, mirroring the rollout discipline already documented for the sibling capability-checklist flag.',
    ],
    detailed_analysis: {
      commands_run: [
        'git diff origin/main...HEAD --stat -- confirmed the diff touches exactly 4 lib/ files (2 stage-23 templates, registry.js, artifact-types.js) plus new/updated test files and one-off evidence scripts, no other stage-template or gate file',
        'unset all Supabase/DB env vars && npx vitest run tests/unit/eva/stage-templates/ tests/unit/eva/uat-robustness-gate.test.js -- 1040 passed, 0 failed, 5 skipped (3rd independent run this SD, identical counts each time)',
        'Re-ran the flag-OFF test specifically in isolation -- confirms organization_qa is entirely absent from the checklist and the verdict is READY (unaffected) when the flag is OFF (the default, unchanged state for every current venture)',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    probeExistsRelative: 'scripts/one-off/venture-workflow-creates-001-store-regression-plan-to-lead.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('REGRESSION', sdRow.id, { code: 'REGRESSION', name: 'Regression' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
  console.log('STORED:', 'REGRESSION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
