/**
 * SD-FDBK-INFRA-PER-FEEDBACK-ROW-001 / FR-2 vitest
 *
 * Tests for preclaimFeedbackRows + resolveFeedbackIds + releasePreclaim.
 * Mocks the Supabase client surface used by the helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preclaimFeedbackRows, resolveFeedbackIds, extractFeedbackUuids, findFeedbackRefConflicts } from '../../../lib/feedback/preclaim-feedback-rows.js';
import { releasePreclaim } from '../../../lib/feedback/release-preclaim.js';

/**
 * Build a chainable Supabase-shape stub. We push expected responses onto
 * `script` queues per operation, then `from()` returns a builder whose
 * terminal awaiters resolve from the front of the matching queue.
 */
function buildStub(script) {
  const queues = {
    select: [...(script.select || [])],
    update: [...(script.update || [])],
    insert: [...(script.insert || [])],
    rpc: [...(script.rpc || [])],
  };
  return {
    rpc(_name, _params) { return Promise.resolve(queues.rpc.shift() || { data: [], error: null }); },
    from(_table) {
      const state = { op: null, filters: [] };
      const builder = {
        select() { state.op = state.op || 'select'; return builder; },
        update(_payload) { state.op = 'update'; state._update = _payload; return builder; },
        insert(_payload) { state.op = 'insert'; return Promise.resolve(queues.insert.shift() || { data: null, error: null }); },
        in(_col, _vals) { state.filters.push(['in', _col, _vals]); return builder; },
        eq(_col, _val) { state.filters.push(['eq', _col, _val]); return builder; },
        is(_col, _val) { state.filters.push(['is', _col, _val]); return builder; },
        not(_col, _op, _val) { state.filters.push(['not', _col, _op, _val]); return builder; },
        ilike(_col, _pat) { state.filters.push(['ilike', _col, _pat]); return builder; },
        limit(_n) { return Promise.resolve(queues.select.shift() || { data: [], error: null }); },
        maybeSingle() { return Promise.resolve(queues.select.shift() || { data: null, error: null }); },
        then(resolve, reject) {
          // Terminal await: dispatch by op
          if (state.op === 'update') {
            return Promise.resolve(queues.update.shift() || { data: [], error: null }).then(resolve, reject);
          }
          return Promise.resolve(queues.select.shift() || { data: [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

describe('resolveFeedbackIds', () => {
  it('resolves a full UUID directly without DB lookup', async () => {
    const supabase = buildStub({});
    const ids = await resolveFeedbackIds(supabase, '9a9292c8-e904-487e-a44a-5f38c8f4b746');
    expect(ids).toEqual(['9a9292c8-e904-487e-a44a-5f38c8f4b746']);
  });

  it('resolves a short prefix via exec_sql id::text cast (FR-3; .ilike on a uuid column would throw)', async () => {
    const supabase = buildStub({
      rpc: [{ data: [{ result: [{ id: '9a9292c8-e904-487e-a44a-5f38c8f4b746' }] }], error: null }],
    });
    const ids = await resolveFeedbackIds(supabase, '9a9292c8');
    expect(ids).toEqual(['9a9292c8-e904-487e-a44a-5f38c8f4b746']);
  });

  it('throws FEEDBACK_ID_NOT_FOUND on no match', async () => {
    const supabase = buildStub({ rpc: [{ data: [{ result: [] }], error: null }] });
    await expect(resolveFeedbackIds(supabase, 'deadbeef')).rejects.toMatchObject({ code: 'FEEDBACK_ID_NOT_FOUND' });
  });

  it('throws FEEDBACK_ID_AMBIGUOUS on multi-match', async () => {
    const supabase = buildStub({ rpc: [{ data: [{ result: [{ id: 'a'.repeat(36) }, { id: 'b'.repeat(36) }] }], error: null }] });
    await expect(resolveFeedbackIds(supabase, 'abcd')).rejects.toMatchObject({ code: 'FEEDBACK_ID_AMBIGUOUS' });
  });

  it('throws FEEDBACK_ID_EMPTY on blank arg', async () => {
    const supabase = buildStub({});
    await expect(resolveFeedbackIds(supabase, '')).rejects.toMatchObject({ code: 'FEEDBACK_ID_EMPTY' });
  });

  it('throws FEEDBACK_ID_INVALID on bad token shape', async () => {
    const supabase = buildStub({});
    await expect(resolveFeedbackIds(supabase, 'NOT-HEX-XX')).rejects.toMatchObject({ code: 'FEEDBACK_ID_INVALID' });
  });
});

describe('preclaimFeedbackRows', () => {
  beforeEach(() => vi.useRealTimers());

  it('returns claimed for a single unclaimed row', async () => {
    const supabase = buildStub({
      select: [{ data: [{ id: 'fb-1', metadata: {} }], error: null }], // read targets
      update: [{ data: [{ id: 'fb-1' }], error: null }],                // per-row update
    });
    const r = await preclaimFeedbackRows({ supabase, feedbackIds: ['fb-1'], pendingQfId: 'QF-X', sessionId: 'sess-1' });
    expect(r.claimed).toEqual([{ id: 'fb-1' }]);
    expect(r.conflicts).toEqual([]);
  });

  it('returns conflict when row is already claimed (not eligible)', async () => {
    const supabase = buildStub({
      // targets query (filtered by quick_fix_id IS NULL) returns empty
      select: [
        { data: [], error: null },                                                                                 // targets read
        { data: [{ id: 'fb-1', quick_fix_id: 'QF-OTHER', session_id: 'sess-other', metadata: {} }], error: null }, // conflict re-select
        { data: [{ session_id: 'sess-other', heartbeat_at: '2026-05-11T20:00:00Z' }], error: null },              // heartbeat lookup
      ],
    });
    const r = await preclaimFeedbackRows({ supabase, feedbackIds: ['fb-1'], pendingQfId: 'QF-NEW', sessionId: 'sess-me' });
    expect(r.claimed).toEqual([]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ id: 'fb-1', qf_id: 'QF-OTHER', session_id: 'sess-other' });
  });

  it('returns empty result for empty input', async () => {
    const supabase = buildStub({});
    const r = await preclaimFeedbackRows({ supabase, feedbackIds: [], pendingQfId: 'QF-X', sessionId: 's' });
    expect(r).toEqual({ claimed: [], conflicts: [] });
  });
});

describe('releasePreclaim', () => {
  it('releases pending-state rows owned by the QF', async () => {
    const supabase = buildStub({
      select: [{ data: [{ id: 'fb-1', metadata: { qf_claim_state: 'pending', qf_claim_at: 'x' } }], error: null }],
      update: [{ data: [{ id: 'fb-1' }], error: null }],
    });
    const r = await releasePreclaim({ supabase, quickFixId: 'QF-A' });
    expect(r.released).toEqual(['fb-1']);
  });

  it('skips non-pending rows', async () => {
    const supabase = buildStub({
      select: [{ data: [{ id: 'fb-1', metadata: { qf_claim_state: 'shipping' } }], error: null }],
      // no update expected
    });
    const r = await releasePreclaim({ supabase, quickFixId: 'QF-A' });
    expect(r.released).toEqual([]);
  });

  it('throws when quickFixId is missing', async () => {
    const supabase = buildStub({});
    await expect(releasePreclaim({ supabase, quickFixId: null })).rejects.toMatchObject({ code: 'RELEASE_PRECLAIM_NO_QF_ID' });
  });
});

describe('extractFeedbackUuids (SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 FR-1)', () => {
  it('extracts and de-dupes full UUIDs from text', () => {
    const u = '1b4cee40-fbec-415f-8a8f-94c4dfa2d31a';
    expect(extractFeedbackUuids(`see feedback ${u} and again ${u}`)).toEqual([u]);
  });

  it('returns [] when no UUID is present or input is empty/null', () => {
    expect(extractFeedbackUuids('no uuid here')).toEqual([]);
    expect(extractFeedbackUuids('')).toEqual([]);
    expect(extractFeedbackUuids(null)).toEqual([]);
  });

  it('caps at 5 distinct UUIDs (bounded scan, G7)', () => {
    const text = Array.from({ length: 8 }, (_, i) => `${i}0000000-0000-4000-8000-000000000000`).join(' ');
    expect(extractFeedbackUuids(text)).toHaveLength(5);
  });
});

describe('findFeedbackRefConflicts (SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 FR-1)', () => {
  const U = '1b4cee40-fbec-415f-8a8f-94c4dfa2d31a';

  it('returns no conflicts when text has no feedback UUID', async () => {
    const r = await findFeedbackRefConflicts({ supabase: buildStub({}), text: 'plain text, no refs' });
    expect(r).toEqual({ uuids: [], conflicts: [], failedOpen: false });
  });

  it('flags a conflict when a referenced feedback is claimed by an open QF', async () => {
    const supabase = buildStub({
      select: [
        { data: [{ id: U, quick_fix_id: 'QF-OPEN' }], error: null }, // feedback linked to a QF
        { data: [{ id: 'QF-OPEN', status: 'open', title: 'rival fix' }], error: null }, // rival is open
      ],
    });
    const r = await findFeedbackRefConflicts({ supabase, text: `fixes ${U}` });
    expect(r.uuids).toEqual([U]);
    expect(r.failedOpen).toBe(false);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ id: 'QF-OPEN', status: 'open' });
  });

  it('does not flag when the referenced feedback has no claiming QF', async () => {
    const supabase = buildStub({
      select: [{ data: [], error: null }], // no feedback row with quick_fix_id set
    });
    const r = await findFeedbackRefConflicts({ supabase, text: `mentions ${U}` });
    expect(r.conflicts).toEqual([]);
    expect(r.failedOpen).toBe(false);
  });

  it('FAILS-OPEN (never bricks creation) when a DB read errors (G4)', async () => {
    const supabase = buildStub({
      select: [{ data: null, error: { message: 'boom' } }],
    });
    const r = await findFeedbackRefConflicts({ supabase, text: `fixes ${U}` });
    expect(r.failedOpen).toBe(true);
    expect(r.conflicts).toEqual([]);
  });
});
