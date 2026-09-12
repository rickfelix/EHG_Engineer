#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-COORDINATOR-SELF-SCORE-001, LEAD-TO-PLAN phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-COORDINATOR-SELF-SCORE-001';

const findings = [
  {
    id: 'row-counts-verified-live',
    severity: 'INFO',
    summary: "Queried the feedback table directly (not trusting the QF's own stated 170/80 figures): category='adam_self_assessment' has 174 rows (most recent 2026-09-12T05:10Z), category='solomon_self_assessment' has 84 rows (most recent 2026-09-12T04:37Z), category='coordinator_self_assessment' has 0 rows, ever. Both fresh categories are well under the 48h DEFAULT_SELF_SCORE_STALE_HOURS threshold in scripts/gauge-runner.mjs.",
  },
  {
    id: 'root-cause-missing-force-bypass',
    severity: 'CRITICAL',
    summary: "COORD_SELF_SCORE_V1 (the flag gating scripts/coordinator-self-review.mjs:349's write) is set nowhere: not in machine or user Windows environment variables (verified via PowerShell [Environment]::GetEnvironmentVariable), not in .env, not in any GitHub workflow, not in any feature-flag enrollment script. Unlike its Adam/Solomon analogues (ADAM_SELF_SCORE_CADENCE, SOLOMON_SELF_SCORE_CADENCE), which ship the identical ships-inert-by-default convention but ALSO ship a --force CLI bypass invoked by their own cron prompts (adam-startup-check.mjs's self-score entry explicitly instructs --force under a chairman-directed override, QF-20260719-825), coordinator-self-review.mjs shipped with no such bypass at all -- so even a fully-armed, correctly-firing coordinator cron could never reach the write.",
  },
  {
    id: 'mutation-guard-blocks-worker-side-manual-trigger',
    severity: 'INFO',
    summary: "coordinator-self-review.mjs:166 calls guardMutation(db, resolveOwnSessionId(), 'coordinator-self-review') -- a single-writer mutation guard restricting this write to the live coordinator SESSION. Manually invoking the script from this worker/QF session to seed a first row was considered and rejected: the guard exists precisely to prevent a non-coordinator session from performing this write, and bypassing it to force a result would violate the guard's own purpose rather than fix the root cause.",
  },
  {
    id: 'fix-scoped-to-writer-plus-two-safe-gauges',
    severity: 'INFO',
    summary: "Fix adds a --force flag to coordinator-self-review.mjs (mirrors Adam/Solomon's pattern exactly) and wires it into coordinator-startup-check.mjs's cron prompt. adam_self_score_age and solomon_self_score_age are flipped enabled:true (writers independently verified live). coordinator_self_score_age stays enabled:false: the writer fix ships in this SD, but gauge activation is deferred to the coordinator role itself (re-arm the cron, produce a first row, then flip the flag) -- consistent with Adam's own disposition that a gauge is never enabled ahead of a demonstrated writer.",
  },
  {
    id: 'new-lint-verified-both-directions',
    severity: 'INFO',
    summary: 'scripts/lint/self-score-gauge-writer-lint.mjs was verified probative: with coordinator_self_score_age temporarily flipped to enabled:true (0 rows ever), the lint FAILED with "writer has never produced a row"; reverted to the shipped enabled:false state, the lint PASSED. This is the durable version of the one-time check this SD performs manually.',
  },
  {
    id: 'census-line-drift-caught-and-fixed',
    severity: 'INFO',
    summary: "Adding the --force flag's declaration + comment shifted 2 insertCoordinationRow() call sites in coordinator-self-review.mjs by +6 lines each (308->314, 322->328), breaking lib/coordinator/insert-coordination-row-callers.cjs's pinned-line census -- caught by tests/unit/coordinator/insert-coordination-row-callers-census.test.js itself on a full-suite run, not by the targeted test subset alone. Fixed by updating both pinned line numbers with shift-history comments.",
  },
  {
    id: 'regression-suite-confirmed-green',
    severity: 'INFO',
    summary: 'Targeted suite (gauge-registry.test.js, insert-coordination-row-callers-census.test.js, 4 coordinator-self-review-*.test.js files, coordinator-startup-check.test.mjs -- 172 tests) all pass. Full unit sweep: 50721 passed; 3 unrelated pre-existing failures (missing vitest.mjs binary in this worktree\'s node_modules for 2 subprocess-spawning test files, 1 known-flaky timeout under full-suite load) -- none touch the files in this diff.',
  },
];

const summary = "Explore-phase verification for SD-LEO-FIX-COORDINATOR-SELF-SCORE-001 (escalated from QF-20260911-404, source LOC 113 > 75 cap) confirms the root cause: coordinator_self_score_age's writer never fired because COORD_SELF_SCORE_V1 was never set anywhere AND, unlike Adam/Solomon's parallel flags, the writer shipped with no --force override at all. The fix adds the missing bypass (mirroring the existing Adam/Solomon pattern exactly), enables the 2 gauges with independently-verified live writers (adam 174 rows, solomon 84 rows, both fresh), and deliberately leaves coordinator_self_score_age disabled because its write is gated by a single-writer mutation guard only a live coordinator session can satisfy -- a worker/QF seat correctly declined to bypass that guard to manufacture a result. A new durable lint (self-score-gauge-writer-lint.mjs) was added and verified probative in both directions. A line-drift regression the fix itself introduced in the insertCoordinationRow census was caught by the census test and fixed.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 90,
    findings,
    warnings: [],
    recommendations: [],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/governance/gauge-registry.js',
        'scripts/gauge-runner.mjs',
        'scripts/coordinator-self-review.mjs',
        'scripts/coordinator-startup-check.mjs',
        'scripts/adam-self-assessment-writer.cjs',
        'scripts/solomon-self-assessment-writer.cjs',
        'scripts/adam-startup-check.mjs',
        'lib/coordinator/insert-coordination-row-callers.cjs',
        'scripts/lint/self-score-gauge-writer-lint.mjs',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
