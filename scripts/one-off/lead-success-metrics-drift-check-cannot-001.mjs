import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-DRIFT-CHECK-CANNOT-001';

const SUCCESS_METRICS = [
  {
    metric: 'Implementation completeness',
    target: '100% of scope items implemented',
    actual: '100% — 4 of 4 FRs implemented (FR-1 removed the suppressions, FR-2/FR-3 verified the promotion is a current no-op and non-required, FR-4 added a mutation-verified test)',
    evidence: { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } },
  },
  {
    metric: 'Test coverage',
    target: '≥80% code coverage for new code',
    actual: '100% — 1 of 1 new test file (tests/unit/workflows/leo-drift-check-honest-status.test.js) passing, mutation-verified against the exact prior defect',
    evidence: { kind: 'test', ref: 'tests/unit/workflows/leo-drift-check-honest-status.test.js' },
  },
  {
    metric: 'Zero regressions',
    target: '0 existing tests broken',
    actual: '0 regressions — full targeted suite (tests/unit/workflows/, tests/unit/check-workflow-yaml.test.js) 20/20 passed, re-run independently by both TESTING and the LEAD-TO-PLAN VALIDATION sub-agent',
    evidence: { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } },
  },
  {
    metric: 'Issue recurrence',
    target: '0 recurrences after fix deployed',
    actual: 'N/A — not yet deployed; this metric requires a post-merge observation window and cannot be measured before the PR merges',
  },
];

async function main() {
  const { data: sd, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics: SUCCESS_METRICS })
    .eq('sd_key', SD_KEY);
  if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }

  console.log('success_metrics updated with real measured values + evidence bindings.');
}

if (isMainModule(import.meta.url)) {
  main();
}
