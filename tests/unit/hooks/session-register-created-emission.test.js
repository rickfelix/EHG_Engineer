/**
 * QF-20260725-480 — session-creation lifecycle emission was decoupled from session creation.
 *
 * Measured over 12 hours: 4 sessions created, 0 emitted SESSION_CREATED, while 9
 * SESSION_CREATED events fired for sessions created outside the window. The SessionStart
 * registration hook — the creation path for every real session — upserted claude_sessions
 * and emitted nothing.
 *
 * These tests pin the emission AT THE SEAM (the exported emitSessionCreated the hook
 * actually calls), and are discriminating in BOTH directions: a fresh insert must emit, and
 * a heartbeat update must NOT. Asserting only the first would let "emit unconditionally"
 * pass, which would turn SESSION_CREATED into "session touched" and destroy the signal.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// The hook under test is CommonJS; vitest itself must be imported as ESM.
const require = createRequire(import.meta.url);
const { emitSessionCreated } = require('../../../scripts/hooks/session-register.cjs');

function makeSupabase() {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => { calls.push({ fn, args }); return { data: null, error: null }; },
  };
}

const PAYLOAD = { hostname: 'HOST-1', tty: 'tty3', codebase: 'EHG_Engineer' };

describe('QF-20260725-480: SESSION_CREATED is emitted by the session-register hook', () => {
  it('emits SESSION_CREATED when the upsert actually INSERTED the row', async () => {
    const supabase = makeSupabase();
    const now = new Date().toISOString();
    const emitted = await emitSessionCreated(supabase, {
      sessionId: 'sess-new-1', payload: PAYLOAD, now, upserted: { created_at: now },
    });

    expect(emitted).toBe(true);
    expect(supabase.calls).toHaveLength(1);
    const { fn, args } = supabase.calls[0];
    expect(fn).toBe('log_session_event');
    expect(args.p_event_type).toBe('SESSION_CREATED');
    expect(args.p_session_id).toBe('sess-new-1');
    // The event must be attributable, or it cannot be correlated to a machine/terminal.
    expect(args.p_machine_id).toBe('HOST-1');
    expect(args.p_terminal_id).toBe('tty3');
    expect(args.p_metadata.source).toBe('session-register-hook');
  });

  it('does NOT emit on a heartbeat UPDATE of an existing session', async () => {
    const supabase = makeSupabase();
    // The hook also runs on resume/compaction; created_at is old because the DB wrote it
    // at insert and never moves it. Emitting here would mean "session touched", not created.
    const emitted = await emitSessionCreated(supabase, {
      sessionId: 'sess-old-1',
      payload: PAYLOAD,
      now: new Date().toISOString(),
      upserted: { created_at: '2026-02-11T14:43:49.938811+00:00' },
    });

    expect(emitted).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it('fails CLOSED when created_at is missing or unparseable — silence, not a false emit', async () => {
    const now = new Date().toISOString();
    for (const upserted of [null, {}, { created_at: 'not-a-date' }]) {
      const supabase = makeSupabase();
      const emitted = await emitSessionCreated(supabase, { sessionId: 'sess-x', payload: PAYLOAD, now, upserted });
      expect(emitted).toBe(false);
      expect(supabase.calls).toHaveLength(0);
    }
  });

  it('is actually WIRED INTO the hook: main() calls it on the successful-upsert branch', () => {
    // Applying the lesson from SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001: testing the
    // function is not testing the invariant. Every other test here calls emitSessionCreated
    // directly, so deleting the CALL SITE in main() would leave them all green and re-ship
    // the exact defect this QF fixes — a session-creation emitter that never runs.
    //
    // Honest about its limits: this is a source-level assertion, not a behavioural one. It
    // dies if the call is removed, which is the mutation that matters; it would not catch
    // the call being made on the wrong branch. A behavioural pin needs main() to accept
    // injected deps (it builds its own Supabase client), which is beyond this QF's scope.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'scripts', 'hooks', 'session-register.cjs'), 'utf8',
    );
    const successBranch = src.slice(src.indexOf('session-register: registered'));
    expect(successBranch).toMatch(/await\s+emitSessionCreated\(/);
  });

  it('never throws when the telemetry RPC fails — SessionStart must not abort', async () => {
    const now = new Date().toISOString();
    const exploding = { rpc: async () => { throw new Error('supabase down'); } };
    await expect(
      emitSessionCreated(exploding, { sessionId: 'sess-boom', payload: PAYLOAD, now, upserted: { created_at: now } }),
    ).resolves.toBe(false);
  });
});
