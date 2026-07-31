/**
 * Regression tests for scripts/session-tick.cjs
 * SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 FR-4
 *
 * Asserts the tick updates both heartbeat_at and process_alive_at.
 * claim-guard.mjs keys claim TTL on heartbeat_at (300s stale threshold).
 * If the tick only patches process_alive_at, long Edit/Write/Read bursts
 * that don't invoke any CLI script will lose the claim.
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
const claimGuardPath = resolve(repoRoot, 'lib/claim-guard.mjs');

const tickSrc = readFileSync(tickPath, 'utf8');
const guardSrc = readFileSync(claimGuardPath, 'utf8');

test('FR-4: tickOnce() PATCH body includes heartbeat_at', () => {
  // The PATCH body was previously { process_alive_at: ... } which left
  // heartbeat_at to decay. claim-guard's stale threshold is 300s on
  // heartbeat_at, so a 60-min Edit/Write session would lose its claim.
  assert.match(tickSrc, /heartbeat_at:\s*now\b/);
});

test('FR-4: tickOnce() PATCH body still includes process_alive_at', () => {
  // process_alive_at is consumed by source-side fleet liveness dashboards.
  // Keep it — FR-4 adds heartbeat_at, doesn't replace process_alive_at.
  assert.match(tickSrc, /process_alive_at:\s*now\b/);
});

test('FR-4: both timestamps come from a single "now" so they match exactly', () => {
  // Minimize drift across consumers inspecting both columns.
  assert.match(
    tickSrc,
    /const\s+now\s*=\s*new\s+Date\(\)\.toISOString\(\)/,
    'tickOnce should compute `const now = new Date().toISOString()` once'
  );
});

test('FR-4: claim-guard still keys TTL on heartbeat_at (alignment sanity check)', () => {
  // If someone changes claim-guard to use a different column, this test
  // will fire a reminder to re-check the tick's PATCH body.
  assert.match(guardSrc, /heartbeat_at/);
});

test('QF-20260424-001: tickInterval is NOT unref\'d so the daemon stays alive', () => {
  // Regression: both setInterval handles were previously unref'd, causing Node
  // to exit ~260ms after the initial tickOnce() fetch resolved. Only ONE
  // heartbeat_at write made it to the DB per spawn; the 30-second periodic
  // re-tick never fired. This broke claim TTL for every parallel-session
  // workflow and was the proximate cause of foreign_claim on active work.
  // The parent-liveness interval MAY be unref'd (it does not need to hold the
  // loop open), but the tick interval MUST NOT be.
  assert.doesNotMatch(
    tickSrc,
    /tickInterval\.unref\??\.\?\(\)/,
    'tickInterval.unref()/.unref?.() reintroduces the daemon-exits-early bug'
  );
});

// ── SD-FDBK-FIX-PARKED-LOOP-WORKER-001: survive CC parent-PID rotation ──
// A parked /loop worker's pinned CC_PARENT_PID rotates across /clear, reconnect,
// or compaction. The tick must re-discover a live CC parent before concluding the
// session is dead, otherwise it releases the row + exits and the still-live worker
// loses its heartbeat and is swept as stale mid-loop.

test('PARKED-LOOP FR-1: parentPid is reassignable (let) so a re-discovered PID can be adopted', () => {
  assert.match(tickSrc, /let\s+parentPid\s*=/);
  assert.doesNotMatch(tickSrc, /const\s+parentPid\s*=/);
});

test('SD-LEO-INFRA-FIX-WINDOWS-SESSION-001: rediscoverParentPid() exists and re-queries claude_sessions.pid (not SSE-port WMI matching)', () => {
  // The original SSE-port/WMI CommandLine approach was structurally inert (the
  // port is only ever process.env, never a CLI arg — no command line could ever
  // match it). Replaced with a read-only DB re-query of claude_sessions.pid,
  // which scripts/hooks/capture-session-id.cjs's upsertSessionRow() already
  // keeps fresh on every hook fire.
  assert.match(tickSrc, /async\s+function\s+rediscoverParentPid\s*\(/);
  // Only the functional env read matters — an explanatory comment elsewhere in
  // the file legitimately names the retired mechanism as historical context.
  assert.ok(
    !/process\.env\.CLAUDE_CODE_SSE_PORT/.test(tickSrc),
    'the retired SSE-port env read should be fully removed, not just dormant'
  );
  assert.match(tickSrc, /select=pid/);
});

test('PARKED-LOOP FR-1: parent-liveness poll re-discovers and adopts a live CC parent before exiting', () => {
  assert.match(tickSrc, /rediscoverParentPid\(\)/);
  assert.match(tickSrc, /parentPid\s*=\s*rediscovered/);
});

test('SD-LEO-INFRA-FIX-WINDOWS-SESSION-001: the parent-liveness poll callback awaits rediscoverParentPid()', () => {
  // rediscoverParentPid() is now async (a fetch replaces the sync WMI call). A bare
  // Promise is always truthy, so an un-awaited call would make the caller's
  // `if (rediscovered)` check always pass — silently defeating the MAX_PARENT_MISSES
  // exit path (the tick would never correctly exit on genuine parent death).
  assert.match(tickSrc, /await\s+rediscoverParentPid\(\)/);
  assert.match(tickSrc, /setInterval\(async\s*\(\)\s*=>/, 'the parent-poll setInterval callback must be async');
});

test('PARKED-LOOP FR-2: exit is debounced by MAX_PARENT_MISSES consecutive discovery misses', () => {
  assert.match(tickSrc, /const\s+MAX_PARENT_MISSES\s*=\s*2\b/);
  assert.match(tickSrc, /parentMissCount\s*\+=\s*1/);
  assert.match(tickSrc, /parentMissCount\s*>=\s*MAX_PARENT_MISSES/);
});

test('PARKED-LOOP FR-2: a successful re-discovery resets the miss counter (no false exit)', () => {
  assert.match(tickSrc, /parentMissCount\s*=\s*0/);
});

test('PARKED-LOOP TR-2: released-row stop semantics preserved (re-discovery must not resurrect a released row)', () => {
  // Widened by SD-LEO-INFRA-FIX-WINDOWS-SESSION-001 from active-only to
  // in.(active,idle,stale) -- released/completed remain the only statuses that
  // still stop the tick loop; re-discovery does not change that boundary.
  assert.match(tickSrc, /status=in\.\(active,idle,stale\)/);
  assert.match(tickSrc, /Content-Range/);
});

/**
 * QF-20260729-704 — the adopted parent pid must reach the ROW, not only the marker file.
 *
 * MEASURED live on session e7c92ad8: row pid 35464 = ESRCH, watched parent 13028 = RUNNING
 * (claude), tick daemon 6888 = RUNNING, heartbeat advancing every 60s. The daemon was healthy and
 * the ROW was lying, because rotation was persisted to the marker (QF-20260727-703) and never to
 * claude_sessions.pid. Every consumer that OS-checks row.pid saw a corpse holding an SD claim.
 *
 * These are SOURCE-TEXT assertions, stated plainly rather than dressed up as behavioural: this file
 * exports nothing, so the established pattern here is to assert against the source. Each anchor is
 * distinctive enough that a rename fails the test loudly instead of passing vacuously.
 */
test('QF-704: the adoption branch persists the pid to the row, not just the marker', () => {
  assert.match(tickSrc, /writeMarker\(\);\s*(?:\/\/[^\n]*\n\s*)*persistAdoptedPid\(rediscovered\)/,
    'persistAdoptedPid(rediscovered) must follow writeMarker() in the adoption path');
});

test('QF-704: persistAdoptedPid writes pid and cannot resurrect a released row', () => {
  // Normalise CRLF — this repo checks in \r\n and a \n-anchored slice silently returns nothing,
  // which would make every assertion below vacuous rather than failing.
  const src = tickSrc.replace(/\r\n/g, '\n');
  const start = src.indexOf('function persistAdoptedPid');
  assert.ok(start > -1, 'persistAdoptedPid must exist');
  const body = src.slice(start, src.indexOf('// ── Telemetry write', start));
  assert.ok(body.length > 100, 'failed to isolate the function body — assertions would be vacuous');
  assert.match(body, /JSON\.stringify\(\{\s*pid\s*\}\)/, 'must PATCH the pid column');
  assert.match(body, /status=in\.\(active,idle,stale\)/, 'must exclude released rows');
  assert.match(body, /\.catch\(/, 'must be fail-soft — telemetry may never kill a healthy tick');
});

test('QF-704: the steady-state PATCH body is EXACTLY the two timestamps (hot path unchanged)', () => {
  // The fix belongs in the rare adoption path, not the every-tick write: a pid in the steady-state
  // body would be rewritten every tick from a value nothing re-verifies. Asserting the body's exact
  // shape is stronger than asserting the absence of "pid", which would also pass if the body were
  // deleted. (The FIRST-tick POST does legitimately carry pid: process.pid — a naive search for
  // "pid" in this file finds that one and proves nothing about the hot path.)
  const src = tickSrc.replace(/\r\n/g, '\n');
  assert.match(src, /JSON\.stringify\(\{\s*process_alive_at: now,\s*heartbeat_at: now,\s*\}\)/,
    'steady-state PATCH must carry exactly process_alive_at + heartbeat_at');
});
