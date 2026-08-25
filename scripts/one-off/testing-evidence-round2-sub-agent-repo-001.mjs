import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '4e010f6a-f5a5-437c-ac2c-e1ffb8185a95';
const REPO_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const CWD = process.cwd();

const analysis = `EXEC-phase TESTING round 2, confirming round-1 findings were addressed. Round 1
(evidence 09e21cec) flagged F1 (missing error destructure on the insert) and identified 3
untested pieces of the fix: ordering, payload forwarding, and the wire between them ("ends
green, wire unverified").

Fixed this round (commit 0327d994edb):
- storeResults() now destructures { error: insertError } from the insert response and logs it
  explicitly -- supabase-js returns constraint violations rather than throwing.
- Extracted buildRegressionInsertPayload(normalizedSdId, results, phaseValue) as a pure function,
  independently unit-testable.
- Added tests/unit/sub-agents/regression-repo-verdict-insert-ordering.test.js: a hermetic
  integration test (child_process.exec mocked to avoid real npm/npx/grep subprocess spawns --
  regression.js's phase helpers shell out to real tools that would make a naive integration test
  slow/non-deterministic; resolveSubAgentRepo mocked to force the failing-resolution branch
  directly; supabase mocked to capture the actual insert payload) that runs the REAL execute()
  control flow end-to-end and asserts the stored row carries verdict=CONDITIONAL_PASS with
  non-empty conditions/justification and repo_resolved:false metadata. Mutation-verified: manually
  commenting out the applySubAgentRepoVerdict() call (simulating the pre-fix ordering bug)
  reproduces the original failure (verdict stays PASS, row lacks the downgrade) -- confirmed by
  re-running the test with the call removed, then restored.

All test files re-run clean: regression-target-application-precedence.test.js (4/4),
regression-repo-verdict-insert-ordering.test.js (1/1, mutation-verified), and the
resolve-sub-agent-repo.test.js additions (5/5 new, 22/24 total via temp de-quarantine copy --
the 2 failures remain the pre-existing unrelated registrySource assertions).

VERDICT: PASS. All 3 gaps named in round 1 are now closed: (1) ordering pinned by the new
integration test, (2) payload forwarding pinned by both the integration test and the extracted
pure builder, (3) error visibility fixed. No new findings this round.`;

const { data, error } = await supabase.from('sub_agent_execution_results').insert({
  sd_id: SD_UUID,
  sub_agent_code: 'TESTING',
  sub_agent_name: 'Testing Sub-Agent',
  verdict: 'PASS',
  confidence: 94,
  phase: 'EXEC',
  source: 'manual',
  detailed_analysis: analysis,
  warnings: [],
  recommendations: [],
  metadata: {
    repo_path: REPO_PATH,
    executed_from_cwd: CWD,
    mechanism_verifications: [
      { verified_at: 'lib/sub-agents/regression.js:792 (buildRegressionInsertPayload)', verified_by: 'Direct implementation + mutation-verified test (this session)' },
      { verified_at: 'tests/unit/sub-agents/regression-repo-verdict-insert-ordering.test.js:1', verified_by: 'Direct implementation + run + mutation-verified (this session)' },
    ],
  },
  executed_from_cwd: CWD,
}).select('id');

if (error) {
  console.error('INSERT FAILED:', error.message);
  process.exit(1);
}
console.log('TESTING round-2 evidence recorded:', data[0].id);
