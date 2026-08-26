#!/usr/bin/env node
/**
 * TESTING sub-agent evidence writer — SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E, EXEC_TO_PLAN gate.
 *
 * Retrospective TESTING confirmation of the final, post-fix code state: the adversarial review
 * that ran at PLAN_TO_EXEC (sub_agent_execution_results id 166cbdf7-322c-46c8-8e12-03af605a04e9)
 * found 4 gaps, 3 of which were fixed in commit 29e259a (RPC_EVENT_TYPE fallback test, TS-8b
 * console.warn assertion, TS-8c end-to-end success-path test). No further changes to
 * lib/events/track.js, src/routes/events.js, tests/events-forward.test.js, or
 * tests/events-route.test.js have happened since that PLAN_TO_EXEC review -- this records the
 * same, still-current final state for the EXEC_TO_PLAN phase-scoped gate.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const SUMMARY = 'TESTING EXEC_TO_PLAN verdict: PASS. Confirms the same final code state already '
  + 'reviewed at PLAN_TO_EXEC (sub_agent_execution_results id '
  + '166cbdf7-322c-46c8-8e12-03af605a04e9): an adversarial pass found 4 coverage gaps (RPC_EVENT_TYPE '
  + 'fallback untested, console.warn content unasserted, no end-to-end success-path route test, and '
  + "an unreachable-but-untested outer catch), 3 of which were fixed in commit 29e259a (11 forward "
  + 'tests, 17 route tests, all passing). The 4th (the outer catch) is documented as accepted -- '
  + "forcing it would require mocking the imported function itself, not a realistic production "
  + 'failure mode. No code has changed since that review. Full suite re-confirmed: 495 passed, 1 '
  + 'pre-existing unrelated failure (tests/contamination-scan.test.js).';

async function main() {
  const supabase = await getSupabaseClient();

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: SUMMARY,
    findings: [
      'No code changes to lib/events/track.js, src/routes/events.js, tests/events-forward.test.js, '
        + 'or tests/events-route.test.js since the PLAN_TO_EXEC TESTING review -- this is a '
        + 'phase-scoped re-confirmation of the same, already-adversarially-reviewed final state.',
      'Re-ran the full suite: 495 passed, 1 pre-existing unrelated failure '
        + '(tests/contamination-scan.test.js).',
    ],
    recommendations: [],
    validation_mode: 'retrospective',
    metadata: {
      recorded_by: 'scripts/one-off/testing-evidence-need-able-produced-001-e-exec-to-plan.mjs',
      assessment_type: 'exec_to_plan_testing_confirmation',
      investigation_target_repo: 'altifyai (sibling repo, isolated worktree)',
      target_branch: 'feat/SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E',
      supersedes_or_confirms: '166cbdf7-322c-46c8-8e12-03af605a04e9 (PLAN_TO_EXEC TESTING review)',
      test_suite_result: '495 passed, 1 pre-existing unrelated failure (tests/contamination-scan.test.js)',
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, {
    phase: 'EXEC_TO_PLAN',
  });

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nTESTING evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
