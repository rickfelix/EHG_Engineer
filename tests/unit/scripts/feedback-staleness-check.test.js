/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: scripts/feedback-staleness-check.js converted from
 * a bulk UPDATE (rejected by the append-only trigger, and would separately have violated the
 * feedback_status_check CHECK constraint via status='stale') to a root-scoped insert-correction.
 * TS-14 (never writes status='stale'), TS-15 (termination on a second run), TS-18 (root-only scan).
 *
 * main() takes an injectable `supabase` client, so no process.argv / module-reset gymnastics
 * are needed -- call it directly (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from '../../../scripts/feedback-staleness-check.js';

function makeSupabaseMock({ candidates, latestByRoot = {} }) {
  const insertCalls = [];
  const isCalls = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      // Root-scoped candidate scan: .in().lt().is().order().order() -- terminates without an
      // explicit terminal method (fetchAllPaginated drives .range() itself); simulate that by
      // resolving on the final .order() call in the chain.
      in: vi.fn(() => ({
        lt: vi.fn(() => ({
          is: vi.fn((col, val) => {
            isCalls.push({ col, val });
            return {
              order: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: vi.fn(async () => ({ data: candidates, error: null })),
                })),
              })),
            };
          }),
        })),
      })),
      // fetchLatestFeedback's base fetch
      eq: vi.fn((col, val) => ({
        maybeSingle: vi.fn(async () => ({ data: candidates.find(c => c.id === val) || null, error: null })),
      })),
      // fetchLatestFeedback's root-scoped fetch
      or: vi.fn((filter) => {
        const rootId = filter.match(/id\.eq\.([^,]+)/)[1];
        return {
          order: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: latestByRoot[rootId] ?? candidates.find(c => c.id === rootId), error: null })),
              })),
            })),
          })),
        };
      }),
    })),
    insert: vi.fn((payload) => {
      insertCalls.push(payload);
      return Promise.resolve({ error: null });
    }),
  }));
  return { from, _calls: { insertCalls, isCalls } };
}

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(() => {});
});

describe('feedback-staleness-check.js main() (TS-14, TS-15, TS-18)', () => {
  it('TS-14: never writes status=\'stale\'; marks staleness via metadata.marked_stale_at + resolution_notes, status unchanged', async () => {
    const root = { id: 'R', status: 'new', created_at: '2020-01-01T00:00:00.000Z', metadata: {} };
    const supabase = makeSupabaseMock({ candidates: [root] });
    await main({ dryRun: false, days: 1, supabase });

    expect(supabase._calls.insertCalls.length).toBe(1);
    const payload = supabase._calls.insertCalls[0];
    expect(payload.status).not.toBe('stale');
    expect(payload.status).toBe('new');
    expect(payload.metadata.marked_stale_at).toBeDefined();
    expect(payload.resolution_notes).toMatch(/stale/i);
  });

  it('TS-18: the candidate scan is root-scoped (metadata->>corrects_feedback_id IS NULL)', async () => {
    const supabase = makeSupabaseMock({ candidates: [] });
    await main({ dryRun: false, days: 1, supabase });

    expect(supabase._calls.isCalls.some(c => c.col === 'metadata->>corrects_feedback_id' && c.val === null)).toBe(true);
  });

  it('TS-15: a candidate already marked stale by a prior run is skipped -- proves termination', async () => {
    const root = { id: 'R', status: 'new', created_at: '2020-01-01T00:00:00.000Z', metadata: {} };
    const alreadyCorrected = { id: 'C1', status: 'new', created_at: '2020-06-01T00:00:00.000Z', metadata: { corrects_feedback_id: 'R', marked_stale_at: '2020-06-01T00:00:00.000Z' } };
    const supabase = makeSupabaseMock({ candidates: [root], latestByRoot: { R: alreadyCorrected } });
    await main({ dryRun: false, days: 1, supabase });

    expect(supabase._calls.insertCalls.length).toBe(0);
  });

  it('--dry-run performs zero writes', async () => {
    const root = { id: 'R', status: 'new', created_at: '2020-01-01T00:00:00.000Z', metadata: {} };
    const supabase = makeSupabaseMock({ candidates: [root] });
    await main({ dryRun: true, days: 1, supabase });

    expect(supabase._calls.insertCalls.length).toBe(0);
  });
});
