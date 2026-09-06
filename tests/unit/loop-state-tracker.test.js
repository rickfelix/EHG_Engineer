import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const tracker = require('../../scripts/lib/sessions/loop-state-tracker.cjs');
const { withSchemaDriftDetection } = require('../../lib/supabase-client-schema-drift.cjs');

// SD-LEO-INFRA-LOOP-STATE-SIGNAL-001 unit tests.
// Covers: constants match DB whitelist, validation, missing-session graceful
// handling, success path, and the supabase-unavailable fallback.

describe('loop-state-tracker: constants', () => {
  it('exports all four LOOP_STATE_* constants matching DB whitelist exactly', () => {
    // The DB CHECK constraint on claude_sessions.loop_state allows exactly:
    // ('active','awaiting_tick','exited','unknown'). The exported constants
    // MUST stay in lockstep with that whitelist or callsites silently corrupt
    // observability data.
    const sortedExports = [
      tracker.LOOP_STATE_ACTIVE,
      tracker.LOOP_STATE_AWAITING_TICK,
      tracker.LOOP_STATE_EXITED,
      tracker.LOOP_STATE_UNKNOWN
    ].sort();
    expect(sortedExports).toEqual(['active', 'awaiting_tick', 'exited', 'unknown']);
  });

  it('VALID_STATES contains the same four values as the named constants', () => {
    expect([...tracker.VALID_STATES].sort()).toEqual(
      ['active', 'awaiting_tick', 'exited', 'unknown']
    );
  });

  it('VALID_STATES is frozen', () => {
    expect(Object.isFrozen(tracker.VALID_STATES)).toBe(true);
  });

  it('isValidState accepts whitelist values and rejects others', () => {
    expect(tracker.isValidState('active')).toBe(true);
    expect(tracker.isValidState('awaiting_tick')).toBe(true);
    expect(tracker.isValidState('exited')).toBe(true);
    expect(tracker.isValidState('unknown')).toBe(true);
    expect(tracker.isValidState('garbage')).toBe(false);
    expect(tracker.isValidState('')).toBe(false);
    expect(tracker.isValidState(null)).toBe(false);
    expect(tracker.isValidState(undefined)).toBe(false);
  });
});

describe('loop-state-tracker: setLoopState', () => {
  let stderrMessages;
  let originalWrite;

  beforeEach(() => {
    stderrMessages = [];
    originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg) => {
      stderrMessages.push(String(msg));
      return true;
    };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  // QF-20260905-970: the real postgrest-js .update().eq().select(cols) chain
  // resolves { data, error } — count is NOT part of this shape (a {count,head}
  // options object on this arity-1 select() is silently discarded on the wire).
  // The mock must match that contract, not the pre-fix code's mental model of it.
  function makeMockSupabase({ updateError = null, data = [{ session_id: 'sess-12345678' }] } = {}) {
    return {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(async () => ({ error: updateError, data: updateError ? null : data }))
          }))
        }))
      }))
    };
  }

  it('throws on invalid state — that is a programmer error, not runtime', async () => {
    await expect(
      tracker.setLoopState('sess-12345678', 'garbage', { supabase: makeMockSupabase() })
    ).rejects.toThrow(/invalid state.*garbage/);
  });

  it('skips silently when sessionId is empty', async () => {
    const result = await tracker.setLoopState('', tracker.LOOP_STATE_ACTIVE, {
      supabase: makeMockSupabase()
    });
    expect(result).toEqual({ ok: false, skipped: 'no_session_id' });
  });

  it('returns ok when update affects one row', async () => {
    const supa = makeMockSupabase({ data: [{ session_id: 'sess-12345678' }] });
    const result = await tracker.setLoopState('sess-12345678', tracker.LOOP_STATE_AWAITING_TICK, {
      supabase: supa
    });
    expect(result).toEqual({ ok: true });
    expect(supa.from).toHaveBeenCalledWith('claude_sessions');
  });

  it('returns skipped + warns to stderr when session row not found (empty data)', async () => {
    const result = await tracker.setLoopState('sess-missing', tracker.LOOP_STATE_EXITED, {
      supabase: makeMockSupabase({ data: [] })
    });
    expect(result).toEqual({ ok: false, skipped: 'session_not_found' });
    const combined = stderrMessages.join('');
    expect(combined).toContain('no session row found');
    expect(combined).toContain('sess-missing');
  });

  // QF-20260905-970 regression canary: setLoopState's real update chain is
  // .update().eq().select('session_id') — a SINGLE arg, run through the
  // production schema-drift proxy. A prior version called
  // .select('session_id', { count: 'exact', head: true }); that extra arg is
  // silently dropped by postgrest-js's arity-1 select() on a mutation chain,
  // so `count` always resolved null and the proxy rejected every SUCCESSFUL
  // write as COUNT_UNMEASURABLE. This must resolve { ok: true }, not reject.
  it('resolves ok:true through the real schema-drift proxy (regression canary)', async () => {
    const rawSupabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: async () => ({ data: [{ session_id: 'sess-12345678' }], error: null, count: null })
          })
        })
      })
    };
    const result = await tracker.setLoopState('sess-12345678', tracker.LOOP_STATE_AWAITING_TICK, {
      supabase: withSchemaDriftDetection(rawSupabase)
    });
    expect(result).toEqual({ ok: true });
  });

  // The same proxy correctly rejects the OLD two-arg {count,head} shape,
  // proving the canary above is discriminating and not vacuously true.
  it('the old {count,head} select() shape DOES get rejected by the drift proxy', async () => {
    const rawSupabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: (..._args) => ({
              then: (onFulfilled) => onFulfilled({ data: null, error: null, count: null })
            })
          })
        })
      })
    };
    const wrapped = withSchemaDriftDetection(rawSupabase);
    await expect(
      wrapped.from('claude_sessions').update({}).eq('session_id', 'x').select('session_id', { count: 'exact', head: true })
    ).rejects.toThrow(/COUNT_UNMEASURABLE|count unmeasurable/i);
  });

  it('returns error + warns to stderr when supabase update fails — never throws', async () => {
    const supa = makeMockSupabase({ updateError: { message: 'boom' } });
    const result = await tracker.setLoopState('sess-12345678', tracker.LOOP_STATE_ACTIVE, {
      supabase: supa
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
    expect(stderrMessages.join('')).toContain('boom');
  });
});
