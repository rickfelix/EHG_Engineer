/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: scripts/feedback-age-out.mjs converted from a bulk
 * set-based UPDATE (rejected by the append-only trigger, and had no per-row fetch at all) to
 * a root-scoped, per-row insert-correction. TS-16: a seeded 2-row fixture, run twice.
 *
 * main() takes an injectable `supabase` client, so no process.argv / module-reset gymnastics
 * are needed -- call it directly (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from '../../../scripts/feedback-age-out.mjs';

function makeFullMock({ rows, alreadyArchivedIds = new Set() }) {
  const insertCalls = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const from = vi.fn(() => ({
    select: vi.fn((cols, opts) => {
      if (opts?.count === 'exact' && opts?.head) {
        return {
          eq: () => ({ is: () => ({ is: () => ({ lt: async () => ({ count: rows.length, error: null }) }) }) }),
        };
      }
      return {
        eq: (col, val) => {
          if (col === 'id') {
            // fetchLatestFeedback base fetch
            return { maybeSingle: async () => ({ data: byId.get(val) || null, error: null }) };
          }
          return {
            is: () => ({
              is: () => ({
                lt: () => ({
                  order: () => ({ range: async () => ({ data: rows, error: null }) }),
                }),
              }),
            }),
          };
        },
        or: (filter) => {
          const rootId = filter.match(/id\.eq\.([^,]+)/)[1];
          const row = byId.get(rootId);
          const latest = alreadyArchivedIds.has(rootId) ? { ...row, archived_at: '2026-01-01T00:00:00.000Z' } : row;
          return {
            order: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: latest, error: null }) }) }) }),
          };
        },
      };
    }),
    insert: vi.fn((payload) => {
      insertCalls.push(payload);
      return Promise.resolve({ error: null });
    }),
  }));
  return { from, _calls: { insertCalls } };
}

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(() => {});
});

describe('feedback-age-out.mjs main() (TS-16)', () => {
  it('dry run performs zero writes', async () => {
    const rows = [{ id: 'R1', category: 'informational_note', archived_at: null, metadata: {}, updated_at: '2020-01-01T00:00:00.000Z' }];
    const supabase = makeFullMock({ rows });
    await main({ apply: false, supabase });
    expect(supabase._calls.insertCalls.length).toBe(0);
  });

  it('first run archives a seeded 2-row fixture via correction inserts (archived_at, never a raw UPDATE)', async () => {
    const rows = [
      { id: 'R1', category: 'informational_note', archived_at: null, metadata: {}, updated_at: '2020-01-01T00:00:00.000Z' },
      { id: 'R2', category: 'informational_note', archived_at: null, metadata: {}, updated_at: '2020-01-01T00:00:00.000Z' },
    ];
    const supabase = makeFullMock({ rows });
    await main({ apply: true, supabase });

    expect(supabase._calls.insertCalls.length).toBe(2);
    for (const payload of supabase._calls.insertCalls) {
      expect(payload.archived_at).toBeDefined();
      expect(payload.id).toBeUndefined();
    }
  });

  it('second run inserts zero new rows once both are already archived -- proves termination', async () => {
    const rows = [
      { id: 'R1', category: 'informational_note', archived_at: null, metadata: {}, updated_at: '2020-01-01T00:00:00.000Z' },
      { id: 'R2', category: 'informational_note', archived_at: null, metadata: {}, updated_at: '2020-01-01T00:00:00.000Z' },
    ];
    const supabase = makeFullMock({ rows, alreadyArchivedIds: new Set(['R1', 'R2']) });
    await main({ apply: true, supabase });

    expect(supabase._calls.insertCalls.length).toBe(0);
  });
});
