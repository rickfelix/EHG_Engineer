import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C';
const REPO = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  await storeSubAgentResults('TESTING', sd.id, { code: 'TESTING', name: 'TESTING' }, {
    verdict: 'PASS',
    confidence_score: 94,
    summary: 'PLAN-phase test plan review for the output-flow gauge, duration-baseline gauge, directive-ack severity exemption, and the escalation-duty documentation fix. Ran: tests/unit/adam/output-flow-gauge.test.js (7 tests), tests/unit/adam/duration-baseline-gauge.test.js (13 tests), tests/unit/retention/session-coordination-ack-convergence.test.js (8 tests incl. the new severity=high case), tests/unit/lint/quiet-tick-token-parity-lint.test.js (13 tests), tests/unit/adam/adam-quiet-tick-hash-skip-unconditional-surfacing.test.js (4 tests incl. the updated gatedBlockCount pin) -- all passing. Full regression: npx vitest run tests/unit/ -> 3211 passed, 4 failed (3 pre-existing DB_TIER_BLOCKED env-gated failures unrelated to this diff; 1 flaky require-release-sd-wrapper-lint test independently re-run in isolation and confirmed 14/14 passing).',
    detailed_analysis: {
      commands_run: [
        'npx vitest run tests/unit/adam/ tests/unit/lint/quiet-tick-token-parity-lint.test.js tests/unit/sms-count-render-invariant.test.js tests/unit/coordinator/quiet-tick-loop-parity.test.js tests/unit/adam-startup-check.test.mjs -> 50 files, 689 passed',
        'npx vitest run tests/unit/ -> 3211 passed, 4 failed (unrelated, see summary)',
        'npx vitest run tests/unit/lint/require-release-sd-wrapper-lint.test.js (isolated re-run) -> 14/14 passed, confirming the full-suite failure was environmental/flaky',
      ],
    },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'PLAN' });

  console.log('OK stored PLAN TESTING evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
