/**
 * SD-LEO-INFRA-LOOP-STATE-AWAITING-001 — the latch clears, and the guard can finally fire.
 *
 * WHY THIS DRIVES AN INJECTED CLIENT RATHER THAN A STUB POSTGREST SUBPROCESS.
 * The first version of this file spawned the real hook against a local stub PostgREST server, which
 * meant setting SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the child's env. audit-db-test-guards
 * correctly refused it: the unit tier loads the real .env (vitest.config.js) and `||=` in
 * tests/setup.unit.js never overwrites, so a unit test really can hold live credentials — the guard
 * is load-bearing, not a formality.
 *
 * I first tried to narrow the guard to allow the pattern, arguing that WRITING an env var is not
 * READING ambient credentials. That was wrong and got reverted: in JavaScript `:` is also
 * destructuring-rename, so the narrowed rule let `const { SUPABASE_URL: url } = process.env` through
 * — a genuine credential read, caught before the change and invisible after it. The stub-server
 * shape is not distinguishable from that evasion by regex, so the honest fix was to stop needing
 * the credentials at all.
 *
 * The conditional write is now injectable, so the safety invariant is asserted directly against a
 * fake client. No credentials, no network, and it runs in the always-on tier — which the
 * `integration`-typed alternative would not have (the vitest `db` project is gated OFF, so those
 * tests would have been written, merged, reported green and never executed once).
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOOK = path.join(repoRoot, 'scripts/hooks/loop-state-resume-clear.cjs');
const { shouldClearLatch, applyClear, LATCHED_STATES } = createRequire(import.meta.url)(HOOK);

describe('shouldClearLatch — the pure decision', () => {
  it('clears awaiting_tick and DELIBERATELY leaves exited alone', () => {
    // 'exited' was in this set until review found three sites that write it meaning "the loop
    // legitimately ended" (coordination-events.cjs:388, stop-loop-wakeup-reminder.cjs:224) plus
    // singleton-refresh-sequencer.cjs:67, which reads it as UNHEALTHY inside a mutex path.
    // Promoting it back to 'active' would make a deliberate exit non-durable.
    expect(LATCHED_STATES).toEqual(['awaiting_tick']);
    expect(shouldClearLatch({ sessionId: 's', loopState: 'awaiting_tick' }).clear).toBe(true);
    expect(shouldClearLatch({ sessionId: 's', loopState: 'exited' }).clear).toBe(false);
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
 * Records the builder chain so we can assert on the write the hook ACTUALLY issues. A test that
 * only checked "it didn't throw" would pass on a hook that wrote nothing, or on one that wrote
 * unconditionally — which is the dangerous direction.
 */
function fakeClient() {
  const calls = { from: null, update: null, eq: null, in: null };
  const chain = {
    update(patch) { calls.update = patch; return chain; },
    eq(col, val) { calls.eq = [col, val]; return chain; },
    in(col, vals) { calls.in = [col, vals]; return chain; },
    then(res) { return Promise.resolve({ error: null }).then(res); },
  };
  return { calls, from(table) { calls.from = table; return chain; } };
}

describe('applyClear — the conditional write IS the safety invariant', () => {
  it('scopes the update to one session AND to the latched state only', async () => {
    const c = fakeClient();
    await applyClear(c, 'sess-1');
    expect(c.calls.from).toBe('claude_sessions');
    expect(c.calls.update).toEqual({ loop_state: 'active' });
    expect(c.calls.eq).toEqual(['session_id', 'sess-1']);
    // The predicate must ride on the write itself. An unconditional stamp would clear a
    // never-latched operator session into the attrition guard's reach.
    expect(c.calls.in).toEqual(['loop_state', ['awaiting_tick']]);
  });

  it('carries the predicate for every session id, not just the first', async () => {
    // Guards against a "latch the predicate once" refactor that would leave later calls unscoped.
    for (const id of ['a', 'b-2', '11111111-2222-3333-4444-555555555555']) {
      const c = fakeClient();
      await applyClear(c, id);
      expect(c.calls.eq).toEqual(['session_id', id]);
      expect(c.calls.in[1]).toEqual(['awaiting_tick']);
    }
  });
});

describe('the real hook process', () => {
  it('exits 0 and writes NOTHING when handed no session id', async () => {
    // End-to-end over the actual file: stdin parse, the no-id fail-open path, and a clean exit.
    // Needs no credentials precisely because it returns before building a client — which is also
    // the assertion: the no-id path must never reach the database.
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] });
      const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
      child.stdin.end(JSON.stringify({}));
      child.on('close', (c) => { clearTimeout(timer); resolve(c); });
    });
    expect(code).toBe(0);   // a hook that can break a turn is worse than a guard that misses one
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
