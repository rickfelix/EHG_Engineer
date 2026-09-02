/**
 * QF-20260902-160 — dedupe a retry on the SAME correlation_id instead of inserting a second row.
 *
 * A caller that read a DISPATCH_BACKPRESSURE/park refusal as "nothing landed" and resent the
 * identical ask duplicated content that already landed (parked or real) — measured live: Adam's
 * "supersedes my parked X" resends raised his own target's unanswered count and re-tightened the
 * same cap. findExistingCorrelationRow closes that: a retry sharing an already-landed row's
 * correlation_id is DELIVERED, not refused, and no second row is written.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { findExistingCorrelationRow, insertCoordinationRow } = require('../../../lib/coordinator/dispatch.cjs');

const TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

/** Stub supabase: the dedupe query selects `id, payload` filtered on target_session AND
 *  payload->>correlation_id (distinguished from every other `id, payload` query in this module
 *  by that second .eq() call). `dedupeRows` supplies the raw candidate population. */
function stubSupabase({ dedupeRows = [], liveSessions = [TARGET] } = {}) {
  const inserted = [];
  const sb = {
    from(table) {
      const chain = {
        _table: table, _isCorrelationSelect: false, _eqCalls: [], _eq: null,
        select(cols) { chain._isCorrelationSelect = table === 'session_coordination' && cols === 'id, payload'; return chain; },
        eq(col, val) { chain._eqCalls.push(col); chain._eq = val; return chain; },
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
          const isDedupeQuery = chain._isCorrelationSelect && chain._eqCalls.includes('payload->>correlation_id');
          if (isDedupeQuery) return Promise.resolve({ data: dedupeRows, error: null }).then(res, rej);
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { sb, inserted };
}

describe('findExistingCorrelationRow (unit)', () => {
  it('returns null with no correlation_id on the row', async () => {
    const { sb } = stubSupabase({ dedupeRows: [{ id: 'existing-1', payload: {} }] });
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: {} }, silentLog)).resolves.toBeNull();
  });

  it('returns null with no target_session', async () => {
    const { sb } = stubSupabase({ dedupeRows: [{ id: 'existing-1', payload: {} }] });
    await expect(findExistingCorrelationRow(sb, { payload: { correlation_id: 'corr-1' } }, silentLog)).resolves.toBeNull();
  });

  it('returns the existing row id when a matching correlation row is found', async () => {
    const { sb } = stubSupabase({ dedupeRows: [{ id: 'existing-1', payload: { correlation_id: 'corr-1' } }] });
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: { correlation_id: 'corr-1' } }, silentLog))
      .resolves.toBe('existing-1');
  });

  it('returns null when no candidate rows match', async () => {
    const { sb } = stubSupabase({ dedupeRows: [] });
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: { correlation_id: 'corr-1' } }, silentLog))
      .resolves.toBeNull();
  });

  // A reply IS an answer, not a duplicate ask -- never dedupe against it.
  it('ignores a coordinator_reply candidate row', async () => {
    const { sb } = stubSupabase({ dedupeRows: [{ id: 'reply-1', payload: { correlation_id: 'corr-1', kind: 'coordinator_reply' } }] });
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: { correlation_id: 'corr-1' } }, silentLog))
      .resolves.toBeNull();
  });

  it('ignores a reply_to candidate row', async () => {
    const { sb } = stubSupabase({ dedupeRows: [{ id: 'reply-1', payload: { correlation_id: 'corr-1', reply_to: 'ask-1' } }] });
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: { correlation_id: 'corr-1' } }, silentLog))
      .resolves.toBeNull();
  });

  // Multi-part sends deliberately reuse ONE correlation_id across several distinct rows
  // (adam-advisory.cjs --part N/M) -- a part must never be deduped as a resend, on either side.
  it('never dedupes a multi-part SEND (payload.part_index set on the outgoing row)', async () => {
    const { sb } = stubSupabase({ dedupeRows: [{ id: 'part-1', payload: { correlation_id: 'corr-1' } }] });
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: { correlation_id: 'corr-1', part_index: 2 } }, silentLog))
      .resolves.toBeNull();
  });

  it('ignores a multi-part candidate row (payload.part_index set on the existing row)', async () => {
    const { sb } = stubSupabase({ dedupeRows: [{ id: 'part-1', payload: { correlation_id: 'corr-1', part_index: 1 } }] });
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: { correlation_id: 'corr-1' } }, silentLog))
      .resolves.toBeNull();
  });

  it('fails open on a lookup error', async () => {
    const sb = { from() { throw new Error('boom'); } };
    await expect(findExistingCorrelationRow(sb, { target_session: TARGET, payload: { correlation_id: 'corr-1' } }, silentLog))
      .resolves.toBeNull();
  });
});

describe('wired into insertCoordinationRow (choke-guard fixture — capability-not-use)', () => {
  it('a same-correlation retry is refused as DISPATCH_ALREADY_DELIVERED, landed:true, and inserts nothing', async () => {
    const { sb, inserted } = stubSupabase({ dedupeRows: [{ id: 'existing-1', payload: { correlation_id: 'corr-1' } }] });
    await expect(insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'retry', payload: { correlation_id: 'corr-1' },
    }, { logger: silentLog })).rejects.toMatchObject({ code: 'DISPATCH_ALREADY_DELIVERED', landed: true, parkedRowId: 'existing-1' });
    expect(inserted).toHaveLength(0);
  });

  it('a fresh correlation_id (no existing row) inserts once', async () => {
    const { sb, inserted } = stubSupabase({ dedupeRows: [] });
    await insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'fresh', payload: { correlation_id: 'corr-2' },
    }, { logger: silentLog });
    expect(inserted).toHaveLength(1);
  });
});
