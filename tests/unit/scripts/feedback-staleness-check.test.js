/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: reverted to plain per-row UPDATEs. The append-only
 * trigger's lifecycle allowlist (database/chairman-gated/20260912_feedback_no_update_lifecycle_
 * allowlist.sql) exempts status/resolution_notes/metadata/updated_at, so UPDATE works today --
 * the insert-correction conversion this SD originally shipped is unnecessary and was reverted.
 * Still never writes status='stale' (not a valid feedback_status_check value) -- staleness is
 * recorded via metadata.marked_stale_at + resolution_notes, status left unchanged. A per-row
 * UPDATE (not bulk .in(id,ids)) is required so each row's existing metadata is merged, not
 * overwritten wholesale.
 *
 * main() takes an injectable `supabase` client, so no process.argv / module-reset gymnastics
 * are needed -- call it directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from '../../../scripts/feedback-staleness-check.js';

function makeSupabaseMock({ candidates }) {
  const updateCalls = [];
  const isCalls = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
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
    })),
    update: vi.fn((payload) => {
      updateCalls.push(payload);
      return { eq: vi.fn(async () => ({ error: null })) };
    }),
  }));
  return { from, _calls: { updateCalls, isCalls } };
}

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(() => {});
});

describe('feedback-staleness-check.js main()', () => {
  it('never writes status=\'stale\'; marks staleness via metadata.marked_stale_at + resolution_notes, status untouched', async () => {
    const root = { id: 'R', status: 'new', created_at: '2020-01-01T00:00:00.000Z', metadata: { other_key: 'preserved' } };
    const supabase = makeSupabaseMock({ candidates: [root] });
    await main({ dryRun: false, days: 1, supabase });

    expect(supabase._calls.updateCalls.length).toBe(1);
    const payload = supabase._calls.updateCalls[0];
    expect(payload.status).toBeUndefined();
    expect(payload.metadata.marked_stale_at).toBeDefined();
    expect(payload.metadata.other_key).toBe('preserved');
    expect(payload.resolution_notes).toMatch(/stale/i);
  });

  it('the candidate scan excludes rows already marked stale (metadata->>marked_stale_at IS NULL)', async () => {
    const supabase = makeSupabaseMock({ candidates: [] });
    await main({ dryRun: false, days: 1, supabase });

    expect(supabase._calls.isCalls.some(c => c.col === 'metadata->>marked_stale_at' && c.val === null)).toBe(true);
  });

  it('a second run with no fresh candidates (all already marked) performs zero writes -- proves termination', async () => {
    const supabase = makeSupabaseMock({ candidates: [] });
    await main({ dryRun: false, days: 1, supabase });

    expect(supabase._calls.updateCalls.length).toBe(0);
  });

  it('--dry-run performs zero writes', async () => {
    const root = { id: 'R', status: 'new', created_at: '2020-01-01T00:00:00.000Z', metadata: {} };
    const supabase = makeSupabaseMock({ candidates: [root] });
    await main({ dryRun: true, days: 1, supabase });

    expect(supabase._calls.updateCalls.length).toBe(0);
  });
});
