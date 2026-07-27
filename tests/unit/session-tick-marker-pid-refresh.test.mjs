/**
 * QF-20260727-703 — the tick marker must FOLLOW an adopted parent PID.
 *
 * THE BUG. scripts/session-tick.cjs wrote .claude/pids/tick-<session>.json exactly once, at
 * spawn. When the pinned CC parent died and rediscoverParentPid() adopted a live replacement
 * (/clear, reconnect, compaction), the adoption happened IN MEMORY ONLY — the marker kept
 * naming the dead original pid.
 *
 * WHY THAT IS CRITICAL. lib/fleet/claimant-liveness.cjs treats this marker's cc_parent_pid as
 * its strongest signal ("the only artifact that ties a pid back to the session that owns it")
 * and it is that classifier's ONLY path to a DEAD verdict — every other path deliberately fails
 * open to INDETERMINATE because a recorded pid goes stale on rotation. So a stale marker turned
 * a LIVE session into a DEAD verdict and its claims were refused or reaped. Only long-lived
 * sessions rotate their PID, so the failure was inverted with usefulness: the more work a seat
 * did, the likelier it was reaped. Reported by session 24ca166f (38h old, 2 SDs shipped that
 * day) after its own claim was cleared as a "corpse claim".
 *
 * Behavioral, not source-pinned: spawns the real script against a local mock PostgREST and
 * observes the marker file on disk. Safety mirrors session-tick-spawn-observe.test.mjs — the
 * child gets a 127.0.0.1 mock URL, a dummy key, and a test-prefixed CLAUDE_SESSION_ID, so it
 * cannot reach or mutate a live claude_sessions row.
 *
 * MUST live in the main repo tree: vitest config excludes .worktrees, so a test authored only
 * in a worktree would silently never run in CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const tickPath = resolve(repoRoot, 'scripts/session-tick.cjs');

const TEST_SESSION_ID = 'test-tick-marker-refresh-0000-0000-0000';
const markerPath = resolve(repoRoot, '.claude/pids', `tick-${TEST_SESSION_ID}.json`);
const FAST_TICK_MS = 150;
const FAST_POLL_MS = 150;

/** Minimal PostgREST-shaped mock: GET answers the re-query with state.pid. */
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
        res.writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(state.exists ? [{ pid: state.pid }] : []));
        return;
      }
      if (req.method === 'PATCH') {
        const filter = url.searchParams.get('status') || '';
        const allowed = filter.startsWith('in.(') ? filter.slice(4, -1).split(',') : [];
        const matches = state.exists && allowed.includes(state.status);
        if (matches) state.lastPatchAt = Date.now();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Range': `0-${matches ? 0 : -1}/${matches ? 1 : 0}`,
        }).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('[]');
    });
  });
  return new Promise((r) => { server.listen(0, '127.0.0.1', () => r(server)); });
}

function spawnFakeParent() {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 999999)'], { stdio: 'ignore' });
}

function spawnTick({ port, ccParentPid }) {
  return spawn(process.execPath, [tickPath], {
    env: {
      ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${port}`,
      SUPABASE_SERVICE_ROLE_KEY: 'test-dummy-key',
      CLAUDE_SESSION_ID: TEST_SESSION_ID,
      CC_PARENT_PID: String(ccParentPid),
      LEO_TICK_MS: String(FAST_TICK_MS),
      LEO_PARENT_POLL_MS: String(FAST_POLL_MS),
      LEO_TELEMETRY_DEBUG: '0',
    },
    stdio: 'ignore',
  });
}

function readMarker() {
  try { return JSON.parse(readFileSync(markerPath, 'utf8')); } catch { return null; }
}

async function waitUntil(predicate, { timeoutMs = 8000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

test('QF-703: marker cc_parent_pid is rewritten when a rotated parent PID is adopted',
  { timeout: 20000 }, async () => {
    // state.pid is THIS test process — a genuinely live pid, and necessarily different from the
    // fake parent's, which is what rediscoverParentPid() requires before it will adopt.
    const state = { exists: true, status: 'active', pid: process.pid, lastPatchAt: 0 };
    const server = await startMockServer(state);
    const fakeParent = spawnFakeParent();
    let tick;
    try {
      tick = spawnTick({ port: server.address().port, ccParentPid: fakeParent.pid });

      const wroteMarker = await waitUntil(() => readMarker()?.cc_parent_pid === fakeParent.pid);
      assert.ok(wroteMarker, 'tick should write a marker naming its original CC parent pid');
      const before = readMarker();

      // Rotate: the pinned parent dies, a live replacement is discoverable via the re-query.
      fakeParent.kill('SIGKILL');

      const adopted = await waitUntil(() => readMarker()?.cc_parent_pid === process.pid);
      const after = readMarker();
      assert.ok(
        adopted,
        `marker must follow the adopted pid: expected cc_parent_pid=${process.pid}, ` +
        `found ${after?.cc_parent_pid} (a stale marker makes claimant-liveness classify this ` +
        'LIVE session DEAD — the only path to that verdict — and its claims get reaped)',
      );
      assert.equal(tick.exitCode, null, 'tick must still be running after adopting the new pid');

      // started_at means "when this daemon started". Rewriting the marker must not silently
      // convert it into "time of last rewrite" for any reader treating it as a daemon age.
      assert.equal(after.started_at, before.started_at,
        'started_at must be captured once, not recomputed on every marker write');
      assert.equal(after.session_id, TEST_SESSION_ID, 'session_id must survive the rewrite');
      assert.equal(after.tick_pid, before.tick_pid, 'tick_pid must survive the rewrite');
    } finally {
      if (tick && !tick.killed) { try { tick.kill('SIGKILL'); } catch { /* gone */ } }
      if (!fakeParent.killed) { try { fakeParent.kill('SIGKILL'); } catch { /* gone */ } }
      server.close();
      if (existsSync(markerPath)) rmSync(markerPath, { force: true });
    }
  });
