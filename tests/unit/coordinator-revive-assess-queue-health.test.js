/**
 * Tests for scripts/coordinator-revive.cjs assessQueueHealth.
 * SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-4 (QF-20260903-834).
 *
 * assessQueueHealth itself had ZERO unit coverage before this SD — the existing
 * coordinator-revive-queue-health.test.js only exercises actuatorIsDead/formatQueueWarning
 * against pre-built health objects, never the DB-querying function that computes
 * `neverConsumed`. These tests pin the WINDOWED predicate: neverConsumed is now true only
 * when there is a pending backlog, no fulfillment has landed within the recent window, AND
 * the oldest pending row has passed its own expires_at — not merely "everFulfilled === 0"
 * across all history, which could never detect a queue that delivered once, long ago, and
 * has been silently dead since (the exact QF-20260903-834 measured shape: 5 fulfillments in
 * a single 2026-08-22 burst, then 12.7 days of nothing while 5 pending rows sat past TTL).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { assessQueueHealth } = require_('../../scripts/coordinator-revive.cjs');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Minimal chainable mock covering exactly the query shapes assessQueueHealth issues. */
function makeHealthSupabase({ total = 0, pending = 0, everFulfilled = 0, recentlyFulfilled = 0, oldestRow = null, throwOnQuery = false }) {
  return {
    from: (table) => {
      if (table !== 'worker_spawn_requests') throw new Error(`unexpected table ${table}`);
      if (throwOnQuery) throw new Error('simulated unreadable queue');
      return {
        select: (_cols, opts) => {
          if (opts && opts.head) {
            let kind = 'total';
            const chain = {
              eq: (col, val) => { if (col === 'status' && val === 'pending') kind = 'pending'; return chain; },
              not: (col) => { if (col === 'fulfilled_at') kind = 'everFulfilled'; return chain; },
              gte: (col) => { if (col === 'fulfilled_at') kind = 'recentlyFulfilled'; return chain; },
              then: (resolve) => {
                const counts = { total, pending, everFulfilled, recentlyFulfilled };
                resolve({ count: counts[kind], error: null });
              },
            };
            return chain;
          }
          // Non-head select: the oldest-pending-row lookup (requested_at, expires_at).
          const chain = {
            eq: () => chain,
            order: () => chain,
            limit: () => Promise.resolve({ data: oldestRow ? [oldestRow] : [], error: null }),
          };
          return chain;
        },
      };
    },
  };
}

describe('assessQueueHealth (windowed fulfillment predicate, QF-20260903-834)', () => {
  it('reproduces the exact QF-20260903-834 measured shape: fulfilled once long ago, dead since, oldest pending past TTL', async () => {
    const supabase = makeHealthSupabase({
      total: 47,
      pending: 5,
      everFulfilled: 5,
      recentlyFulfilled: 0,
      oldestRow: { requested_at: new Date(Date.now() - 12.7 * DAY_MS).toISOString(), expires_at: new Date(Date.now() - 12.6 * DAY_MS).toISOString() },
    });
    const health = await assessQueueHealth(supabase);
    expect(health.neverConsumed).toBe(true);
    expect(health.everFulfilled).toBe(5);
    expect(health.recentlyFulfilled).toBe(0);
    expect(health.oldestPendingExpired).toBe(true);
  });

  it('is healthy (neverConsumed=false) when a fulfillment landed within the recent window, even with a large pending backlog', async () => {
    const supabase = makeHealthSupabase({
      total: 47,
      pending: 5,
      everFulfilled: 6,
      recentlyFulfilled: 1,
      oldestRow: { requested_at: new Date(Date.now() - 2 * DAY_MS).toISOString(), expires_at: new Date(Date.now() - HOUR_MS).toISOString() },
    });
    const health = await assessQueueHealth(supabase);
    expect(health.neverConsumed).toBe(false);
  });

  it('does not fail loud while the oldest pending row has not yet expired (early/waiting, not stuck)', async () => {
    const supabase = makeHealthSupabase({
      total: 3,
      pending: 3,
      everFulfilled: 0,
      recentlyFulfilled: 0,
      oldestRow: { requested_at: new Date().toISOString(), expires_at: new Date(Date.now() + HOUR_MS).toISOString() },
    });
    const health = await assessQueueHealth(supabase);
    expect(health.neverConsumed).toBe(false);
    expect(health.oldestPendingExpired).toBe(false);
  });

  it('does not cry wolf when there is no pending backlog at all, regardless of fulfillment recency', async () => {
    const supabase = makeHealthSupabase({ total: 10, pending: 0, everFulfilled: 10, recentlyFulfilled: 0, oldestRow: null });
    const health = await assessQueueHealth(supabase);
    expect(health.neverConsumed).toBe(false);
  });

  it('does not cry wolf on a genuinely empty queue', async () => {
    const supabase = makeHealthSupabase({ total: 0, pending: 0, everFulfilled: 0, recentlyFulfilled: 0, oldestRow: null });
    const health = await assessQueueHealth(supabase);
    expect(health.neverConsumed).toBe(false);
  });

  it('fails safe (not expired) when expires_at is unreadable/malformed on the oldest pending row', async () => {
    const supabase = makeHealthSupabase({
      total: 5, pending: 5, everFulfilled: 0, recentlyFulfilled: 0,
      oldestRow: { requested_at: new Date().toISOString(), expires_at: 'not-a-date' },
    });
    const health = await assessQueueHealth(supabase);
    expect(health.oldestPendingExpired).toBe(false);
    expect(health.neverConsumed).toBe(false);
  });

  it('returns null (not a false-healthy object) when the queue is unreadable', async () => {
    const supabase = makeHealthSupabase({ throwOnQuery: true });
    const health = await assessQueueHealth(supabase);
    expect(health).toBeNull();
  });
});
