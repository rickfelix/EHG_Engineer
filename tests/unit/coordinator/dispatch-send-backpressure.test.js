/**
 * QF-20260831-560 — real send backpressure inside insertCoordinationRow, replacing the
 * copy-pasted-x7 scratch-script conditional (Solomon disposition: heuristic sound, substitute not).
 *
 * TWO describe blocks, matching the disposition-lock precedent (tests/unit/coordinator/
 * disposition-lock.test.js): testing the exported assert alone proves the guard CAN refuse, never
 * that the choke CALLS it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  assertSendBackpressure, insertCoordinationRow, BACKPRESSURE_EXEMPT_KINDS, BACKPRESSURE_UNANSWERED_LIMIT,
} = require('../../../lib/coordinator/dispatch.cjs');

const TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

/** Stub supabase: the backpressure head-count query resolves to `unanswered`; every other
 *  query (claude_sessions liveness, etc.) resolves benign-empty so insertCoordinationRow's
 *  other guards pass through untouched. */
function stubSupabase({ unanswered = 0, throwOnCount = false, liveSessions = [TARGET] } = {}) {
  const inserted = [];
  const countCalls = [];
  const sb = {
    from(table) {
      const chain = {
        _table: table, _isCount: false, _eq: null,
        select(_cols, opts) { chain._isCount = !!(opts && opts.count === 'exact'); return chain; },
        eq(col, val) { chain._eq = val; return chain; },
        is() { return chain; },
        gt() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'claude_sessions') {
            return Promise.resolve({ data: liveSessions.includes(chain._eq) ? { session_id: chain._eq, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() { return Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }); },
        insert(r) { inserted.push(r); return chain; },
        then(res, rej) {
          if (table === 'session_coordination' && chain._isCount) {
            countCalls.push(true);
            const out = throwOnCount ? { count: null, error: { message: 'transient boom' } } : { count: unanswered, error: null };
            return Promise.resolve(out).then(res, rej);
          }
          return Promise.resolve({ data: inserted[inserted.length - 1] || null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { sb, inserted, countCalls };
}

describe('assertSendBackpressure (unit)', () => {
  it('refuses at the limit — the 4th unanswered directed row', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog))
      .rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
  });

  it('allows below the limit', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT - 1 });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  it('every exempt kind bypasses the limit even when choked', async () => {
    for (const kind of BACKPRESSURE_EXEMPT_KINDS) {
      const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT + 5 });
      await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: { kind } }, silentLog)).resolves.toBeUndefined();
    }
  });

  it('an exempt-kind bypass logs loudly (never a quiet exemption)', async () => {
    const { sb } = stubSupabase({ unanswered: 99 });
    const lines = [];
    await assertSendBackpressure(sb, { target_session: TARGET, payload: { kind: 'collision_warning' } }, { warn: (m) => lines.push(m) });
    expect(lines.join('\n')).toMatch(/BACKPRESSURE_EXEMPT/);
  });

  it('fails open on a count-query error (never blocks a real send on a transient fault)', async () => {
    const { sb } = stubSupabase({ throwOnCount: true });
    await expect(assertSendBackpressure(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeUndefined();
  });

  it('is a no-op with no target_session', async () => {
    const { sb } = stubSupabase({ unanswered: 999 });
    await expect(assertSendBackpressure(sb, { payload: {} }, silentLog)).resolves.toBeUndefined();
  });
});

describe('wired into insertCoordinationRow (choke-guard fixture — capability-not-use)', () => {
  it('a routine send is refused when the target is choked', async () => {
    const { sb } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT });
    await expect(insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'routine', payload: { kind: 'coordinator_update' },
    }, { logger: silentLog })).rejects.toMatchObject({ code: 'DISPATCH_BACKPRESSURE' });
  });

  it('an exempt-class send passes through a choked target', async () => {
    const { sb, inserted } = stubSupabase({ unanswered: BACKPRESSURE_UNANSWERED_LIMIT + 2 });
    await insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'collision', payload: { kind: 'collision_warning' },
    }, { logger: silentLog });
    expect(inserted).toHaveLength(1);
  });
});
