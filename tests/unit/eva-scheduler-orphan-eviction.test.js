/**
 * Unit Tests: EVA scheduler orphaned-queue-entry eviction (FR-1)
 * SD: SD-REFILL-00A88NSU
 *
 * The scheduler was stuck in a fail-loop: a fixture purge deleted ventures but left their
 * eva_scheduler_queue rows. processStage() returns CONTEXT_LOAD_FAILED for the missing venture,
 * and the entry stayed 'pending' -> re-dispatched every poll -> eva_scheduler_metrics grew unbounded.
 *
 * _evictQueueEntryIfVentureMissing() removes an orphaned queue entry IFF its venture is truly gone;
 * a transient CONTEXT_LOAD_FAILED (venture still exists) must stay retryable (NOT evicted).
 *
 *   TS-1: venture absent  -> queue entry DELETEd, returns true
 *   TS-2: venture present -> NO delete (transient, retryable), returns false
 *   TS-3: delete error    -> returns false, logged, does not throw
 *   TS-4: existence-check throw -> returns false, does not throw
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EvaMasterScheduler } from '../../lib/eva/eva-master-scheduler.js';

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

/**
 * Mock supabase whose `ventures` existence check returns `ventureRow` and whose
 * `eva_scheduler_queue` delete resolves with `deleteResult`. Records the delete filter.
 */
function makeSupabase({ ventureRow = null, deleteResult = { error: null }, existenceThrows = false } = {}) {
  const calls = { deletedVentureId: null, deleteCalled: false };
  const client = {
    from(table) {
      if (table === 'ventures') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => existenceThrows
                ? Promise.reject(new Error('db blip'))
                : Promise.resolve({ data: ventureRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'eva_scheduler_queue') {
        return {
          delete: () => {
            calls.deleteCalled = true;
            return {
              eq: (_col, val) => { calls.deletedVentureId = val; return Promise.resolve(deleteResult); },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, calls };
}

describe('EvaMasterScheduler._evictQueueEntryIfVentureMissing (SD-REFILL-00A88NSU FR-1)', () => {
  let logger;
  beforeEach(() => { logger = makeLogger(); });

  test('TS-1: venture absent -> evicts (deletes) the orphaned queue entry, returns true', async () => {
    const { client, calls } = makeSupabase({ ventureRow: null });
    const sched = new EvaMasterScheduler({ supabase: client, logger });
    const result = await sched._evictQueueEntryIfVentureMissing('venture-gone', 'Cannot coerce the result to a single JSON object');
    expect(result).toBe(true);
    expect(calls.deleteCalled).toBe(true);
    expect(calls.deletedVentureId).toBe('venture-gone');
    expect(logger.warn).toHaveBeenCalled();
  });

  test('TS-2: venture still exists -> does NOT evict (transient, retryable), returns false', async () => {
    const { client, calls } = makeSupabase({ ventureRow: { id: 'venture-live' } });
    const sched = new EvaMasterScheduler({ supabase: client, logger });
    const result = await sched._evictQueueEntryIfVentureMissing('venture-live', 'transient db error');
    expect(result).toBe(false);
    expect(calls.deleteCalled).toBe(false);
  });

  test('TS-3: delete error -> returns false, logs error, does not throw', async () => {
    const { client } = makeSupabase({ ventureRow: null, deleteResult: { error: { message: 'delete failed' } } });
    const sched = new EvaMasterScheduler({ supabase: client, logger });
    const result = await sched._evictQueueEntryIfVentureMissing('venture-gone');
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  test('TS-4: existence-check throws -> returns false (fail-safe), does not throw', async () => {
    const { client, calls } = makeSupabase({ existenceThrows: true });
    const sched = new EvaMasterScheduler({ supabase: client, logger });
    const result = await sched._evictQueueEntryIfVentureMissing('venture-x');
    expect(result).toBe(false);
    expect(calls.deleteCalled).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});
