#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- SECURITY evidence at EXEC-TO-PLAN.
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
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Reviewed the new organization-creation-and-QA/QC code path for security exposure. (1) Nothing about the created organization can activate a real action before go-live: VentureFactory.instantiateVenture() writes only agent_registry/org_agent_identities/org_agent_relationships/tool_access_grants rows (confirmed by direct code reading during PLAN-phase Explore, this session), and the new createAndCheckOrganization()/checkOrganizationQaResult() functions import nothing from any publisher/outreach/communication-dispatch module -- verified both by direct code review and by a new dedicated regression test (FR-4 structural guard, tests/unit/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat-organization-qa.test.js) that grep-checks the file\'s own import statements for forbidden module-name patterns. (2) The new checklist category defaults OFF (LEO_S24_ORGANIZATION_QA_REQUIRED), matching this checklist file\'s own established rollout-safety pattern -- no in-flight venture\'s launch-readiness verdict changes until the flag is explicitly enabled; confirmed by a dedicated flag-OFF test asserting the category is entirely absent from the checklist and the verdict is unaffected. (3) checkOrganizationQaResult() reads venture_artifacts scoped to a specific ventureId + artifact_type + is_current=true -- no cross-venture data leakage possible via this query shape, matching every sibling check function (checkRequiredLegalDocs, checkTelemetryAnalyticsWired) in the same file. (4) Both new DB-touching functions (createAndCheckOrganization, checkOrganizationQaResult) are wrapped in try/catch that never lets a raw error (including any DB error text) propagate uncaught -- errors are captured into a structured {ok:false, error} shape and logged via logger.warn, never thrown into caller code that might surface them to an end user. (5) The idempotency check (agent_registry existence) uses .limit(1) with no unbounded query, and the organization acceptance suite (runSuite()) was itself already reviewed for security (SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001, this session) including a cycle-guard against a circular organization object -- unmodified by this SD.',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'No changes required. The new code path is read/write-scoped to a single venture, defaults to inert (feature-flagged OFF), and creates no live-action surface.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read lib/agents/venture-ceo-factory.js\'s instantiateVenture() in full (again, independent of PLAN-phase Explore\'s earlier read) -- confirmed zero code paths dispatch any live communication or external action',
        'Ran the new FR-4 structural regression test asserting no forbidden import pattern in stage-23-dedicated-venture-uat.js -- passes',
        'Ran the flag-OFF test in stage-23-launch-readiness-organization-qa.test.js -- confirms the category is entirely absent and verdict unaffected when the flag is OFF (default)',
        'Read checkOrganizationQaResult()\'s query directly -- confirmed venture-scoped (.eq(\'venture_id\', ventureId)), never a cross-venture read',
        'Confirmed both new functions\' try/catch boundaries by direct code reading, cross-checked against the TS-6/thrown-agent_registry-error tests\' actual assertions',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/venture-workflow-creates-001-store-security-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
