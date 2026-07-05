/**
 * QF-20260704-180 — DESIGN workflow-review user_stories fetch must be deterministically
 * ordered. Without an explicit ORDER BY, workflow-detection.js's buildInteractionGraph
 * builds a linear chain from array order and flags the LAST node a dead end (unless it
 * matches a landing-page pattern) — so an unsorted DB return order randomly flagged a
 * different story CRITICAL on every DESIGN run, independent of any real navigation issue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({})),
}));

const { fetchOrderedUserStories } = await import('../../../lib/sub-agents/design/index.js');

describe('QF-20260704-180 — fetchOrderedUserStories', () => {
  let chain;
  let dbClient;

  beforeEach(() => {
    chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve({ data: [{ id: 'US-1' }, { id: 'US-2' }], error: null })),
    };
    dbClient = { from: vi.fn(() => chain) };
  });

  it('queries user_stories filtered by sd_id with a deterministic id-ascending order', async () => {
    const result = await fetchOrderedUserStories(dbClient, 'SD-XXX-001');

    expect(dbClient.from).toHaveBeenCalledWith('user_stories');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('sd_id', 'SD-XXX-001');
    expect(chain.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(result.data).toEqual([{ id: 'US-1' }, { id: 'US-2' }]);
  });
});
