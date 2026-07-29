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
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOOK = path.join(repoRoot, 'scripts/hooks/loop-state-resume-clear.cjs');
const { shouldClearLatch, applyClear, resolveSessionId, parsePayload, loadClient, LATCHED_STATES } = createRequire(import.meta.url)(HOOK);

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
  // MIRRORS THE REAL SPLIT, and that is the point. supabase-js separates PostgrestQueryBuilder
  // (which has update() but NOT eq/in) from the PostgrestFilterBuilder that update() returns. A flat
  // fake exposing all four on one object is strictly MORE PERMISSIVE than production: reordering
  // applyClear to .from().eq().in().update() is a runtime TypeError against the real client, and a
  // flat fake keeps every test green through it. Review caught exactly that.
  const filterBuilder = {
    eq(col, val) { calls.eq = [col, val]; return filterBuilder; },
    in(col, vals) { calls.in = [col, vals]; return filterBuilder; },
    then(res) { return Promise.resolve({ error: null }).then(res); },
  };
  const queryBuilder = {
    update(patch) { calls.update = patch; return filterBuilder; },   // no eq/in here, exactly as in production
  };
  return { calls, from(table) { calls.from = table; return queryBuilder; } };
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

describe('resolveSessionId / parsePayload — pure, and deliberately NOT a subprocess', () => {
  // The subprocess test this replaces spawned the hook with no env option, so it inherited the
  // parent CLAUDE_SESSION_ID and real service-role credentials, built a live client and wrote to
  // production claude_sessions — while asserting only exit 0, which the safe path and the writing
  // path BOTH satisfy. It could not distinguish them. That is this SD's own defect class, so the
  // seam moved into a pure function that has no reach at all.
  it('prefers the payload session id over the environment', () => {
    expect(resolveSessionId({ session_id: 'from-stdin' }, { CLAUDE_SESSION_ID: 'from-env' })).toBe('from-stdin');
  });

  it('falls back to CLAUDE_SESSION_ID and NEVER to the generic SESSION_ID', () => {
    expect(resolveSessionId({}, { CLAUDE_SESSION_ID: 'env-id' })).toBe('env-id');
    // SESSION_ID is used elsewhere in the repo; a foreign value there would clear a DIFFERENT
    // session's latch, disarming the guard for a seat that never resumed.
    expect(resolveSessionId({}, { SESSION_ID: 'someone-elses-id' })).toBe('');
  });

  it('yields empty for every no-id shape, which is the fail-open path', () => {
    for (const [p, e] of [[{}, {}], [null, {}], [{ session_id: '' }, {}], [{ session_id: 42 }, {}]]) {
      expect(resolveSessionId(p, e), JSON.stringify(p)).toBe('');
    }
  });

  it('tolerates absent and malformed stdin without throwing', () => {
    expect(parsePayload('')).toEqual({});
    expect(parsePayload('not json at all')).toEqual({});
    expect(parsePayload('{\"session_id\":\"s\"}')).toEqual({ session_id: 's' });
  });
});

describe('loadClient — the banner suppression is PINNED, not merely measured once', () => {
  it('swallows everything the require writes to stdout, and restores it afterwards', () => {
    // UserPromptSubmit stdout is injected into the model's context and this hook runs on EVERY turn
    // for EVERY seat, so a regression here is silent and fleet-wide. Injecting the require-er keeps
    // this credential-free: the FACTORY is injected, so nothing here names a client factory or any
    // SUPABASE_* identifier — which is exactly what the DB-test guard reads as 'reaches a live database'.
    const noisy = () => { process.stdout.write('BANNER-76-BYTES'); return { fake: true }; };
    const client = loadClient(noisy);
    expect(client).toEqual({ fake: true });
    expect(loadClient.lastSuppressedBytes).toBe('BANNER-76-BYTES'.length);   // it was written...
    expect(process.stdout.write).not.toBe(undefined);                        // ...and stdout still works
  });

  it('restores stdout even when the require THROWS', () => {
    const boom = () => { process.stdout.write('partial'); throw new Error('client construction failed'); };
    expect(() => loadClient(boom)).toThrow('client construction failed');
    // The finally must run, or every later write from this process would vanish.
    let seen = '';
    const real = process.stdout.write;
    process.stdout.write = (c) => { seen += c; return true; };
    process.stdout.write('after');
    process.stdout.write = real;
    expect(seen).toBe('after');
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
