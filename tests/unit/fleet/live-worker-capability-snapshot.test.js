/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-2 support): liveWorkerCapabilitySnapshot is the
 * fetchLiveFleetRows-sharing extraction that gives merged-pool-self-claim + dispatch-suggestions
 * the per-worker live ranks isTieringActive's boolean does not expose.
 */
import { describe, it, expect } from 'vitest';
import { liveWorkerCapabilitySnapshot } from '../../../lib/fleet/tier-ladder.cjs';

describe('liveWorkerCapabilitySnapshot', () => {
  it('fails open to an empty snapshot on any query fault', async () => {
    const brokenSb = { from() { throw new Error('synthetic fault'); } };
    const snap = await liveWorkerCapabilitySnapshot(brokenSb);
    expect(snap).toEqual({ workers: [], ranks: [] });
  });

  it('fails open to an empty snapshot when the query itself errors', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          in: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({ data: null, error: { message: 'boom' } }),
              }),
            }),
          }),
        }),
      }),
    };
    const snap = await liveWorkerCapabilitySnapshot(sb);
    expect(snap).toEqual({ workers: [], ranks: [] });
  });
});
