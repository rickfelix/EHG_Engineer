/**
 * Regression test for QF-20260703-816: createWorktree's branch resolver could still
 * borrow a DESCENDANT's branch when sdKey is a literal hyphen-separated prefix of
 * EVERY descendant's key (e.g. a top-level orchestrator whose own branch never
 * existed, but whose 10 children all share its key as a prefix) -- QF-20260703-130's
 * separator-anchored glob still matches hyphen-separated child branches, which is
 * this sprint's actual naming convention.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockResult;
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from() {
      return {
        select() {
          return {
            neq() {
              return {
                ilike() {
                  return {
                    limit() {
                      return { maybeSingle: async () => mockResult };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  }),
}));

describe('rejectDescendantBranch (QF-20260703-816)', () => {
  let rejectDescendantBranch;
  beforeEach(async () => {
    vi.resetModules();
    ({ rejectDescendantBranch } = await import('../../../scripts/resolve-sd-workdir.js'));
  });

  it('rejects a variant branch when a real descendant SD key exists', async () => {
    mockResult = { data: { sd_key: 'SD-PARENT-A1' }, error: null };
    const result = await rejectDescendantBranch('SD-PARENT', 'feat/SD-PARENT-A1-api-layer');
    expect(result).toBeNull();
  });

  it('keeps the branch when no descendant SD exists (genuine variant)', async () => {
    mockResult = { data: null, error: null };
    const result = await rejectDescendantBranch('SD-PARENT', 'feat/SD-PARENT.retry');
    expect(result).toBe('feat/SD-PARENT.retry');
  });
});
