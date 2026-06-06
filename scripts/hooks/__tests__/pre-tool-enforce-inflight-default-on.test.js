/**
 * SD-FDBK-ENH-CLAIM-SWEEP-REAPS-001
 *
 * The ENFORCEMENT-10 in-flight telemetry writer in pre-tool-enforce.cjs used to AWAIT
 * the expected_silence_until persist ONLY when the opt-IN env var
 * SWEEP_RESPECT_INFLIGHT_AGENT=1 was set. That env var is NOT deployed in pre-deploy
 * worker settings, so expected_silence_until stayed NULL during long Task/Agent
 * sub-agent runs and cleanup_stale_sessions reaped ACTIVE in-flight claims
 * (e.g. worker ec3f9fbd swept mid-PLAN). The consumer flag
 * (chairman_dashboard_config.sweep_respect_inflight_agent) is live=true, so the writer
 * now AWAITs by DEFAULT for Task/Agent dispatches (opt-OUT via SWEEP_RESPECT_INFLIGHT_AGENT=0).
 *
 * Static source-assertion test (the established pattern for this hook — the hook runs
 * main() on require, so behavioral execution is impractical here). Pins the default-ON
 * opt-OUT contract so a future edit cannot silently revert to opt-IN.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOOK_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pre-tool-enforce.cjs'),
  'utf8'
);

test('in-flight writer is opt-OUT (default-ON) for Task/Agent, not opt-IN', () => {
  // The disable predicate must check for the OFF values (opt-OUT), not the ON values.
  assert.match(
    HOOK_SRC,
    /_respectInflightDisabled\s*=\s*process\.env\.SWEEP_RESPECT_INFLIGHT_AGENT\s*===\s*'0'/,
    'expected an opt-OUT gate keyed on SWEEP_RESPECT_INFLIGHT_AGENT === "0"'
  );
  // The await branch fires when NOT disabled (default-ON).
  assert.match(
    HOOK_SRC,
    /if\s*\(\s*!_respectInflightDisabled\s*&&\s*silenceMs\s*!==\s*null\s*&&\s*\(TOOL_NAME\s*===\s*'Task'\s*\|\|\s*TOOL_NAME\s*===\s*'Agent'\)\s*\)/,
    'expected the awaited write to default ON for Task/Agent unless explicitly disabled'
  );
  // It must still AWAIT the durable write (so ESU persists before process.exit).
  assert.match(HOOK_SRC, /await\s+writeTelemetryAwait\(_sessId,\s*patch\)/, 'expected awaited durable write');
  // The old opt-IN gate must be gone (no `=== '1'` enabling gate on this var).
  assert.doesNotMatch(
    HOOK_SRC,
    /_respectInflight\s*=\s*process\.env\.SWEEP_RESPECT_INFLIGHT_AGENT\s*===\s*'1'/,
    'old opt-IN gate must be removed'
  );
});
