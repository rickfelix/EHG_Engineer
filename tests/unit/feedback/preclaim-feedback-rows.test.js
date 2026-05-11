/**
 * SD-FDBK-INFRA-PER-FEEDBACK-ROW-001 / FR-2 vitest
 *
 * Tests for preclaimFeedbackRows + resolveFeedbackIds + releasePreclaim.
 * Mocks the Supabase client surface used by the helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preclaimFeedbackRows, resolveFeedbackIds } from '../../../lib/feedback/preclaim-feedback-rows.js';
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
  };
  return {
    from(_table) {
      const state = { op: null, filters: [] };
      const builder = {
        select() { state.op = state.op || 'select'; return builder; },
        update(_payload) { state.op = 'update'; state._update = _payload; return builder; },
        insert(_payload) { state.op = 'insert'; return Promise.resolve(queues.insert.shift() || { data: null, error: null }); },
        in(_col, _vals) { state.filters.push(['in', _col, _vals]); return builder; },
        eq(_col, _val) { state.filters.push(['eq', _col, _val]); return builder; },
        is(_col, _val) { state.filters.push(['is', _col, _val]); return builder; },
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

  it('resolves a short prefix via ilike lookup', async () => {
    const supabase = buildStub({
      select: [{ data: [{ id: '9a9292c8-e904-487e-a44a-5f38c8f4b746' }], error: null }],
    });
    const ids = await resolveFeedbackIds(supabase, '9a9292c8');
    expect(ids).toEqual(['9a9292c8-e904-487e-a44a-5f38c8f4b746']);
  });

  it('throws FEEDBACK_ID_NOT_FOUND on no match', async () => {
    const supabase = buildStub({ select: [{ data: [], error: null }] });
    await expect(resolveFeedbackIds(supabase, 'deadbeef')).rejects.toMatchObject({ code: 'FEEDBACK_ID_NOT_FOUND' });
  });

  it('throws FEEDBACK_ID_AMBIGUOUS on multi-match', async () => {
    const supabase = buildStub({ select: [{ data: [{ id: 'a'.repeat(36) }, { id: 'b'.repeat(36) }], error: null }] });
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
