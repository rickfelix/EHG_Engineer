/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: reverted to a bulk set-based UPDATE. The append-only
 * trigger's lifecycle allowlist (database/chairman-gated/20260912_feedback_no_update_lifecycle_
 * allowlist.sql) exempts archived_at, so a plain UPDATE works today -- the insert-correction
 * conversion this SD originally shipped is unnecessary and was reverted.
 *
 * main() takes an injectable `supabase` client, so no process.argv / module-reset gymnastics
 * are needed -- call it directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from '../../../scripts/feedback-age-out.mjs';

function makeMock({ candidateCount, updatedCount }) {
  const updateCalls = [];
  const from = vi.fn(() => ({
    select: vi.fn((_cols, opts) => {
      if (opts?.count === 'exact' && opts?.head) {
        return {
          eq: () => ({ is: () => ({ lt: async () => ({ count: candidateCount, error: null }) }) }),
        };
      }
      return { eq: () => ({ is: () => ({ lt: async () => ({ count: updatedCount, error: null }) }) }) };
    }),
    update: vi.fn((payload) => {
      updateCalls.push(payload);
      return {
        eq: () => ({
          is: () => ({
            lt: () => ({
              select: vi.fn((_cols, opts) => {
                if (opts?.count === 'exact' && opts?.head) {
                  return async () => ({ count: updatedCount, error: null });
                }
                return async () => ({ count: updatedCount, error: null });
              })(),
            }),
          }),
        }),
      };
    }),
  }));
  return { from, _calls: { updateCalls } };
}

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(() => {});
});

describe('feedback-age-out.mjs main()', () => {
  it('dry run performs zero writes', async () => {
    const supabase = makeMock({ candidateCount: 1, updatedCount: 0 });
    await main({ apply: false, supabase });
    expect(supabase._calls.updateCalls.length).toBe(0);
  });

  it('apply mode issues a single bulk UPDATE setting archived_at, never a per-row insert', async () => {
    const supabase = makeMock({ candidateCount: 2, updatedCount: 2 });
    await main({ apply: true, supabase });

    expect(supabase._calls.updateCalls.length).toBe(1);
    expect(supabase._calls.updateCalls[0].archived_at).toBeDefined();
  });

  it('zero candidates: apply mode skips the UPDATE entirely', async () => {
    const supabase = makeMock({ candidateCount: 0, updatedCount: 0 });
    await main({ apply: true, supabase });
    expect(supabase._calls.updateCalls.length).toBe(0);
  });
});
