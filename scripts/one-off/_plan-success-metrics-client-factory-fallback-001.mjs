import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '760e5b12-3a50-46b6-9e2d-1a99016c29b5';

const success_metrics = [
  {
    metric: 'Implementation completeness',
    target: '100% of scope items implemented',
    actual: '100% -- 3 of 3 FRs implemented (FR-1 lib/supabase-client.js default export removed, FR-2 scripts/modules/sd-creation/supabase-client.js default export + silent key fallback removed, FR-3 two-lane regression tests added)',
  },
  {
    metric: 'Test coverage',
    target: '\u226580% code coverage for new code',
    actual: '4% (2/49 statements) v8-measured on the two changed files via the new regression suite -- deliberately low by the letter of this metric: the new tests assert link-time/export-shape behavior (spawned real Node subprocess + typeof checks), not runtime execution of internal branches. The generic 80% target (PLAN-LLM boilerplate) is a poor fit for an export-removal fix; the actual coverage claim for this SD is the fresh SECURITY sub-agent census (zero remaining consumers of either removed default export) and the negative-control re-test the TESTING sub-agent ran (re-added the default export, confirmed the suite catches it: 2 failed).',
  },
  {
    metric: 'Zero regressions',
    target: '0 existing tests broken',
    actual: '0 regressions -- CI green on PR #8034 and PR #8041 (54/54 and 23/23 non-skipped checks passing); TESTING sub-agent independently re-ran 5 adjacent suites importing lib/supabase-client.js (12 passed, 0 failed)',
  },
  {
    metric: 'Issue recurrence',
    target: '0 recurrences after fix deployed',
    actual: '0 -- fix merged to main 2026-09-02 (PR #8034 + follow-up PR #8041); no recurrence window has elapsed yet, so this is the starting count, not a long-window claim',
  },
];

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ success_metrics })
  .eq('id', SD_UUID);

if (error) {
  console.error('UPDATE_FAILED', error);
  process.exit(1);
}
console.log('SUCCESS_METRICS_UPDATED');
