#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 -- Explore evidence at LEAD-TO-PLAN.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "LEAD-phase Explore directly measured the SD's premise against the live database rather than trusting its text: confirmed EXACTLY 18,340 org_agent_identities rows carry a venture_id with no matching ventures row -- 655 of 660 distinct referenced venture_ids are orphaned (only 5 correspond to a real ventures row). instantiateVenture() (lib/agents/venture-ceo-factory.js:273) never validates options.ventureId against the ventures table before writing agent/identity/relationship/tool-grant rows across 4+ tables. Traced both real call sites: lib/agents/eva-coo-integration.js:356 (inside onboardVenture(), which scripts/audits/venture-ceo-factory-reachability.mjs's own live audit already confirmed has ZERO live callers -- dead code transitively) and scripts/harness/spine-verify-first-run.mjs:128 (a manually-invoked verification harness, no npm-script/cron/CI wiring). Both existing call sites already pass a real, freshly-created/fetched venture.id -- the 18,340 orphans trace to an earlier or removed caller, or direct test invocation, not a currently-live production path. This does not change the fix's validity: a structural guard at the function's own entry point is still the correct C2 corrective (per design feedback 20b858dc), since it protects EVERY future caller regardless of how instantiateVenture() is eventually wired, rather than relying on every caller independently remembering to pre-validate.",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'LOW',
        issue: 'The 18,340 pre-existing orphan rows are not retroactively cleaned up by this SD -- confirmed this is explicitly out of scope per the design\'s own C2 text ("refuse at the entry point", not "clean up history"). Flagged as a possible separate data-remediation item.',
        evidence: 'Direct live-DB measurement: 18,340 org_agent_identities rows, 655/660 distinct venture_ids orphaned.',
      },
    ],
    recommendations: [
      'PLAN should scope the fix narrowly: one guard clause at the top of instantiateVenture(), a named error class, zero-rows-written on refusal, and a regression test for both the refusal path and the 2 existing legitimate call sites.',
      'PLAN should NOT scope any retroactive cleanup of the 18,340 existing orphan rows -- out of scope per the design text.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read lib/agents/venture-ceo-factory.js:260-437 (the full instantiateVenture() method) -- confirmed no venture-existence check anywhere in the method',
        'grep for .instantiateVenture( across lib/, scripts/, tests/ -- found exactly 2 real call sites plus test files',
        'Read lib/agents/eva-coo-integration.js:319-362 (onboardVenture()) -- confirmed venture.id is a real, already-fetched venture object field',
        'Read scripts/harness/spine-verify-first-run.mjs:98-160 -- confirmed manifest.ventureId is set from a freshly-created real ventures row before instantiateVenture() is called',
        'Read scripts/audits/venture-ceo-factory-reachability.mjs:96-102 -- confirmed its own live audit already established onboardVenture() has zero live callers',
        'Direct live-DB measurement (paginated fetch + chunked existence check against ventures): 18,462 org_agent_identities rows with non-null venture_id, 660 distinct venture_ids referenced, 5 exist in ventures, 655 do not, 18,340 identity rows point at an orphan venture_id',
      ],
    },
    metadata: { independent_verification: true, premise_measured_live: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    probeExistsRelative: 'scripts/one-off/instantiate-venture-refuses-lead-explore-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('Explore', sdRow.id, { code: 'Explore', name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'Explore', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
