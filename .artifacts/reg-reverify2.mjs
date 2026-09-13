import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const ID = '47629374-e1a6-4262-b0ba-80117185bb92';

const { data: row } = await sb.from('sub_agent_execution_results').select('metadata').eq('id', ID).single();

const metadata = {
  ...row.metadata,
  head_commit: '93d49c6d3aa',
  validated_at_commit: '93d49c6d3aa',
  reverification_2: {
    trigger: 'team-lead commit 93d49c6d3aa fixing VALIDATION findings V-2, V-3, V-5 — first non-comment change since the original pass',
    range: '11082aa99d8..93d49c6d3aa',
    cumulative_diff: '4 files, 51 insertions, 14 deletions',
    verdict_unchanged: true,
    test_run: {
      command: 'npx vitest run tests/unit/eva/',
      test_files_passed: 616,
      test_files_failed: 1,
      test_files_skipped: 6,
      tests_passed: 7856,
      tests_failed: 0,
      tests_skipped: 34,
      new_failures: 0,
      delta_vs_original: '+1 test passed (7855 -> 7856), exactly accounted for by the one new AbortSignal timeout test added in this commit',
      pre_existing_failures: ['tests/unit/eva/path-integrity-flags-live-defaults.db.test.js - DB_TIER_BLOCKED env gate, file untouched by branch']
    },
    transient_failure_observed_and_cleared: {
      what: 'The first full-suite run at this HEAD showed 6 failed files: the known env gate plus 5 corrective-sd-generator*.test.js suites, with skipped inflated to 112 and passed depressed to 7778.',
      investigation: 'corrective-sd-generator-dedup.test.js passes standalone (8/8). A clean full re-run returned 616 passed / 1 failed / 34 skipped / 7856 passed with the 5 suites green.',
      conclusion: 'Transient full-run infrastructure artifact (concurrent vitest runs from other agents in this session), NOT a regression. Recorded rather than suppressed because the first run is on the record.',
      touched_by_branch: false
    },
    v2_logger_default_swap: {
      finding: 'BEHAVIOR-PRESERVING for every call site. Verified independently, not accepted on assertion.',
      method_coverage: 'The only logger methods invoked across both changed files are logger.log (4x), logger.warn (3x) and logger?.warn (3x). createLogger (lib/logger.js:29) returns debug, info, warn, error, child and a console-compatible log shim, so every invoked method exists. No new TypeError surface.',
      signature_compat: 'Only DEFAULT VALUES changed; parameter positions and shapes are identical, so any caller passing an explicit logger (or console) is unaffected.',
      callers_actually_affected: 'Most production callers pass a logger explicitly (post-build-convergence-gate.js:150, stage-execution-worker.js:3061, chairman-product-review.js:490), so the default never applies to them. Only two call sites omit it: scripts/chairman-product-review-packet.js:27 and lib/eva/artifact-persistence-service.js:1012.',
      observable_deltas_non_functional: [
        'For those two call sites, log output changes from plain-text console to structured JSON lines, and logger.log now maps to info level, which is level-gated by LOG_LEVEL (default info, so it still prints by default; it would be suppressed under LOG_LEVEL=warn or error).',
        'In validate-venture-default-capabilities.js the logger param went from undefined to moduleLogger, so logger?.warn?.() sites that were silent no-ops when no logger was passed now emit a warn line to stderr. New output where there was silence - which is the point of the eva-logger-required gate.'
      ],
      functional_impact: 'none'
    },
    v3_fetch_timeout: {
      finding: 'NEW code path, no existing caller or test broken.',
      change: 'lib/eva/bridge/stack-scan-reader.js passes signal: AbortSignal.timeout(5000) to fetchImpl and adds an err?.name === TimeoutError branch returning {available:false, reason:timeout} inside the EXISTING catch.',
      existing_test_safety: 'No existing assertion in stack-scan-reader.test.js checks fetchImpl arguments exhaustively - the only arg assertion reads mock.calls[0][0] (the URL), so adding a signal key to the options object cannot break it. Confirmed by the suite passing.',
      runtime_floor: 'AbortSignal.timeout requires Node >= 17.3. CI workflows pin node-version 22 and the local runtime is v24.12.0, so the API is available in both.',
      effect_on_f1: 'STRENGTHENS the F1 invariant rather than threatening it. The reader still never throws (the timeout is caught and converted to a return value), and an unbounded GitHub fetch that could previously HANG the chairman packet indefinitely - a hang, which fail-closed error handling does not protect against - is now bounded at 5s.'
    }
  }
};

const { data, error } = await sb.from('sub_agent_execution_results')
  .update({ metadata })
  .eq('id', ID)
  .select('id,verdict,confidence,phase')
  .single();

console.log('REVERIFIED_2:', JSON.stringify(data), 'err:', error?.message);
