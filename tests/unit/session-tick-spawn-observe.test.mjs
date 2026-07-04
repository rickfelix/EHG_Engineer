/**
 * Spawn-and-observe tests for scripts/session-tick.cjs — SD-LEO-INFRA-FIX-WINDOWS-SESSION-001 (FR-4).
 *
 * Existing session-tick-*.test.mjs files are 100% static (readFileSync + regex match against
 * source text) — zero coverage of actual runtime behavior. These tests actually SPAWN the
 * script as a real child process and observe it against a local mock PostgREST server.
 *
 * Safety (TR-1): the spawned child's env explicitly overrides SUPABASE_URL to point at the
 * local mock (127.0.0.1, ephemeral port), a dummy SUPABASE_SERVICE_ROLE_KEY, and a
 * test-prefixed CLAUDE_SESSION_ID. The child never receives the authoring session's real
 * SUPABASE_URL/CLAUDE_SESSION_ID, so it is structurally incapable of touching a live
 * production row — there is no live claude_sessions table reachable from these tests at all.
 *
 * MUST be run from the main repo tree: vitest config excludes the .worktrees directory tree,
 * so a test authored only in an EXEC worktree would silently never execute in CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const tickPath = resolve(repoRoot, 'scripts/session-tick.cjs');

const TEST_SESSION_ID = 'test-tick-spawn-observe-0000-0000-000000000000';
const FAST_TICK_MS = 150;
const FAST_POLL_MS = 150;

/** Minimal PostgREST-shaped mock for claude_sessions + session_lifecycle_events. */
function startMockServer(state) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const sessionId = url.searchParams.get('session_id')?.replace(/^eq\./, '');

      // Guard: this mock only ever answers about the disposable test session_id.
      if (sessionId && !sessionId.startsWith('test-tick-')) {
        res.writeHead(400).end('refused: non-test session_id');
        return;
      }

      if (url.pathname === '/rest/v1/session_lifecycle_events') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('[]');
        return;
      }

      if (url.pathname !== '/rest/v1/claude_sessions') {
        res.writeHead(404).end();
        return;
      }

      if (req.method === 'GET') {
        // FR-2: re-query for the live pid.
        const row = state.exists ? [{ pid: state.pid }] : [];
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(row));
        return;
      }

      if (req.method === 'POST') {
        const prefer = req.headers['prefer'] || '';
        const parsed = JSON.parse(body || '{}');
        if (prefer.includes('resolution=ignore-duplicates')) {
          if (state.exists) {
            // Row already exists — ignore-duplicates must NOT touch it (this is the
            // FR-3 resurrection-guard behavior under test).
            res.writeHead(409).end();
            return;
          }
          state.exists = true;
          state.status = parsed.status;
          state.pid = parsed.pid;
          res.writeHead(201).end();
          return;
        }
        // merge-duplicates (should never be sent post-fix — FR-3 regression trap).
        state.exists = true;
        state.status = parsed.status;
        res.writeHead(201).end();
        return;
      }

      if (req.method === 'PATCH') {
        // The tick's own steady-state/release PATCH bodies never set `status` to anything
        // but 'released' (via releaseRowOnExitBestEffort, filtered separately below) — status
        // transitions to idle/stale/released in these tests are driven by the TEST directly
        // mutating `state.status` (simulating an external actor like stale-session-sweep).
        const filter = url.searchParams.get('status') || ''; // e.g. "in.(active,idle,stale)"
        const allowed = filter.startsWith('in.(')
          ? filter.slice(4, -1).split(',')
          : filter.startsWith('eq.') ? [filter.slice(3)] : [];
        const matches = state.exists && allowed.includes(state.status);
        if (matches) {
          state.lastPatchAt = Date.now();
          const patchBody = JSON.parse(body || '{}');
          if (patchBody.status === 'released') state.status = 'released';
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Range': `0-${matches ? 0 : -1}/${matches ? 1 : 0}`,
        }).end();
        return;
      }

      res.writeHead(405).end();
    });
  });
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise(server));
  });
}

/** Spawn a disposable, killable "fake parent" process whose PID we fully control. */
function spawnFakeParent() {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 999999)'], { stdio: 'ignore' });
}

function spawnTick({ port, ccParentPid, sessionId = TEST_SESSION_ID }) {
  return spawn(process.execPath, [tickPath], {
    env: {
      ...process.env,
      // SUPABASE_URL is checked first in session-tick.cjs's `||` chain, so it always wins
      // regardless of what NEXT_PUBLIC_SUPABASE_URL (inherited from the authoring session) holds.
      SUPABASE_URL: `http://127.0.0.1:${port}`,
      SUPABASE_SERVICE_ROLE_KEY: 'test-dummy-key',
      CLAUDE_SESSION_ID: sessionId,
      CC_PARENT_PID: String(ccParentPid),
      LEO_TICK_MS: String(FAST_TICK_MS),
      LEO_PARENT_POLL_MS: String(FAST_POLL_MS),
      LEO_TELEMETRY_DEBUG: '0',
    },
    stdio: 'ignore',
  });
}

async function waitUntil(predicate, { timeoutMs = 8000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function stopAll(...procs) {
  for (const p of procs) {
    if (p && !p.killed) { try { p.kill('SIGKILL'); } catch { /* already gone */ } }
  }
}

// ── TS-1: survives active -> idle ────────────────────────────────────────────

test('TS-1: tick survives an active -> idle status transition (does not self-exit)', { timeout: 10000 }, async () => {
  const state = { exists: true, status: 'active', pid: process.pid, lastPatchAt: 0 };
  const server = await startMockServer(state);
  const fakeParent = spawnFakeParent();
  const tick = spawnTick({ port: server.address().port, ccParentPid: fakeParent.pid });
  try {
    const gotFirstPatch = await waitUntil(() => state.lastPatchAt > 0);
    assert.ok(gotFirstPatch, 'expected at least one successful PATCH while active');

    state.status = 'idle';
    const patchBefore = state.lastPatchAt;
    const gotIdlePatch = await waitUntil(() => state.lastPatchAt > patchBefore);
    assert.ok(gotIdlePatch, 'tick must keep PATCHing successfully after the row moves to idle');
    assert.equal(tick.exitCode, null, 'tick process must still be running, not exited');
  } finally {
    await stopAll(tick, fakeParent);
    server.close();
  }
});

// ── TS-2: still stops on active -> released ─────────────────────────────────

test('TS-2: tick still stops on an active -> released transition (18b90582 fix preserved)', { timeout: 10000 }, async () => {
  const state = { exists: true, status: 'active', pid: process.pid, lastPatchAt: 0 };
  const server = await startMockServer(state);
  const fakeParent = spawnFakeParent();
  const tick = spawnTick({ port: server.address().port, ccParentPid: fakeParent.pid });
  try {
    const gotFirstPatch = await waitUntil(() => state.lastPatchAt > 0);
    assert.ok(gotFirstPatch, 'expected at least one successful PATCH while active');

    state.status = 'released';
    const exited = await waitUntil(() => tick.exitCode !== null);
    assert.ok(exited, 'tick must exit once the row is released (0-row PATCH detected)');
    assert.equal(tick.exitCode, 0);
  } finally {
    await stopAll(tick, fakeParent);
    server.close();
  }
});

// ── TS-3: PID rotation adopted via DB re-query ──────────────────────────────

test('TS-3: tick adopts a rotated parent PID from claude_sessions.pid instead of exiting', { timeout: 10000 }, async () => {
  const state = { exists: true, status: 'active', pid: 0, lastPatchAt: 0 };
  const server = await startMockServer(state);
  const oldParent = spawnFakeParent();
  const newParent = spawnFakeParent();
  state.pid = newParent.pid; // the DB already reflects the rotated live pid
  const tick = spawnTick({ port: server.address().port, ccParentPid: oldParent.pid });
  try {
    const gotFirstPatch = await waitUntil(() => state.lastPatchAt > 0);
    assert.ok(gotFirstPatch, 'expected at least one successful PATCH before rotation');

    await stopAll(oldParent); // simulate the pinned parent PID dying
    const patchBefore = state.lastPatchAt;
    const keptTicking = await waitUntil(() => state.lastPatchAt > patchBefore, { timeoutMs: 6000 });
    assert.ok(keptTicking, 'tick must adopt the rediscovered pid and keep ticking, not exit after MAX_PARENT_MISSES');
    assert.equal(tick.exitCode, null);
  } finally {
    await stopAll(tick, oldParent, newParent);
    server.close();
  }
});

test('TS-3b (negative): tick still exits when no live pid can be discovered', { timeout: 10000 }, async () => {
  const state = { exists: true, status: 'active', pid: 0, lastPatchAt: 0 }; // pid=0 -> GET returns no adoptable pid
  const server = await startMockServer(state);
  const oldParent = spawnFakeParent();
  const tick = spawnTick({ port: server.address().port, ccParentPid: oldParent.pid });
  try {
    const gotFirstPatch = await waitUntil(() => state.lastPatchAt > 0);
    assert.ok(gotFirstPatch, 'expected at least one successful PATCH before parent death');

    await stopAll(oldParent);
    const exited = await waitUntil(() => tick.exitCode !== null, { timeoutMs: 6000 });
    assert.ok(exited, 'tick must still exit via MAX_PARENT_MISSES when no live parent can be found');
  } finally {
    await stopAll(tick, oldParent);
    server.close();
  }
});

// ── TS-4: first-tick does not resurrect a released row ──────────────────────

test('TS-4: a first-tick fire against a pre-released row does not resurrect it', { timeout: 10000 }, async () => {
  const state = { exists: true, status: 'released', pid: process.pid, lastPatchAt: 0 };
  const server = await startMockServer(state);
  const fakeParent = spawnFakeParent();
  const tick = spawnTick({ port: server.address().port, ccParentPid: fakeParent.pid });
  try {
    const exited = await waitUntil(() => tick.exitCode !== null, { timeoutMs: 6000 });
    assert.ok(exited, 'tick must exit promptly against an already-released row');
    assert.equal(state.status, 'released', 'the row must remain released, not resurrected to active');
  } finally {
    await stopAll(tick, fakeParent);
    server.close();
  }
});

test('TS-4b: first-tick still self-heals a genuinely missing row', { timeout: 10000 }, async () => {
  const state = { exists: false, status: null, pid: 0, lastPatchAt: 0 };
  const server = await startMockServer(state);
  const fakeParent = spawnFakeParent();
  const tick = spawnTick({ port: server.address().port, ccParentPid: fakeParent.pid });
  try {
    const created = await waitUntil(() => state.exists && state.status === 'active');
    assert.ok(created, 'the missing row must be created with status=active within one tick');
    assert.equal(tick.exitCode, null);
  } finally {
    await stopAll(tick, fakeParent);
    server.close();
  }
});
