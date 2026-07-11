/**
 * Regression tests for scripts/session-tick.cjs — FR-1 of
 * SD-LEO-INFRA-FIX-RESIDUAL-PROCESS-001 (RCA 0.9 confidence, QF-20260711-407).
 *
 * The tickOnce() try/catch previously swallowed a persistent PATCH failure
 * (AbortController timeout, network/auth error) with zero telemetry —
 * process_alive_at freezes while claude_sessions.status stays 'active', a live
 * freeze-while-active dormancy-watchdog false-positive source. This must be made
 * observable WITHOUT changing the catch's fail-open continuation (the tick loop
 * must keep retrying, never crash the daemon on a transient write error).
 *
 * Source-pinned (readFileSync + regex), same pattern as the sibling
 * session-tick-*.test.mjs files — session-tick.cjs has no module.exports
 * (a standalone detached daemon), so behavior is asserted against the source
 * rather than invoked directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');
const tickPath = resolve(repoRoot, 'scripts/session-tick.cjs');
const tickSrc = readFileSync(tickPath, 'utf8');

test('FR-1: a consecutive-failure counter exists and starts at 0', () => {
  assert.match(tickSrc, /let\s+consecutivePatchFailures\s*=\s*0;/);
});

test('FR-1: the catch block increments the counter and logs it (no longer a bare/empty catch)', () => {
  const catchBlock = tickSrc.match(/consecutivePatchFailures \+= 1;[\s\S]+?\n\s*\}\s*finally\s*\{/);
  assert.ok(catchBlock, 'tickOnce() catch block should exist and bind the caught error');
  assert.match(catchBlock[0], /consecutivePatchFailures\s*\+=\s*1;/);
  assert.match(catchBlock[0], /console\.error\(/);
});

test('FR-1: the catch block still never throws/rethrows — fail-open continuation preserved', () => {
  const catchBlock = tickSrc.match(/consecutivePatchFailures \+= 1;[\s\S]+?\n\s*\}\s*finally\s*\{/);
  assert.ok(catchBlock);
  assert.doesNotMatch(catchBlock[0], /\bthrow\b/, 'catch must remain fail-open — never re-throw and crash the tick loop');
});

test('FR-1: a successful tick resets the failure streak to 0', () => {
  // Must appear inside tickOnce()'s try block, after the steady-state PATCH logic,
  // before the catch — i.e. only a completed-without-throwing tick clears the streak.
  assert.match(tickSrc, /consecutivePatchFailures\s*=\s*0;\s*\n\s*\}\s*catch/);
});

test('FR-1: emitPatchFailureTelemetry helper is defined', () => {
  assert.match(tickSrc, /function\s+emitPatchFailureTelemetry\s*\(\s*streak\s*,\s*err\s*\)/);
});

test('FR-1: telemetry only fires once the streak reaches the threshold (not on every single failure)', () => {
  const catchBlock = tickSrc.match(/consecutivePatchFailures \+= 1;[\s\S]+?\n\s*\}\s*finally\s*\{/);
  assert.ok(catchBlock);
  assert.match(catchBlock[0], /consecutivePatchFailures\s*===\s*PATCH_FAILURE_TELEMETRY_THRESHOLD/);
  assert.match(catchBlock[0], /emitPatchFailureTelemetry\(consecutivePatchFailures,\s*err\)/);
});

test('FR-1: emitPatchFailureTelemetry writes a durable NDJSON sink (survives even if the DB POST never resolves)', () => {
  const fnBlock = tickSrc.match(/function\s+emitPatchFailureTelemetry[\s\S]+?\n\}/);
  assert.ok(fnBlock);
  assert.match(fnBlock[0], /appendFileSync\(patchFailureNdjsonPath/);
});

test('FR-1: emitPatchFailureTelemetry POSTs to session_lifecycle_events best-effort (mirrors emitEarlyExitTelemetry sink 2)', () => {
  const fnBlock = tickSrc.match(/function\s+emitPatchFailureTelemetry[\s\S]+?\n\}/);
  assert.ok(fnBlock);
  assert.match(fnBlock[0], /session_lifecycle_events/);
  assert.match(fnBlock[0], /event_type:\s*'tick\.patch_failure'/);
});
