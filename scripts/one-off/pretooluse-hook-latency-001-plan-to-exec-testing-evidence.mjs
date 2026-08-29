#!/usr/bin/env node
/**
 * TESTING sub-agent evidence for SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001, PLAN-TO-EXEC phase.
 *
 * The SD ports .claude/set-activity-state.ps1 (PowerShell, 914-1054ms/invocation, ~2,076
 * self-timeouts over 19 days) to scripts/hooks/set-activity-state.cjs (Node, p50 35.3ms).
 * The latency win was already measured. This review asked the question the latency number
 * cannot answer -- is the port CORRECT -- by writing tests/unit/hooks/set-activity-state.test.js
 * against the shipped hook, and it found a real merge-semantics defect the soak test could
 * never have surfaced.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001';

const findings = [
  {
    id: 'array-payload-silently-discards-the-entire-hook-write',
    severity: 'HIGH',
    summary:
      "DEFECT FOUND AND FIXED. The ported hook's non-object guard read `if (!stateData || typeof stateData !== 'object') stateData = {};`. Because typeof [] === 'object', a state file containing a JSON ARRAY passes that guard intact; the hook then assigns activity_state/last_active_epoch/hook_triggered onto the array as NAMED properties, and JSON.stringify serialises an array WITHOUT named properties -- so the file is rewritten as the bare array and the hook's entire write is discarded. Silently, with exit code 0, on every subsequent invocation. Caught by the new test's non-object-JSON case (payload [1,2,3]), which failed on first run with 'produced an array: expected true to be false' and asserted after.activity_state === undefined. FIXED at scripts/hooks/set-activity-state.cjs by adding `|| Array.isArray(stateData)` to the guard; the test now passes. Note this is a genuine third state: the try/catch never fires (JSON.parse SUCCEEDS on an array), so only the explicit type guard could ever have caught it.",
  },
  {
    id: 'hardcoded-state-path-had-no-test-seam',
    severity: 'MEDIUM',
    summary:
      "The hook hardcoded STATE_FILE to the absolute canonical path C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/logs/.context-state.json (correctly matching statusline.cjs's LOG_DIR -- the absolute form is deliberate, since hooks fire from worktrees but the statusline always renders the canonical checkout). With no override, any test would have had to either mutate the LIVE fleet state file or test a path-rewritten COPY of the source -- and a copy proves things only about the copy. RESOLVED by adding a `process.env.LEO_ACTIVITY_STATE_FILE ||` prefix to the constant, mirroring the existing LEO_RETRY_STATE_DIR seam in scripts/hooks/retry-state-manager.cjs:233. Production behavior is byte-identical: all three .claude/settings.json invocation sites pass no env, so the hardcoded default applies. Verified the live state file was not written by the test run.",
  },
  {
    id: 'merge-semantics-verified-not-assumed',
    severity: 'INFO',
    summary:
      "The core risk of this port was never latency, it was the read-modify-write against a file the hook does not own. .claude/statusline.cjs writes ~10 keys of context/token accounting there and reads back only 3. A port that clobbered the file with a fresh 3-key object would still post ~35ms and still satisfy every statusline read -- the loss would appear only as silently wrong context rendering, unattributable to this change. Now asserted directly: seeded a realistic statusline payload (keys taken from statusline.cjs's own writeFileSync, not invented), ran the hook running->idle, and compared every foreign key against the SEED (not against the prior read, so a key corrupted on call 1 cannot be laundered into 'unchanged' by call 2). Also asserted the key SET is unchanged, that unknown/future keys survive (preservation is structural, not an allowlist of today's keys), and that the hook-owned keys DO move -- without which the whole suite would also pass against a hook that did nothing.",
  },
  {
    id: 'epoch-unit-mismatch-guarded',
    severity: 'INFO',
    summary:
      'statusline.cjs computes idle duration as (Date.now()/1000) - last_active_epoch. Writing milliseconds instead of seconds would still produce valid JSON with the key present -- and render an idle time ~1.7 billion seconds stale. A classic port defect invisible to both a latency measurement and a smoke check. Asserted: last_active_epoch is an integer bounded by the run window in UNIX SECONDS.',
  },
  {
    id: 'wire-asserted-not-just-the-endpoint',
    severity: 'INFO',
    summary:
      "A green unit suite against a file nothing calls is the writer-without-consumer shape. Added a test that parses .claude/settings.json, walks it for command strings, and asserts exactly 3 set-activity-state invocations (PreToolUse / UserPromptSubmit / Stop), that each names scripts/hooks/set-activity-state.cjs, that none matches /powershell/i, and that the raw file no longer references set-activity-state.ps1 anywhere. All pass.",
  },
  {
    id: 'silent-failure-on-unwritable-target',
    severity: 'INFO',
    summary:
      'The hook is wired to PreToolUse, so a nonzero exit or stray stdout would become tool-call noise on EVERY tool use. Asserted the hook exits 0 with empty stdout when the write target is structurally impossible (parent path is an existing regular file, which fails mkdirSync on every platform). Also asserted the no-argument invocation defaults to "idle", matching the PowerShell original\'s -State default.',
  },
];

const recommendations = [
  'The Array.isArray fix and the LEO_ACTIVITY_STATE_FILE seam were applied to scripts/hooks/set-activity-state.cjs during this review -- EXEC should carry them into the PR, not re-derive them.',
  'If a future change adds a fourth hook-owned key, update HOOK_OWNED_KEYS in tests/unit/hooks/set-activity-state.test.js; the merge tests derive the foreign-key set from it and would otherwise assert the new key must be preserved.',
  'The statuslinePayload() fixture mirrors statusline.cjs\'s writeFileSync shape on purpose. If statusline renames a field, the fixture goes stale rather than failing loudly -- worth a glance whenever statusline.cjs changes.',
];

const summary =
  "PLAN-TO-EXEC testing review of SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001 (PowerShell -> Node port of the fleet-wide activity-state hook). Wrote tests/unit/hooks/set-activity-state.test.js: 10 tests covering merge semantics against a realistic statusline payload, missing-file/absent-dir creation, corrupted-JSON fallback, non-object-JSON fallback, empty-file handling, the no-argument default, silent failure on an unwritable target, epoch units, and the .claude/settings.json wiring itself. FOUND ONE REAL DEFECT: the port's non-object guard used only `typeof !== 'object'`, which an ARRAY passes (typeof [] === 'object'); the hook then wrote its three keys onto the array as named properties, which JSON.stringify drops -- silently discarding the entire hook write with exit 0, on every subsequent call. JSON.parse succeeds on an array, so the try/catch could never have caught it either. Fixed at source by adding `|| Array.isArray(stateData)` to the guard rather than weakening the test. Also added the LEO_ACTIVITY_STATE_FILE override (precedent: LEO_RETRY_STATE_DIR in retry-state-manager.cjs) so the tests exercise the SHIPPED hook rather than a path-rewritten copy; production is unaffected because all three settings.json sites pass no env. RESULTS: 10/10 pass on the new file; 17 files / 161 tests pass across tests/unit/hooks/ (no regressions). Independently corroborated in PRODUCTION: the live .claude/logs/.context-state.json, mutated by this very session's hook firings, carries all 10 statusline keys alongside the 3 hook keys -- the merge is verified on the real file, not only in a tmpdir.";

const justification =
  "PASS. The port's stated goal (remove the ~900-1050ms interpreter cold start) was already measured and holds, and this review verified the part the latency number could not speak to -- that the port is a faithful drop-in for the file's other writer. The one defect found was found by the new tests, fixed at source in the same cycle, and is now regression-guarded; it is not outstanding. PASS rather than CONDITIONAL_PASS because there is no residual unverified scope: every assertion runs against the shipped hook file (not a copy), the settings.json wiring is asserted rather than assumed, and the merge behavior is additionally corroborated against the live production state file. Verdict is on the code as it now stands in the worktree, including the two changes described above.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 94,
    findings,
    recommendations,
    summary,
    justification,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_TO_EXEC',
      review_type: 'test authoring + execution against shipped hook',
      test_file: 'tests/unit/hooks/set-activity-state.test.js',
      subject_file: 'scripts/hooks/set-activity-state.cjs',
      tests_written: 10,
      tests_passed: 10,
      tests_failed: 0,
      regression_scope: 'tests/unit/hooks/ -- 17 files / 161 tests, all passing',
      defects_found_and_fixed: 1,
      source_changes_made_during_review: [
        "scripts/hooks/set-activity-state.cjs: added `|| Array.isArray(stateData)` to the non-object guard (fixes silent total loss of the hook write when the state file holds a JSON array)",
        'scripts/hooks/set-activity-state.cjs: added `process.env.LEO_ACTIVITY_STATE_FILE ||` test seam to STATE_FILE (inert in production; all 3 settings.json sites pass no env)',
      ],
      verification_commands: [
        'npx vitest run --project unit tests/unit/hooks/set-activity-state.test.js  (10 passed)',
        'npx vitest run --project unit tests/unit/hooks/  (17 files / 161 tests passed)',
        "node -e \"JSON.parse(fs.readFileSync('C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/logs/.context-state.json'))\"  (live merge corroboration: 13 keys, 10 statusline + 3 hook)",
      ],
      live_state_file_keys_observed: [
        'activity_state', 'hook_triggered', 'last_active_epoch',
        'last_context_used', 'last_input_tokens', 'last_output_tokens', 'last_percent',
        'last_status', 'last_update', 'last_update_epoch', 'role', 'session_id', 'usable_context',
      ],
      latency_context_from_prd: {
        pre_fix_ms_per_invocation: '914-1054',
        pre_fix_timeouts: '~2076 over 19 days (2000ms hook cap)',
        post_fix_soak_100_runs: { p50_ms: 35.3, p95_ms: 77.6, max_ms: 122.5, timeouts: 0 },
        note: 'latency figures carried from the PRD soak test; this review did not re-measure them and does not assert them',
      },
    },
    phase: 'PLAN_TO_EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_EXEC', source: 'manual' },
  );

  console.log('TESTING EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
