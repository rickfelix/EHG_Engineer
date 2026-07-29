/**
 * SD-LEO-INFRA-LOOP-STATE-AWAITING-001 — the latch clears, and the guard can finally fire.
 *
 * WHY THESE ARE UNIT TESTS DRIVING A REAL SUBPROCESS, not `integration` tests.
 * The PRD originally typed the behavioural scenarios `integration`, which routes them to the vitest
 * `db` project — and that project is gated OFF (`assessDbTarget().allowed === false`, no CI sets
 * VITEST_DB_ALLOW_REF). An empty include resolves ZERO files, so those tests would have been
 * written, merged, reported green, and never executed once. That is the same defect this SD is
 * about, in the tests for this SD.
 *
 * So the behavioural half runs here instead: supabase-js speaks PostgREST over plain HTTP, so a
 * local stub server IS a database as far as the hook is concerned. We spawn the REAL hook against
 * it and assert on what it actually wrote. Hermetic, no live DB, runs in the default tier.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOOK = path.join(repoRoot, 'scripts/hooks/loop-state-resume-clear.cjs');
const { shouldClearLatch, LATCHED_STATES } = createRequire(import.meta.url)(HOOK);

describe('shouldClearLatch — the pure decision', () => {
  it('clears BOTH latched values, because exited is the more dangerous one', () => {
    // 'exited' is written only by the sweep, meaning "released by this cycle", while the guard
    // branch it feeds asserts "loop legitimately ended". Nothing reset it, so it waved through a
    // live claim-holding seat — a live bypass, not an inert branch.
    expect(LATCHED_STATES).toEqual(['awaiting_tick', 'exited']);
    expect(shouldClearLatch({ sessionId: 's', loopState: 'awaiting_tick' }).clear).toBe(true);
    expect(shouldClearLatch({ sessionId: 's', loopState: 'exited' }).clear).toBe(true);
  });

  it('NEGATIVE CONTROL — never touches a session that was never in the loop machine', () => {
    // THE OPERATOR-NEVER-BLOCKED INVARIANT. Operators, Adam, Solomon and the coordinator all claim
    // SDs. If this cleared null/'unknown' to 'active', it would place a human inside the attrition
    // guard's reach — the one thing this must never do. Without this control, "clear everything"
    // would satisfy the assertion above.
    for (const loopState of [null, undefined, 'unknown', 'weird', 42, {}]) {
      const r = shouldClearLatch({ sessionId: 's', loopState });
      expect(r.clear, String(loopState)).toBe(false);
      expect(r.reason).toBe('not_latched');
    }
  });

  it('an already-active session is left alone, and a session with no id is a no-op', () => {
    expect(shouldClearLatch({ sessionId: 's', loopState: 'active' })).toEqual({ clear: false, reason: 'already_active' });
    expect(shouldClearLatch({ loopState: 'awaiting_tick' })).toEqual({ clear: false, reason: 'no_session_id' });
    expect(shouldClearLatch()).toEqual({ clear: false, reason: 'no_session_id' });
  });
});

/**
 * The stub PostgREST. It records every request so we can assert on the WRITE the hook issued,
 * which is the thing that matters — a test that only checked the exit code would pass on a hook
 * that did nothing at all.
 */
function startStub() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }));
  });
}

let stub;
beforeAll(async () => { stub = await startStub(); });
afterAll(() => new Promise((r) => stub.server.close(r)));

/**
 * MUST be async spawn, never spawnSync. spawnSync BLOCKS this process's event loop, and the stub
 * server lives in this same process — so the child's connection can never be accepted and both
 * sides deadlock until the timeout. The symptom is indistinguishable from a hung hook (SIGTERM,
 * zero requests recorded), which is exactly how it presented before being traced.
 */
function runHook(sessionId, urlOverride) {
  stub.requests.length = 0;
  const url = urlOverride || `http://127.0.0.1:${stub.port}`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], {
      env: {
        ...process.env,
        SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: 'stub-key-not-a-credential',
        CLAUDE_SESSION_ID: sessionId || '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    child.stdin.end(JSON.stringify({ session_id: sessionId }));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, requests: [...stub.requests] });
    });
  });
}

describe('THE REAL HOOK, driven end to end against a stub PostgREST', () => {
  it('issues a CONDITIONAL PATCH scoped to the session and to the latched values only', async () => {
    const { code, requests } = await runHook('11111111-2222-3333-4444-555555555555');
    expect(code).toBe(0);                             // fail-open: never breaks a turn

    const patch = requests.find((r) => r.method === 'PATCH');
    expect(patch, 'the hook issued no write at all').toBeTruthy();
    expect(patch.url).toContain('claude_sessions');
    expect(patch.url).toContain('11111111-2222-3333-4444-555555555555');
    // THE PREDICATE IS THE SAFETY INVARIANT — it must ride on the write itself. An unconditional
    // stamp would clear a never-latched operator session into the guard's reach.
    expect(decodeURIComponent(patch.url)).toMatch(/loop_state=in\.\(.*awaiting_tick.*exited.*\)/);
    expect(patch.body).toContain('active');
  });

  it('NEGATIVE CONTROL — no session id means no write at all', async () => {
    // Without this, "always PATCH" would satisfy the assertion above while stamping every session
    // the hook is ever handed.
    const { code, requests } = await runHook('');
    expect(code).toBe(0);
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  it('fails OPEN when the database is unreachable — a hook must never break a turn', async () => {
    const { code } = await runHook('aaaa-bbbb', 'http://127.0.0.1:1');   // nothing listening
    expect(code).toBe(0);
  });
});

describe('the hook is REGISTERED on the event that actually fires per turn', () => {
  it('is in the UserPromptSubmit group, not SessionStart', () => {
    // The whole defect was that the existing flip lived in a SessionStart hook, which does not fire
    // when a wakeup tick resumes a running session. Measured: session 0db9d282 reached turnCount=55
    // with ZERO typed prompts, and that counter is written only from UserPromptSubmit — so this is
    // the event that actually fires per turn, including a zero-tool turn (the attrition case).
    const settings = createRequire(import.meta.url)(path.join(repoRoot, '.claude/settings.json'));
    const inGroup = (evt) => (settings.hooks?.[evt] || [])
      .some((g) => (g.hooks || []).some((h) => String(h.command || '').includes('loop-state-resume-clear')));
    expect(inGroup('UserPromptSubmit'), 'clearer is not registered on UserPromptSubmit').toBe(true);
    expect(inGroup('SessionStart'), 'clearer must NOT be on SessionStart — that is the broken seam').toBe(false);
  });
});
