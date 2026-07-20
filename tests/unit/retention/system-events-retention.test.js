/**
 * SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 (FR-4) — bespoke system_events retention pass.
 */
import { describe, it, expect, vi } from 'vitest';
import { enforceSystemEventsRetention } from '../../../lib/retention/system-events-retention.js';

/**
 * @param {Array} candidates - rows older than the cutoff
 * @param {(filters: object) => {id: string}|null} latestLookup - resolves the "latest row"
 *   query given the accumulated .eq() filters for a group
 */
function mockSupabase({ candidates = [], latestLookup = () => null, insertError = null, deleteError = null } = {}) {
  const calls = { inserts: 0, deletes: 0, deletedIds: [] };

  const from = vi.fn((table) => {
    if (table === 'retention_archive') {
      return {
        insert: vi.fn(async (rows) => {
          calls.inserts += 1;
          if (insertError) return { error: { message: insertError }, count: null };
          return { error: null, count: rows.length };
        }),
      };
    }
    // system_events builder — supports both the candidates SELECT and the
    // per-group latest-row lookup SELECT via the same chainable object.
    const filters = {};
    const builder = {
      select: vi.fn((cols) => {
        if (cols === '*') {
          // FR-6 batch 8: the candidates read now paginates via fetchAllPaginated
          // (.lt().order().range()); extend the chain to match.
          return {
            lt: vi.fn(() => ({
              order: vi.fn(() => ({
                range: vi.fn(async () => ({ data: candidates, error: null })),
              })),
            })),
          };
        }
        return builder; // 'id, created_at' path — continues to .eq()/.order()/.limit()
      }),
      eq: vi.fn((col, val) => {
        filters[col] = val;
        return builder;
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: latestLookup(filters), error: null })),
      delete: vi.fn(() => ({
        in: vi.fn(async (col, ids) => {
          calls.deletes += 1;
          calls.deletedIds.push(...ids);
          if (deleteError) return { error: { message: deleteError } };
          return { error: null };
        }),
      })),
    };
    return builder;
  });

  return { supabase: { from }, calls };
}

describe('enforceSystemEventsRetention', () => {
  it('no-ops when nothing is past the cutoff', async () => {
    const { supabase } = mockSupabase({ candidates: [] });
    const r = await enforceSystemEventsRetention(supabase);
    expect(r).toEqual({ eligible: 0, preservedLatest: 0, preservedNonTerminal: 0, archived: 0, deleted: 0, error: null });
  });

  it('preserves the single latest row per (event_type, venture_id) for AGENT_OUTCOME', async () => {
    const row = { id: 'evt-1', event_type: 'AGENT_OUTCOME', venture_id: 'v-1', created_at: '2020-01-01T00:00:00Z' };
    const { supabase, calls } = mockSupabase({
      candidates: [row],
      latestLookup: (f) => (f.event_type === 'AGENT_OUTCOME' && f.venture_id === 'v-1' ? { id: 'evt-1' } : null),
    });
    const r = await enforceSystemEventsRetention(supabase);
    expect(r.preservedLatest).toBe(1);
    expect(r.archived).toBe(0);
    expect(calls.inserts).toBe(0);
    expect(calls.deletes).toBe(0);
  });

  it('preserves a non-latest but non-terminal-status row (awaiting_disposition)', async () => {
    const row = {
      id: 'evt-2', event_type: 'DECISION_DISPOSITION', idempotency_key: 'q-1',
      created_at: '2020-01-01T00:00:00Z', payload: { status: 'awaiting_disposition' },
    };
    const { supabase, calls } = mockSupabase({
      candidates: [row],
      latestLookup: () => ({ id: 'some-other-row' }), // NOT the latest
    });
    const r = await enforceSystemEventsRetention(supabase);
    expect(r.preservedNonTerminal).toBe(1);
    expect(r.archived).toBe(0);
    expect(calls.inserts).toBe(0);
  });

  it('archives-then-deletes a superseded, terminal-status row', async () => {
    const row = {
      id: 'evt-3', event_type: 'DECISION_DISPOSITION', idempotency_key: 'q-2',
      created_at: '2020-01-01T00:00:00Z', payload: { status: 'resolved' },
    };
    const { supabase, calls } = mockSupabase({
      candidates: [row],
      latestLookup: () => ({ id: 'some-other-row' }),
    });
    const r = await enforceSystemEventsRetention(supabase);
    expect(r.error).toBeNull();
    expect(r.archived).toBe(1);
    expect(r.deleted).toBe(1);
    expect(calls.inserts).toBe(1);
    expect(calls.deletedIds).toEqual(['evt-3']);
  });

  it('archive-before-delete invariant: a failed archive insert issues zero deletes', async () => {
    const row = { id: 'evt-4', event_type: 'MANIFESTO_VERSION_UPDATE', created_at: '2020-01-01T00:00:00Z' };
    const { supabase, calls } = mockSupabase({
      candidates: [row],
      latestLookup: () => ({ id: 'some-other-row' }),
      insertError: 'boom',
    });
    const r = await enforceSystemEventsRetention(supabase);
    expect(r.error).toMatch(/archive insert failed/);
    expect(calls.deletes).toBe(0);
  });

  it('preserves the single latest signing event per event_type (no venture_id/idempotency_key)', async () => {
    const row = { id: 'evt-5', event_type: 'MANIFESTO_VERSION_UPDATE', created_at: '2020-01-01T00:00:00Z' };
    const { supabase, calls } = mockSupabase({
      candidates: [row],
      latestLookup: (f) => (f.event_type === 'MANIFESTO_VERSION_UPDATE' ? { id: 'evt-5' } : null),
    });
    const r = await enforceSystemEventsRetention(supabase);
    expect(r.preservedLatest).toBe(1);
    expect(calls.inserts).toBe(0);
  });
});
