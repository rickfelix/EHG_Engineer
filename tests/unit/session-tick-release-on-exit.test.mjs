/**
 * Regression tests for scripts/session-tick.cjs writer-side release on parent-ESRCH.
 *
 * QF-20260509-187 — closes phantom-active-session class. Witnessed:
 *   - 824a4401: parent CC PID 14396 dead, heartbeat refreshing for ~30 min
 *     until SWEEP_PID_DEAD eventually released it
 *   - 18b90582: orphan tick PID 31768 patching released row 13h+ after release
 *
 * Follow-up to SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 (PR #3659 merged
 * 2026-05-10T03:02:45Z commit cdf98d04). PR #3659 closed the PR-open release
 * path; this QF closes the parent-ESRCH path (different codepath in
 * session-tick.cjs that PR #3659 did not touch).
 *
 * RCA evidence: sub_agent_execution_results.id = 35c4f602-4f17-4772-91a1-b0051813438f
 * 15th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
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

// ── FR-1: PATCH-to-released on parent-ESRCH ──────────────────────────────────

test('FR-1: releaseRowOnExitBestEffort helper is defined', () => {
  assert.match(tickSrc, /function\s+releaseRowOnExitBestEffort\s*\(\s*reason\s*\)/);
});

test('FR-1: cleanupAndExit calls releaseRowOnExitBestEffort BEFORE deleteMarker', () => {
  // The order matters — if deleteMarker ran first, the marker file would be
  // gone and operators couldn't correlate the marker→DB-row. Both are best-effort
  // and the file-delete must NOT happen first.
  const cleanupBlock = tickSrc.match(/function\s+cleanupAndExit[\s\S]+?process\.exit\(code\);[\s\S]+?\}/);
  assert.ok(cleanupBlock, 'cleanupAndExit body should be findable');
  const body = cleanupBlock[0];
  const releaseIdx = body.indexOf('releaseRowOnExitBestEffort');
  const deleteMarkerIdx = body.indexOf('deleteMarker()');
  assert.ok(releaseIdx > -1, 'cleanupAndExit must invoke releaseRowOnExitBestEffort');
  assert.ok(deleteMarkerIdx > -1, 'cleanupAndExit must still invoke deleteMarker');
  assert.ok(releaseIdx < deleteMarkerIdx, 'release must run BEFORE deleteMarker');
});

test('FR-1: releaseRowOnExitBestEffort uses 1s timeout (fail-soft, never blocks exit)', () => {
  // The PATCH must time out fast — signal handlers should not hang waiting on
  // network I/O. Sub-second timeout is the contract.
  assert.match(tickSrc, /RELEASE_HTTP_TIMEOUT_MS\s*=\s*1000/);
  assert.match(tickSrc, /setTimeout\(\(\)\s*=>\s*controller\.abort\(\),\s*RELEASE_HTTP_TIMEOUT_MS\)/);
});

test('FR-1: releaseRowOnExitBestEffort PATCH body sets status=released + released_reason', () => {
  // The DB row must be marked released (not just stale), and the reason tag
  // must be queryable for ops triage. TICK_PARENT_ESRCH distinguishes this
  // path from SWEEP_PID_DEAD and from the canonical PR-open release.
  assert.match(tickSrc, /status:\s*['"]released['"]/);
  assert.match(tickSrc, /released_reason:\s*reason/);
  assert.match(tickSrc, /'TICK_PARENT_ESRCH'/);
});

test('FR-1: releaseRowOnExitBestEffort PATCH WHERE filters status=eq.active (idempotent)', () => {
  // If the row is already released (by sweep, by another path, by a prior
  // cleanupAndExit), don\'t clobber it. status=eq.active filter makes this
  // PATCH a 0-row no-op when the row was already moved out of active.
  assert.match(tickSrc, /releaseRowOnExitBestEffort[\s\S]+?status=eq\.active/);
});

test('FR-1: releaseRowOnExitBestEffort uses fire-and-forget (no await)', () => {
  // Sync signal handlers cannot await — the fetch must be fire-and-forget
  // with a .catch swallow. Without this the process exits before the request
  // completes (which IS the intended fail-soft behavior).
  // Slice from function declaration to next top-level `function ` (or end of file).
  const startIdx = tickSrc.indexOf('function releaseRowOnExitBestEffort');
  assert.ok(startIdx > -1, 'releaseRowOnExitBestEffort declaration should be findable');
  const afterStart = tickSrc.slice(startIdx);
  const nextFnIdx = afterStart.slice(1).search(/\nfunction\s+\w+/);
  const body = nextFnIdx > -1 ? afterStart.slice(0, nextFnIdx + 1) : afterStart;
  // Body must NOT contain `await fetch` (which would block signal handlers)
  assert.ok(!/\bawait\s+fetch/.test(body), 'releaseRowOnExitBestEffort must NOT await fetch');
  // Body must contain a fetch call followed by .catch (fire-and-forget pattern)
  assert.match(body, /fetch\([\s\S]+\)\.catch/);
});

// ── FR-2: tickOnce released-row guard ────────────────────────────────────────

test('FR-2: tickOnce steady-state PATCH filters status=eq.active', () => {
  // Without this filter, an orphan tick that survives parent death would
  // continue patching heartbeat on a row already marked released — the exact
  // pattern witnessed for sibling 18b90582 (13h of heartbeats on a released
  // row from a tick whose parent had been dead for hours).
  // Match the steady-state branch (the `else` path of isFirstTick).
  assert.match(
    tickSrc,
    /const\s+url\s*=\s*`[^`]*\?session_id=eq\.\$\{[^}]+\}&status=eq\.active`/
  );
});

test('FR-2: tickOnce uses Prefer: count=exact to detect 0-row no-op', () => {
  // PostgREST surfaces filtered-row count via Content-Range when count=exact
  // is set. We need this to detect the released-row case and stop ticking.
  assert.match(tickSrc, /count=exact/);
});

test('FR-2: tickOnce stops ticking when row is released (Content-Range total=0)', () => {
  // The 0-row case means status moved to released between ticks. Continuing
  // to fire 30s ticks against a released row pollutes telemetry and is the
  // root cause of the 18b90582 sibling phantom.
  assert.match(tickSrc, /Content-Range/);
  assert.match(tickSrc, /totalMatch\[1\]\s*===\s*['"]0['"]/);
  // When 0 rows, must call cleanupAndExit (which itself triggers FR-1 release path
  // — but that PATCH is a no-op since row is already released, idempotent by design).
  const exitCheckBlock = tickSrc.match(/totalMatch\[1\]\s*===\s*['"]0['"][\s\S]+?cleanupAndExit/);
  assert.ok(exitCheckBlock, 'tickOnce must call cleanupAndExit when row total=0');
});

test('FR-2: tickOnce stops the tickInterval loop on 0-row detection', () => {
  // Even with cleanupAndExit, the running tickInterval should be stopped to
  // prevent any further tick scheduling between detection and exit.
  assert.match(tickSrc, /clearInterval\(tickInterval\)/);
});
