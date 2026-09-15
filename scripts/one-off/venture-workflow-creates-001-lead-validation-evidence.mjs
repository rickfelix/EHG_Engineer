#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- VALIDATION evidence at LEAD-TO-PLAN.
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
    confidence: 80,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "Duplicate/overlap scan clean, and Explore's live-state premise independently re-verified with an exact match. (1) Independent re-query of venture_stages (separate process from Explore) confirms stage 23=dedicated_venture_uat, 24=launch_readiness_gate(kill), 25=go_live(promotion) -- byte-identical to Explore's figures. (2) Independently re-read stage-23-launch-readiness.js's own header comment citing 'live Stage 24' -- corroborates the file/DB stage-number misalignment finding from a second, independent read. (3) Duplicate scan: strategic_directives_v2 title/description search for organization-creation/venture-workflow/stage-23/stage-24 returned only SD-LEO-INFRA-REMOVE-EVERY-BINDING-001 (a genuinely different concern -- removing pre-go-live agent stage bindings, not creating an organization) and this SD's own row; no active duplicate of this SD's specific scope. (4) gh pr list search for organization-qa/venture-workflow-creates/stage-23-dedicated-venture-uat returned no open PR touching this scope. (5) Confirmed both cited prerequisite SDs are genuinely complete on main: SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 (PR #9013, merged) and SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 (PR #9007, merged) -- both verified via direct strategic_directives_v2 status=completed query, not assumed from memory.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'MEDIUM',
        issue: "Confirms Explore's EXP-1: no existing chairman_decisions/feedback row was found recording Solomon has already made the stage-placement call for THIS SD specifically. The LEAD scoping decision to implement within existing stages (avoiding the reserved decision rather than resolving it) is reasonable and well-grounded, but remains an inference from the SD's literal success-criteria text, not a confirmed sign-off. Already signaled to the coordinator (spec-conflict signal 7ab3945a) for awareness -- not re-raised as a NEW finding here, just independently corroborated.",
        evidence: 'chairman_decisions and feedback tables searched by the cited ruling id prefixes (3c20483a, 58f5345f, 2af667eb) -- zero matches in either table via this VALIDATION pass, independent of Explore\'s own search.',
      },
    ],
    recommendations: [
      'PLAN should proceed with the within-existing-stages PRD design as scoped -- it is well-grounded and does not foreclose a future dedicated-stage decision.',
      'If the coordinator or a later reviewer surfaces an existing Solomon decision on stage placement this session could not find, PLAN/EXEC should re-verify the scoping decision against it before merge.',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent re-query (separate process) of venture_stages for stages 22-26 -- exact match to Explore\'s figures',
        "Independent re-read of stage-23-launch-readiness.js's header comment -- corroborates the file/DB stage-number misalignment",
        'Queried strategic_directives_v2 for title/description overlap on organization-creation/venture-workflow/stage-23/stage-24 -- 1 unrelated result (SD-LEO-INFRA-REMOVE-EVERY-BINDING-001), no duplicate',
        'gh pr list --search "organization-qa OR venture-workflow-creates OR stage-23-dedicated-venture-uat" --state open -- zero results touching this scope',
        'Direct DB status check confirming SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 and SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 are both status=completed on main, independent of memory/prior-turn claims',
      ],
    },
    metadata: { independent_verification: true, duplicate_scan_complete: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/venture-workflow-creates-001-lead-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
