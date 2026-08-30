import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '956482c1-40ba-4f1b-b9ab-a0514f0ed1b5';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary: 'Located the exact root cause of the SUBAGENT_EVIDENCE_MISSING false-disqualification: prerequisite-preflight.js computes blockingIssues (info-severity filtered) but never returns it -- HandoffOrchestrator.js consumes the raw unfiltered issues array at 3 call sites, so an info-severity SMOKE_TEST_BYPASSED/USER_STORIES_BYPASSED entry alongside a real SUBAGENT_EVIDENCE_MISSING issue defeats the .every() check and wrongly denies auto-invoke eligibility.',
  findings: [
    {
      id: 'blocking-issues-not-exposed',
      summary: 'scripts/modules/handoff/pre-checks/prerequisite-preflight.js:253-257 computes blockingIssues (filters severity!==info) but the return statement only exposes {passed, issues} -- blockingIssues is discarded.',
    },
    {
      id: 'handoff-orchestrator-consumes-raw-issues',
      summary: 'scripts/modules/handoff/HandoffOrchestrator.js:69 (resolveMissingAgentsForAutoInvoke .every check), :221 (rejection message join), and :42 (applyPreflightToVerdict) all map/filter over the raw unfiltered preflight.issues, not the info-excluded set.',
    },
    {
      id: 'info-issue-shape',
      summary: 'SMOKE_TEST_BYPASSED (lines 502-508) and USER_STORIES_BYPASSED (lines 633-639) are the only two issue codes carrying severity:"info". Both are 0/0 sole-blockers per VALIDATION measurement but contaminate 117 rejection_reason rows.',
    },
  ],
  recommendations: [
    'Option A (surgical, DRY): add blockingIssues to the return object at prerequisite-preflight.js:254-257, then change HandoffOrchestrator.js:69, :221, :42 to consume preflight.blockingIssues instead of preflight.issues.',
  ],
  metadata: {
    repo_path: process.cwd(),
    executed_from_cwd: process.cwd(),
  },
};

async function main() {
  const row = await storeSubAgentResults('Explore', SD_ID, { code: 'Explore', name: 'Explore' }, results, {
    source: 'manual',
    phase: 'LEAD-TO-PLAN',
  });
  console.log('Stored Explore evidence row:', row?.id || row);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
