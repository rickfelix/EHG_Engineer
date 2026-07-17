/**
 * Batches metrics-table inserts into periodic bulk writes instead of one row
 * per call (SD-LEO-FIX-EVA-SCHEDULER-METRICS-001). The scheduler's per-tick
 * metric emissions were the dominant driver of eva_scheduler_metrics'
 * unbounded ~110k rows/day growth; batching cuts write count without
 * dropping rows. flush() is awaited on graceful shutdown so no buffered
 * metric is lost (a hard crash between flushes can still drop the buffer —
 * accepted, matches the existing non-blocking/best-effort metrics contract).
 * A failed batch insert (e.g. one row's FK violates on a since-deleted
 * venture) falls back to a row-by-row retry so one bad row can't take the
 * whole batch down with it.
 *
 * @module lib/eva/metrics-writer
 */

const DEFAULT_MAX_BATCH = parseInt(process.env.EVA_SCHEDULER_METRICS_BATCH_SIZE || '20', 10) || 20;
const DEFAULT_FLUSH_MS = parseInt(process.env.EVA_SCHEDULER_METRICS_FLUSH_INTERVAL_MS || '5000', 10) || 5000;

export class MetricsWriter {
  /**
   * @param {Object} deps
   * @param {Object} deps.supabase - Supabase client (service role)
   * @param {string} deps.table - target table name
   * @param {number} [deps.maxBatch] - flush once the queue reaches this size
   * @param {number} [deps.flushIntervalMs] - flush at most this long after the first queued row
   * @param {Object} [deps.logger] - defaults to console
   * @param {(err: Error, rowCount: number) => void} [deps.onWriteFailure] - called instead of the default logger.warn on a failed batch write
   */
  constructor({ supabase, table, maxBatch = DEFAULT_MAX_BATCH, flushIntervalMs = DEFAULT_FLUSH_MS, logger = console, onWriteFailure } = {}) {
    // Deliberately lenient at construction (no throw on a missing supabase/table):
    // some EvaMasterScheduler consumers instantiate it without a DB client for
    // registration-only purposes that never touch the metrics table (e.g.
    // lib/eva/rounds-scheduler.js's module-level singleton). flush() already
    // fails soft (caught, routed to onWriteFailure/logger.warn) if supabase is
    // absent when a write is actually attempted -- matching the pre-existing
    // this.supabase = deps.supabase (possibly undefined) contract.
    this.supabase = supabase;
    this.table = table;
    this.maxBatch = maxBatch;
    this.flushIntervalMs = flushIntervalMs;
    this.logger = logger;
    this.onWriteFailure = onWriteFailure;
    this._queue = [];
    this._timer = null;
  }

  /** Queue a row for the next batch write. Synchronous, never throws. */
  enqueue(row) {
    this._queue.push(row);
    if (this._queue.length >= this.maxBatch) {
      this.flush();
    } else {
      this._armTimer();
    }
  }

  _armTimer() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, this.flushIntervalMs);
    if (this._timer.unref) this._timer.unref();
  }

  /** Flush the current queue as a single bulk insert. Never throws. */
  async flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._queue.length === 0) return;
    const batch = this._queue;
    this._queue = [];
    try {
      const { error } = await this.supabase.from(this.table).insert(batch);
      if (error) throw error;
    } catch (err) {
      // A single bad row (e.g. an FK violation on a since-deleted venture) fails
      // the whole array insert atomically -- retry row-by-row so one bad row
      // doesn't silently drop every unrelated row batched alongside it.
      await this._flushRowByRow(batch, err);
    }
  }

  async _flushRowByRow(batch, batchError) {
    let failures = 0;
    let lastError = batchError;
    for (const row of batch) {
      try {
        const { error } = await this.supabase.from(this.table).insert(row);
        if (error) throw error;
      } catch (err) {
        failures++;
        lastError = err;
      }
    }
    if (failures > 0) {
      if (this.onWriteFailure) {
        this.onWriteFailure(lastError, failures);
      } else {
        this.logger.warn(`[MetricsWriter] Batch write failed (${failures}/${batch.length} row(s)): ${lastError.message}`);
      }
    }
  }

  /** Rows currently buffered, awaiting flush. */
  get pendingCount() {
    return this._queue.length;
  }
}
