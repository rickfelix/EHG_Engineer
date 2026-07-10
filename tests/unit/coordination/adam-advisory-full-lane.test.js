// SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-4/FR-5) — drainReplies full-lane reader.
// The reader fetches THIS session's unread rows with AND-only filters (target_session + read_at
// IS NULL) and selects the reply lane IN JS via isReplyRow. These tests exercise the REAL filter
// logic (isReplyRow) + the fetch/consume flow — not a brittle PostgREST .or() string (the prior
// version stubbed an .or() that never executed, which let an invalid query pass green).
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { drainReplies, isReplyRow } = require('../../../scripts/adam-advisory.cjs');

describe('isReplyRow (FR-4 reply-lane predicate)', () => {
  it('matches coordinator_reply and any row carrying a payload.reply_to correlation', () => {
    expect(isReplyRow({ payload: { kind: 'coordinator_reply' } })).toBe(true);
    expect(isReplyRow({ payload: { kind: 'chairman_directive', reply_to: 'corr-2' } })).toBe(true);
    expect(isReplyRow({ payload: { kind: 'coordinator_request', reply_to: 'corr-3' } })).toBe(true);
  });
  it('does NOT match non-reply rows (lane separation)', () => {
    expect(isReplyRow({ payload: { kind: 'adam_advisory' } })).toBe(false);          // an outbound advisory shape
    expect(isReplyRow({ payload: { kind: 'work_assignment' } })).toBe(false);        // a directive, not a reply
    expect(isReplyRow({ payload: { kind: 'coordinator_request', reply_to: '' } })).toBe(false); // empty correlation
    expect(isReplyRow({ payload: {} })).toBe(false);
    expect(isReplyRow({})).toBe(false);
    expect(isReplyRow(null)).toBe(false);
  });
});

// Stub the supabase query/update chain. The SELECT uses AND-only filters (NO .or()), and the
// chain captures the eq/is filters so we can PROVE lane scoping is applied, plus the consumed ids.
function stub(rows) {
  const captured = { eq: {}, isNull: [], updatedIds: null, usedOr: false, updatePayloads: [] };
  const selectChain = {
    select() { return selectChain; },
    eq(col, val) { captured.eq[col] = val; return selectChain; },
    or() { captured.usedOr = true; return selectChain; },
    is(col) { captured.isNull.push(col); return selectChain; },
    // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: window scoping added to the lane query.
    gte() { return selectChain; },
    order() { return selectChain; },
    limit() { return Promise.resolve({ data: rows, error: null }); },
  };
  const updateChain = {
    update(payload) { captured.updatePayloads.push(payload); return updateChain; },
    in(_col, ids) { captured.updatedIds = ids; return updateChain; },
    is() { return Promise.resolve({ error: null }); },
  };
  const supabase = {
    from() {
      return new Proxy({}, {
        get(_t, prop) {
          if (prop in selectChain) return selectChain[prop];
          if (prop in updateChain) return updateChain[prop];
          return undefined;
        },
      });
    },
  };
  return { supabase, captured };
}

describe('drainReplies (FR-4 full-lane, AND-only query + JS filter)', () => {
  it('scopes to target_session + acknowledged_at IS NULL, surfaces only reply rows, stamps read_at interactively', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rows = [
      { id: 'r1', payload: { kind: 'coordinator_reply', reply_to: 'corr-1', body: 'classic reply' }, created_at: new Date().toISOString() },
      { id: 'r2', payload: { kind: 'chairman_directive', reply_to: 'corr-2', body: 'reply under another kind' }, created_at: new Date().toISOString() },
      { id: 'r3', payload: { kind: 'work_assignment', body: 'a directive, NOT a reply' }, created_at: new Date().toISOString() },
    ];
    const { supabase, captured } = stub(rows);
    await drainReplies(supabase, 'adam-session');
    expect(captured.eq.target_session).toBe('adam-session'); // lane scoped by the AND-only query
    // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (FR-4): recoverable filter is
    // acknowledged_at IS NULL — read_at is only a stamp, never a hiding filter.
    expect(captured.isNull).toContain('acknowledged_at');
    expect(captured.isNull).not.toContain('read_at');
    expect(captured.usedOr).toBe(false);                      // no brittle PostgREST .or()
    expect(captured.updatedIds).toEqual(['r1', 'r2']);        // only the two reply rows stamped; r3 left alone
    // Interactive surfacing stamps read_at; acknowledged_at is NEVER written by the drain.
    expect(captured.updatePayloads.some(p => 'read_at' in p)).toBe(true);
    expect(captured.updatePayloads.some(p => 'acknowledged_at' in p)).toBe(false);
    logSpy.mockRestore();
  });

  it('reports cleanly when there are no unacked directed replies', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { supabase, captured } = stub([{ id: 'x', payload: { kind: 'work_assignment' }, created_at: new Date().toISOString() }]);
    await drainReplies(supabase, 'adam-session');
    expect(captured.updatedIds).toBeNull(); // nothing reply-shaped -> nothing stamped
    expect(logSpy).toHaveBeenCalledWith('(no unacked directed replies)');
    logSpy.mockRestore();
  });
});
