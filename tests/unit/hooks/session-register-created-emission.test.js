/**
 * QF-20260725-480 — session-creation lifecycle emission was decoupled from session creation.
 *
 * Measured: 4 sessions created in 12h emitted ZERO SESSION_CREATED while 9 fired for sessions
 * created outside the window. The SessionStart registration hook — the creation path for every
 * real session — upserted claude_sessions and emitted nothing. (The events that DID fire came
 * from other emitters: lib/session-manager.mjs and the claim_sd RPC.)
 *
 * These tests pin the emission AT THE SEAM and are discriminating in BOTH directions: a fresh
 * insert must emit, and a heartbeat update must NOT. Asserting only the first would let "emit
 * unconditionally" pass, turning SESSION_CREATED into "session touched".
 *
 * NOTE ON THE 'no-window' TEST BELOW: the first version of this fix used a created_at-vs-now
 * time window. These unit tests passed, because they seeded a months-old created_at. Running
 * the REAL hook twice for one session then produced TWO SESSION_CREATED rows — a resume inside
 * the window still looked new. The lesson is recorded as a test, not just a comment.
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
const NEW = { probed: true, existed: false };      // row genuinely absent before the upsert
const EXISTING = { probed: true, existed: true };  // heartbeat update
const UNKNOWN = { probed: false, existed: true };  // probe failed — must stay silent

describe('QF-20260725-480: SESSION_CREATED is emitted by the session-register hook', () => {
  it('emits SESSION_CREATED when the row did NOT exist before the upsert', async () => {
    const supabase = makeSupabase();
    const emitted = await emitSessionCreated(supabase, { sessionId: 'sess-new-1', payload: PAYLOAD, prior: NEW });

    expect(emitted).toBe(true);
    expect(supabase.calls).toHaveLength(1);
    const { fn, args } = supabase.calls[0];
    expect(fn).toBe('log_session_event');
    expect(args.p_event_type).toBe('SESSION_CREATED');
    expect(args.p_session_id).toBe('sess-new-1');
    // The event must be attributable or it cannot be correlated to a machine/terminal.
    expect(args.p_machine_id).toBe('HOST-1');
    expect(args.p_terminal_id).toBe('tty3');
    expect(args.p_metadata.source).toBe('session-register-hook');
  });

  it('does NOT emit on a heartbeat UPDATE of an existing session', async () => {
    const supabase = makeSupabase();
    const emitted = await emitSessionCreated(supabase, { sessionId: 'sess-old-1', payload: PAYLOAD, prior: EXISTING });
    expect(emitted).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it('REGRESSION: newness carries no time window — an immediate re-run still does not emit', async () => {
    // The defect this replaces: with a created_at-vs-now window, a resume landing inside the
    // window emitted a SECOND SESSION_CREATED. Newness is now settled by prior existence, so
    // elapsed time cannot make an existing session look new. Caught only by end-to-end
    // acceptance (running the real hook twice), never by the mocked tests above.
    const supabase = makeSupabase();
    for (let i = 0; i < 3; i++) {
      expect(await emitSessionCreated(supabase, { sessionId: 'sess-rerun', payload: PAYLOAD, prior: EXISTING })).toBe(false);
    }
    expect(supabase.calls).toHaveLength(0);
  });

  it('fails CLOSED when the existence probe did not succeed — silence, not a false emit', async () => {
    for (const prior of [UNKNOWN, null, undefined, {}]) {
      const supabase = makeSupabase();
      const emitted = await emitSessionCreated(supabase, { sessionId: 'sess-x', payload: PAYLOAD, prior });
      expect(emitted).toBe(false);
      expect(supabase.calls).toHaveLength(0);
    }
  });

  it('is actually WIRED INTO the hook: main() probes first, then calls it on success', () => {
    // Applying the lesson from SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001: testing the
    // function is not testing the invariant. Every other test here calls emitSessionCreated
    // directly, so deleting the CALL SITE in main() would leave them all green and re-ship
    // the exact defect this QF fixes — a session-creation emitter that never runs.
    //
    // Honest about its limits: this is a source-level assertion, not a behavioural one. It
    // dies if the call or the probe is removed, which are the mutations that matter.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'scripts', 'hooks', 'session-register.cjs'), 'utf8',
    );
    // The probe MUST precede the upsert; after it, the row exists either way.
    expect(src.indexOf('await sessionRowExisted(')).toBeGreaterThan(-1);
    expect(src.indexOf('await sessionRowExisted(')).toBeLessThan(src.indexOf(".from('claude_sessions')\n    .upsert("));
    const successBranch = src.slice(src.indexOf('session-register: registered'));
    expect(successBranch).toMatch(/await\s+emitSessionCreated\(/);
  });

  it('never throws when the telemetry RPC fails — SessionStart must not abort', async () => {
    const exploding = { rpc: async () => { throw new Error('supabase down'); } };
    await expect(
      emitSessionCreated(exploding, { sessionId: 'sess-boom', payload: PAYLOAD, prior: NEW }),
    ).resolves.toBe(false);
  });
});
