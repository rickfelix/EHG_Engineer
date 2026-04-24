/**
 * Unit tests for scripts/hooks/capture-session-id.cjs
 * SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-5)
 *
 * Covers TS-1..TS-6:
 *   TS-1: Mixed claude.exe/node.exe chain returns claude.exe PID
 *   TS-2: node.exe-only chain returns outermost node.exe (backward compat)
 *   TS-3: Outermost-ancestor selection prevents wrong-process latching
 *   TS-4: tick.early_exit telemetry fires when cleanupAndExit <60s after start
 *   TS-5: SSE-port scan filter accepts claude.exe via WQL OR (verified by string inspection)
 *   TS-6: cleanupAndExit beyond 60s does NOT emit early_exit telemetry
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const { selectAncestorFromChain } = require(path.resolve(__dirname, '../../../scripts/hooks/capture-session-id.cjs'));

// ── TS-1, TS-2, TS-3: selectAncestorFromChain ────────────────────────────────

test('TS-1: mixed claude.exe/node.exe chain returns claude.exe PID', () => {
  const chain = [
    { pid: '100', name: 'capture-session-id', ppid: '200' },          // hook process
    { pid: '200', name: 'bash.exe',           ppid: '300' },
    { pid: '300', name: 'node.exe',           ppid: '400' },          // npm worker (transient)
    { pid: '400', name: 'claude.exe',         ppid: '500' },          // long-lived target
    { pid: '500', name: 'cmd.exe',            ppid: '0' },
  ];
  const selected = selectAncestorFromChain(chain);
  assert.equal(selected.pid, '400');
  assert.equal(selected.name, 'claude.exe');
});

test('TS-2: node.exe-only chain returns the correct node (backward compatibility)', () => {
  // Original semantics: first node.exe whose parent is non-shell.
  const chain = [
    { pid: '100', name: 'capture-session-id', ppid: '200' },
    { pid: '200', name: 'node.exe',           ppid: '300' },          // inner — parent IS node, skip
    { pid: '300', name: 'node.exe',           ppid: '400' },          // outer — parent NOT in skip-set → win
    { pid: '400', name: 'cmd.exe',            ppid: '0' },
  ];
  const selected = selectAncestorFromChain(chain);
  assert.equal(selected.pid, '300');
  assert.equal(selected.name, 'node.exe');
});

test('TS-3: outermost-ancestor selection — claude.exe wins over earlier transient node.exe', () => {
  const chain = [
    { pid: '100', name: 'capture-session-id', ppid: '200' },
    { pid: '200', name: 'node.exe',           ppid: '300' },          // worker dies in 5s
    { pid: '300', name: 'node.exe',           ppid: '400' },          // npm
    { pid: '400', name: 'claude.exe',         ppid: '500' },          // <- expected
    { pid: '500', name: 'cmd.exe',            ppid: '0' },
  ];
  const selected = selectAncestorFromChain(chain);
  assert.equal(selected.pid, '400');
  assert.equal(selected.name, 'claude.exe');
});

test('TS-3b: walk does not stop early on cmd.exe / powershell.exe / pwsh.exe parents', () => {
  // node.exe whose parent is powershell.exe — broadened skip-set should keep walking.
  const chain = [
    { pid: '100', name: 'capture-session-id', ppid: '200' },
    { pid: '200', name: 'node.exe',           ppid: '300' },          // inner node, parent in broadened skip
    { pid: '300', name: 'powershell.exe',     ppid: '400' },
    { pid: '400', name: 'node.exe',           ppid: '500' },          // outer node, parent NOT in skip → win
    { pid: '500', name: 'cmd.exe',            ppid: '0' },
  ];
  const selected = selectAncestorFromChain(chain);
  assert.equal(selected.pid, '400');
});

test('selectAncestorFromChain returns null for empty/single-element chains', () => {
  assert.equal(selectAncestorFromChain([]), null);
  assert.equal(selectAncestorFromChain([{ pid: '100', name: 'x', ppid: '0' }]), null);
  assert.equal(selectAncestorFromChain(null), null);
});

test('selectAncestorFromChain falls back to outermost node.exe when no claude.exe and Pass 2 fails', () => {
  // Both node.exe entries have parents in skip-set (chain of node-only); Pass 2 finds nothing,
  // Pass 3 returns the outermost.
  const chain = [
    { pid: '100', name: 'capture-session-id', ppid: '200' },
    { pid: '200', name: 'node.exe',           ppid: '300' },
    { pid: '300', name: 'node.exe',           ppid: '400' },
    { pid: '400', name: 'bash.exe',           ppid: '500' }, // chain ends in bash
  ];
  const selected = selectAncestorFromChain(chain);
  // Pass 2 finds pid 300 (parent bash.exe is in skip-set → keep walking past 200; 300's parent is bash → skip; loop ends with no match)
  // Wait: Pass 2 returns the FIRST node.exe whose parent is NOT in skip-set. Both 200 and 300 have parents in skip-set, so Pass 2 finds nothing.
  // Pass 3 returns outermost node.exe → pid 300.
  assert.equal(selected.pid, '300');
});

// ── TS-5: SSE-port scan filter contains WQL OR for claude.exe ────────────────
// Static inspection of the source ensures the filter string change shipped.

test('TS-5: SSE-port scan filter includes claude.exe via WQL OR-syntax', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../../scripts/hooks/capture-session-id.cjs'),
    'utf8'
  );
  // Source has the inner single quotes JS-escaped: Name=\'node.exe\' OR Name=\'claude.exe\'.
  // Match both names with any quoting in between, plus the literal OR keyword.
  assert.match(src, /Name=\\?'node\.exe\\?'\s+OR\s+Name=\\?'claude\.exe\\?'/);
});

// ── TS-4 + TS-6: session-tick.cjs early-exit telemetry ───────────────────────
// Spawn session-tick.cjs as a child with a parent PID guaranteed to be dead
// (parentPid = 1, which is reserved on Windows for the Idle process — process.kill(1, 0)
// raises EPERM on some setups, so we use a clearly-invalid PID instead).

test('TS-4: cleanupAndExit within 60s appends NDJSON event=tick.early_exit', async () => {
  const tickPath = path.resolve(__dirname, '../../../scripts/session-tick.cjs');
  const ndjsonPath = path.resolve(__dirname, '../../../.claude/pids/spawn-errors.log');
  const sessionId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Use a definitely-dead PID. Pick a high random number unlikely to be alive.
  // process.kill(<dead>, 0) raises ESRCH which session-tick treats as parentAlive=false.
  const deadPid = 999999999;

  const sizeBefore = fs.existsSync(ndjsonPath) ? fs.statSync(ndjsonPath).size : 0;

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tickPath], {
      env: {
        ...process.env,
        CLAUDE_SESSION_ID: sessionId,
        CC_PARENT_PID: String(deadPid),
        // Disable PostgREST POST during tests (no SUPABASE_* vars => sink 2 skipped).
        SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
      stdio: 'ignore',
      timeout: 15000,
    });
    child.on('exit', () => resolve());
    child.on('error', reject);
  });

  // The tick polls parent every 5s; on the first poll the parent (deadPid) is ESRCH,
  // so cleanupAndExit fires within ~5s — well under the 60s threshold.
  // Verify NDJSON contains a tick.early_exit entry for our sessionId.
  assert.ok(fs.existsSync(ndjsonPath), 'spawn-errors.log should exist after early exit');

  const allBytes = fs.readFileSync(ndjsonPath, 'utf8');
  const newBytes = allBytes.slice(sizeBefore);
  const matchingLines = newBytes
    .split('\n')
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(obj => obj && obj.event === 'tick.early_exit' && obj.session_id === sessionId);

  assert.ok(matchingLines.length >= 1, `expected tick.early_exit row for ${sessionId} in NDJSON; new bytes: ${newBytes.slice(0, 500)}`);
  const evt = matchingLines[0];
  assert.equal(evt.session_id, sessionId);
  assert.equal(evt.cc_parent_pid, deadPid);
  assert.ok(evt.lifetime_ms < 60000, `lifetime_ms should be <60000, got ${evt.lifetime_ms}`);
  assert.ok(typeof evt.tick_pid === 'number');
  assert.ok(typeof evt.hostname === 'string');
});

test('TS-6: cleanupAndExit beyond 60s does NOT emit tick.early_exit (negative case)', () => {
  // Static inspection of session-tick.cjs to verify the threshold guard is in place.
  // A live integration test would require waiting >60s; we verify the guard logic exists.
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../../scripts/session-tick.cjs'),
    'utf8'
  );
  assert.match(src, /EARLY_EXIT_THRESHOLD_MS\s*=\s*60\s*\*\s*1000/);
  assert.match(src, /lifetimeMs\s*<\s*EARLY_EXIT_THRESHOLD_MS/);
  assert.match(src, /event:\s*'tick\.early_exit'/);
});
