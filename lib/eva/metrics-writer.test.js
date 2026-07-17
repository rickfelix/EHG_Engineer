/**
 * Unit Tests: MetricsWriter
 * SD: SD-LEO-FIX-EVA-SCHEDULER-METRICS-001
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetricsWriter } from './metrics-writer.js';

function createMockSupabase() {
  const builder = {
    from: null,
    insert: null,
  };
  builder.from = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockResolvedValue({ data: null, error: null });
  return builder;
}

describe('MetricsWriter', () => {
  let supabase;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('construction never throws, even without supabase or table (registration-only consumers)', () => {
    // lib/eva/rounds-scheduler.js instantiates EvaMasterScheduler (and therefore
    // MetricsWriter) without a supabase client for round-registration-only use --
    // construction must stay lenient; only an actual flush() attempt can fail.
    expect(() => new MetricsWriter({})).not.toThrow();
    expect(() => new MetricsWriter({ supabase })).not.toThrow();
    expect(() => new MetricsWriter({ table: 'x' })).not.toThrow();
  });

  test('flush() fails soft (never throws) when supabase is missing', async () => {
    const onWriteFailure = vi.fn();
    const writer = new MetricsWriter({ table: 'eva_scheduler_metrics', onWriteFailure });
    writer.enqueue({ event_type: 'a' });

    await expect(writer.flush()).resolves.toBeUndefined();
    expect(onWriteFailure).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  test('enqueue does not call insert immediately', () => {
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics' });
    writer.enqueue({ event_type: 'a' });
    expect(supabase.insert).not.toHaveBeenCalled();
    expect(writer.pendingCount).toBe(1);
  });

  test('flush sends all queued rows as a single batched insert call', async () => {
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics' });
    writer.enqueue({ event_type: 'a' });
    writer.enqueue({ event_type: 'b' });
    writer.enqueue({ event_type: 'c' });

    await writer.flush();

    expect(supabase.from).toHaveBeenCalledWith('eva_scheduler_metrics');
    expect(supabase.insert).toHaveBeenCalledTimes(1);
    expect(supabase.insert).toHaveBeenCalledWith([
      { event_type: 'a' },
      { event_type: 'b' },
      { event_type: 'c' },
    ]);
    expect(writer.pendingCount).toBe(0);
  });

  test('flush on an empty queue is a no-op (never calls insert)', async () => {
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics' });
    await writer.flush();
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  test('auto-flushes once the queue reaches maxBatch', () => {
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics', maxBatch: 2 });
    writer.enqueue({ event_type: 'a' });
    expect(supabase.insert).not.toHaveBeenCalled();
    writer.enqueue({ event_type: 'b' });
    // flush() is fire-and-forget from enqueue(), but the synchronous portion
    // (queue swap + supabase.from().insert() call) runs before any await yields.
    expect(supabase.insert).toHaveBeenCalledTimes(1);
    expect(supabase.insert).toHaveBeenCalledWith([{ event_type: 'a' }, { event_type: 'b' }]);
  });

  test('auto-flushes after flushIntervalMs even below maxBatch', () => {
    vi.useFakeTimers();
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics', maxBatch: 100, flushIntervalMs: 1000 });
    writer.enqueue({ event_type: 'a' });
    expect(supabase.insert).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(supabase.insert).toHaveBeenCalledTimes(1);
    expect(supabase.insert).toHaveBeenCalledWith([{ event_type: 'a' }]);
  });

  test('flush() cancels a pending timer so it does not double-flush', async () => {
    vi.useFakeTimers();
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics', maxBatch: 100, flushIntervalMs: 1000 });
    writer.enqueue({ event_type: 'a' });

    await writer.flush();
    expect(supabase.insert).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    // No new rows queued since the manual flush -- timer must not fire a second empty/duplicate insert
    expect(supabase.insert).toHaveBeenCalledTimes(1);
  });

  test('a failed batch write routes through onWriteFailure with the error and row count, and never throws', async () => {
    supabase.insert.mockResolvedValue({ data: null, error: new Error('insert failed') });
    const onWriteFailure = vi.fn();
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics', onWriteFailure });

    writer.enqueue({ event_type: 'a' });
    writer.enqueue({ event_type: 'b' });

    await expect(writer.flush()).resolves.toBeUndefined();
    expect(onWriteFailure).toHaveBeenCalledTimes(1);
    expect(onWriteFailure.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onWriteFailure.mock.calls[0][1]).toBe(2);
  });

  test('a synchronously-throwing insert is also caught and never throws out of flush()', async () => {
    supabase.insert.mockImplementation(() => { throw new Error('boom'); });
    const onWriteFailure = vi.fn();
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics', onWriteFailure });

    writer.enqueue({ event_type: 'a' });
    await expect(writer.flush()).resolves.toBeUndefined();
    expect(onWriteFailure).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  test('falls back to logger.warn when no onWriteFailure is provided', async () => {
    supabase.insert.mockResolvedValue({ data: null, error: new Error('down') });
    const logger = { warn: vi.fn() };
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics', logger });

    writer.enqueue({ event_type: 'a' });
    await writer.flush();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Batch write failed'));
  });

  test('a batch failure retries row-by-row so one bad row does not drop the whole batch', async () => {
    // Simulates an FK violation on one row (e.g. venture_id for a since-deleted
    // venture) -- the array insert fails atomically, but the two good rows
    // must still land via the per-row retry.
    supabase.insert.mockImplementation((arg) => {
      if (Array.isArray(arg)) {
        return Promise.resolve({ data: null, error: new Error('fk violation') });
      }
      if (arg.event_type === 'bad') {
        return Promise.resolve({ data: null, error: new Error('fk violation') });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const onWriteFailure = vi.fn();
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics', onWriteFailure });

    writer.enqueue({ event_type: 'good-1' });
    writer.enqueue({ event_type: 'bad' });
    writer.enqueue({ event_type: 'good-2' });

    await writer.flush();

    // 1 failed batch insert + 3 per-row retries
    expect(supabase.insert).toHaveBeenCalledTimes(4);
    expect(supabase.insert).toHaveBeenCalledWith({ event_type: 'good-1' });
    expect(supabase.insert).toHaveBeenCalledWith({ event_type: 'bad' });
    expect(supabase.insert).toHaveBeenCalledWith({ event_type: 'good-2' });
    // Only the one genuinely-bad row is counted as a failure, not all 3.
    expect(onWriteFailure).toHaveBeenCalledTimes(1);
    expect(onWriteFailure).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  test('a lost/dropped batch does not block subsequent enqueues from flushing normally', async () => {
    supabase.insert.mockResolvedValueOnce({ data: null, error: new Error('transient') });
    const writer = new MetricsWriter({ supabase, table: 'eva_scheduler_metrics' });

    writer.enqueue({ event_type: 'a' });
    await writer.flush();
    expect(writer.pendingCount).toBe(0);

    writer.enqueue({ event_type: 'b' });
    await writer.flush();

    expect(supabase.insert).toHaveBeenLastCalledWith([{ event_type: 'b' }]);
  });
});
