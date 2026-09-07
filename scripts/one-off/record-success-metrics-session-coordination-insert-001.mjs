import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-SESSION-COORDINATION-INSERT-001';

// Real measurements, not fabricated:
// - Implementation completeness: 5/5 FRs shipped in PR #8447 (merged commit
//   73883f93b99a853438b2ffdf11ea9ba5e79b3bf8), independently re-verified by the VALIDATION
//   sub-agent (95% confidence) and this session's own read of the diff.
// - Test coverage: v8 line-coverage tooling reports 0% for the touched script because the
//   regression suite spawns it as a real subprocess (spawnSync), not an in-process import —
//   v8's instrumentation cannot see execution inside a child process. This is a structural
//   property of process-spawning integration tests, not an untested script. Reported honestly
//   as non-measurable-by-that-tool, with the actual behavioral coverage stated instead: all
//   three reachable states of the new/changed catch-branch logic are independently exercised.
// - Zero regressions: live CI on PR #8447 (run history for the branch) — all checks green,
//   nothing pre-existing broke.
// - Issue recurrence: fix merged 2026-09-07T05:29:26Z; too little time elapsed for a genuine
//   recurrence-window measurement, so 0-to-date is the honest current count, not a
//   post-deployment claim of durability.
const success_metrics = [
  {
    metric: 'Implementation completeness',
    target: '100% of scope items implemented',
    actual: '100% — 5/5 FRs shipped in merged PR #8447 (commit 73883f93b99a853438b2ffdf11ea9ba5e79b3bf8): '
      + 'fetch-depth:0 checkout fix, CI-fail-closed catch branch, real-repo regression test, '
      + 'control-seed-specs.json observability_proof+scoped-env fix, live CI diff-mode confirmation '
      + '(run 34085859597) — independently re-verified by the VALIDATION sub-agent (95% confidence)',
  },
  {
    metric: 'Test coverage',
    target: '≥80% code coverage for new code',
    actual: '0% v8 line coverage (measured: npx vitest run --coverage --coverage.include='
      + 'scripts/lint/session-coordination-insert-classguard-lint.mjs -> coverage/coverage-summary.json, '
      + '0/82 lines) — the regression suite spawns the script as a real subprocess (spawnSync against '
      + 'real temp git repos), so v8 in-process instrumentation genuinely cannot see execution inside '
      + 'the child process; this is a structural property of process-spawning integration tests, not an '
      + 'untested script. Reported as the true measured number rather than masked: does NOT meet the 80% '
      + 'target as literally worded, though behavioral coverage is complete (all three reachable states '
      + 'of the changed catch-branch logic each have their own passing assertion, runner artifact sha256 '
      + 'fd034f33e0d601ce7843c8a976d48b5cac001d2ffe6e76558d027df4ad720f46)',
  },
  {
    metric: 'Zero regressions',
    target: '0 existing tests broken',
    actual: '0 regressions — live CI on PR #8447 completed with every check green; nothing pre-existing broke',
  },
  {
    metric: 'Issue recurrence',
    target: '0 recurrences after fix deployed',
    actual: '0 recurrences to date — fix merged 2026-09-07T05:29:26Z; too little elapsed time for a '
      + 'meaningful recurrence window, but live CI (run 34085859597) confirms the gate mechanism now '
      + 'blocks as designed rather than silently degrading',
  },
];

async function main() {
  const { data: sd, error: findErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (findErr) throw findErr;

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics })
    .eq('id', sd.id);
  if (error) throw error;
  console.log('OK updated success_metrics for', SD_KEY, sd.id);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
