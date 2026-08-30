import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-956482c1-40ba-4f1b-b9ab-a0514f0ed1b5';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('*').eq('id', PRD_ID).single();
  if (readErr) throw readErr;

  const frs = prd.functional_requirements;
  const byId = Object.fromEntries(frs.map((f, i) => [f.id, i]));

  frs[byId['FR-1']] = {
    ...frs[byId['FR-1']],
    acceptance_criteria: [
      ...frs[byId['FR-1']].acceptance_criteria,
      'applyPreflightToVerdict (HandoffOrchestrator.js) uses a null-safe fallback (Array.isArray(preflight.blockingIssues) ? preflight.blockingIssues : (preflight.issues || [])) so a legacy/mocked preflight shape without blockingIssues does not crash (TESTING finding: naive switch throws TypeError reading .map of undefined) and does NOT silently re-widen eligibility by falling back to an empty array',
    ],
  };
  frs[byId['FR-2']] = {
    ...frs[byId['FR-2']],
    description: frs[byId['FR-2']].description + ' TESTING sub-agent finding (PLAN-TO-EXEC): resolveMissingAgentsForAutoInvoke reads the issues array THREE times (the length-check guard, the .every() eligibility check, and the flatMap collecting missingAgents) -- all three must move to blockingIssues together, not just the .every() call named in the original description.',
    acceptance_criteria: [
      ...frs[byId['FR-2']].acceptance_criteria,
      'All 3 reads inside resolveMissingAgentsForAutoInvoke (length guard, .every() check, flatMap) consume blockingIssues consistently',
      'The console.log display loop (HandoffOrchestrator.js, the "PREREQUISITE PREFLIGHT FAILED" per-issue printout) is explicitly UNCHANGED -- it still iterates the full, unfiltered issues array so operator visibility of info-severity context is preserved (TS-8)',
    ],
  };

  const scenarios = prd.test_scenarios.slice();
  scenarios.push(
    { id: 'TS-6', scenario: 'Backward compatibility: existing fixtures without blockingIssues', expected: 'tests/unit/handoff/preflight-auto-invoke-eligibility.test.js and tests/unit/handoff/precheck-preflight-parity.test.js fixtures (which supply only `issues`, no `blockingIssues`) are updated to supply both fields explicitly OR the null-safe fallback correctly derives blockingIssues from issues when absent -- either way, none of the existing 35 tests regress' },
    { id: 'TS-7', scenario: 'precheck-preflight-parity contamination guard', expected: 'tests/unit/handoff/precheck-preflight-parity.test.js\'s failedPreflight fixture no longer crashes and its assertions correctly reflect the filtered (non-info) issue set' },
    { id: 'TS-8', scenario: 'Display loop unchanged', expected: 'scripts/modules/handoff/HandoffOrchestrator.artifact-preflight.test.js confirms the full unfiltered issues array (including info-severity entries) still prints in the console "PREREQUISITE PREFLIGHT FAILED" loop -- operator visibility is preserved even though the programmatic eligibility/rejection-reason logic now uses the filtered set' },
  );

  const { error: updErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: frs, test_scenarios: scenarios }).eq('id', PRD_ID);
  if (updErr) throw updErr;
  console.log('Patched PRD with TESTING sub-agent findings (null-safe fallback, 3-reads-together, display-loop-unchanged, TS-6/7/8 added).');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
