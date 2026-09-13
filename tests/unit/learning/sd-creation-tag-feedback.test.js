/**
 * QF-20260912-159: scripts/modules/learning/sd-creation.js's tagSourceItems() used to tag a
 * feedback-sourced learning item via `.ilike('id', \`${feedbackId}%\`)` -- feedback.id is
 * uuid-typed (database/uuid-columns-census.json), and Postgres has no ~~/~~* operator for
 * uuid, so the call always threw 'operator does not exist: uuid ~~*'. The error was caught and
 * only printed as a console warning, so the tag silently never landed.
 *
 * Fix: an exact .eq('id', feedbackId) when feedbackId is a full uuid (the common/only
 * reachable case today, since context-builder.js always sets source_id to the row's real
 * uuid); for a genuinely truncated id, resolve candidates via a real predicate (the item's own
 * created_at) and confirm the prefix in JavaScript before tagging. A failure now also lands in
 * results.errors (previously only console.log).
 *
 * Mocking pattern mirrors sd-creation-post-write-stage.test.js: a top-level, hoisted vi.mock
 * backed by mutable module-scope fixture state, set per-test -- vi.doMock + a fresh dynamic
 * import per test would re-hit ESM's module cache and silently reuse the FIRST test's mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let feedbackRows = [];
const calls = { ilike: [], eq: [], update: [] };

function chain() {
  const self = {
    update(payload) {
      calls.update.push(payload);
      return self;
    },
    select() { return self; },
    eq(col, val) {
      calls.eq.push([col, val]);
      return self;
    },
    ilike(col, val) {
      calls.ilike.push([col, val]);
      return self;
    },
    limit() { return self; },
    then(resolve) {
      const lastEq = calls.eq[calls.eq.length - 1];
      if (calls.update.length > 0) {
        const targetId = lastEq && lastEq[0] === 'id' ? lastEq[1] : null;
        resolve(targetId === 'missing-row' ? { error: { message: 'no rows matched' } } : { error: null });
        return;
      }
      resolve({ data: feedbackRows, error: null });
    },
  };
  return self;
}

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: () => chain() }),
}));

const { tagSourceItems } = await import('../../../scripts/modules/learning/sd-creation.js');

describe('tagSourceItems — feedback items (QF-20260912-159)', () => {
  beforeEach(() => {
    feedbackRows = [];
    calls.ilike = [];
    calls.eq = [];
    calls.update = [];
  });

  it('tags via an exact .eq(), never .ilike(), when feedbackId is a full uuid (source_id set)', async () => {
    const fullUuid = 'a1b2c3d4-e5f6-4789-a123-456789abcdef';
    const results = await tagSourceItems(
      [{ source_type: 'feedback', id: 'FB-a1b2c3d4', source_id: fullUuid, created_at: '2026-09-01T00:00:00Z' }],
      'SD-TEST-001',
    );

    expect(calls.ilike).toEqual([]);
    expect(calls.eq).toContainEqual(['id', fullUuid]);
    expect(results.tagged).toBe(1);
    expect(results.success).toBe(true);
  });

  it('resolves a truncated id via created_at + a JS prefix filter (no source_id available)', async () => {
    feedbackRows = [
      { id: 'a1b2c3d4-e5f6-4789-a123-456789abcdef' },
      { id: 'ffffffff-0000-4000-8000-000000000000' },
    ];
    const results = await tagSourceItems(
      [{ source_type: 'feedback', id: 'FB-a1b2c3d4', created_at: '2026-09-01T00:00:00Z' }],
      'SD-TEST-001',
    );

    expect(calls.ilike).toEqual([]);
    expect(calls.eq).toContainEqual(['created_at', '2026-09-01T00:00:00Z']);
    expect(calls.eq).toContainEqual(['id', 'a1b2c3d4-e5f6-4789-a123-456789abcdef']);
    expect(results.tagged).toBe(1);
    expect(results.success).toBe(true);
  });

  it('records a tag failure in results.errors (not just a console line) when no candidate matches the prefix', async () => {
    feedbackRows = [{ id: 'ffffffff-0000-4000-8000-000000000000' }];
    const results = await tagSourceItems(
      [{ source_type: 'feedback', id: 'FB-a1b2c3d4', created_at: '2026-09-01T00:00:00Z' }],
      'SD-TEST-001',
    );

    expect(calls.ilike).toEqual([]);
    expect(results.tagged).toBe(0);
    expect(results.success).toBe(false);
    expect(results.errors).toContainEqual(
      expect.objectContaining({ id: 'a1b2c3d4', table: 'feedback' }),
    );
  });
});
