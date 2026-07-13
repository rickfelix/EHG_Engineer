/**
 * SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-2) -- scripts/backfill-gha-cron-liveness-source.mjs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { selfStampedGhaRows: [] };

// Every chain step returns the SAME thenable object -- awaiting at ANY point in the chain
// (.eq() for a plain select, .select() for an update) resolves to the current row set, mirroring
// supabase-js's own PostgrestFilterBuilder (thenable at every step, not just after a terminal call).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from() {
      const chain = {
        select: () => chain,
        like: () => chain,
        eq: () => chain,
        update: () => chain,
        then: (resolve) => resolve({ data: state.selfStampedGhaRows, error: null }),
      };
      return chain;
    },
  }),
}));

const { run } = await import('../../../scripts/backfill-gha-cron-liveness-source.mjs');

describe('backfill-gha-cron-liveness-source', () => {
  beforeEach(() => {
    state.selfStampedGhaRows = [
      { process_key: 'gha_cron:foo.yml', liveness_source: 'self_stamped' },
      { process_key: 'gha_cron:bar.yml', liveness_source: 'self_stamped' },
    ];
  });

  it('dry run reports matched rows without updating', async () => {
    const result = await run({ apply: false });
    expect(result.matched).toBe(2);
    expect(result.updated).toBe(0);
  });

  it('nothing to do when no self_stamped gha_cron rows remain', async () => {
    state.selfStampedGhaRows = [];
    const result = await run({ apply: false });
    expect(result).toEqual({ matched: 0, updated: 0 });
  });
});
