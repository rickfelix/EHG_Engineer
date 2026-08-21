/**
 * SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-3, TS-4 revised) — the disposition packet asserts
 * against the PREDICATE (pending, dispatch_count=0, >minAgeDays old, linked to an 'active'
 * venture), not a drifting literal row count that will change as live data ages.
 */
import { describe, it, expect } from 'vitest';
import { computeStaleActiveQueueDisposition, renderStaleActiveQueuePacket, STALE_ACTIVE_MIN_AGE_DAYS } from '../../../lib/eva/scheduler-queue-disposition.js';

const NOW = new Date('2026-08-21T00:00:00.000Z');
const OLD = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function makeSupabase({ queueRows, ventures }) {
  return {
    from(table) {
      if (table === 'eva_scheduler_queue') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          lt: () => chain,
          then: (resolve) => resolve({ data: queueRows, error: null }),
        };
        return chain;
      }
      if (table === 'eva_ventures') {
        const chain = {
          select: () => chain,
          in: () => chain,
          eq: () => chain,
          then: (resolve) => resolve({ data: ventures, error: null }),
        };
        return chain;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('computeStaleActiveQueueDisposition (FR-3)', () => {
  it('includes only rows matching ALL predicates: pending+dispatch_count=0 (query-filtered) AND venture active AND older than minAgeDays', async () => {
    // Query itself already filters status=pending, dispatch_count=0, created_at<cutoff --
    // the mock returns exactly what a real query would after those filters. This test's job
    // is to prove the age-cutoff computation and the venture-status join are correct.
    const supabase = makeSupabase({
      queueRows: [
        { venture_id: 'v-old-active', created_at: OLD(45), dispatch_count: 0 },
        { venture_id: 'v-old-not-active', created_at: OLD(60), dispatch_count: 0 },
      ],
      ventures: [
        { id: 'v-old-active', name: 'Old Active Venture', status: 'active' },
        // v-old-not-active deliberately absent from the eq('status','active') result set
      ],
    });
    const packet = await computeStaleActiveQueueDisposition(supabase, { now: NOW });
    expect(packet.rows).toHaveLength(1);
    expect(packet.rows[0]).toMatchObject({ ventureId: 'v-old-active', ventureName: 'Old Active Venture', dispatchCount: 0 });
    expect(packet.minAgeDays).toBe(STALE_ACTIVE_MIN_AGE_DAYS);
    expect(packet.cutoffIso).toBe(OLD(30));
  });

  it('returns an empty rows array (not an error) when nothing is eligible', async () => {
    const supabase = makeSupabase({ queueRows: [], ventures: [] });
    const packet = await computeStaleActiveQueueDisposition(supabase, { now: NOW });
    expect(packet.rows).toEqual([]);
  });

  it('a custom minAgeDays changes the cutoff, not the predicate shape', async () => {
    const supabase = makeSupabase({
      queueRows: [{ venture_id: 'v1', created_at: OLD(10), dispatch_count: 0 }],
      ventures: [{ id: 'v1', name: 'V1', status: 'active' }],
    });
    const packet = await computeStaleActiveQueueDisposition(supabase, { now: NOW, minAgeDays: 5 });
    expect(packet.cutoffIso).toBe(OLD(5));
    expect(packet.rows).toHaveLength(1);
  });

  it('renderStaleActiveQueuePacket is deterministic plain text, sorted by createdAt', async () => {
    const supabase = makeSupabase({
      queueRows: [
        { venture_id: 'v-b', created_at: OLD(40), dispatch_count: 0 },
        { venture_id: 'v-a', created_at: OLD(90), dispatch_count: 0 },
      ],
      ventures: [
        { id: 'v-a', name: 'Venture A', status: 'active' },
        { id: 'v-b', name: 'Venture B', status: 'active' },
      ],
    });
    const packet = await computeStaleActiveQueueDisposition(supabase, { now: NOW });
    const text = renderStaleActiveQueuePacket(packet);
    expect(text).toContain('2 row(s)');
    expect(text).toContain('cancel as fixtures / re-arm / hold');
    const idxA = text.indexOf('Venture A');
    const idxB = text.indexOf('Venture B');
    expect(idxA).toBeGreaterThan(0);
    expect(idxA).toBeLessThan(idxB); // older row (v-a, 90d) listed before newer (v-b, 40d)
  });
});
