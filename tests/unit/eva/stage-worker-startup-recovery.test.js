/**
 * SD-LEO-INFRA-STAGE-WORKER-RELIABILITY-001 — startup recovery is staleness-based + fail-loud.
 *
 * RCA: _onStartupRecovery compared the UUID column orchestrator_lock_id (acquireProcessingLock writes
 * randomUUID()) against this._workerId (a `sew-host-pid` STRING) — a uuid-vs-string cast error the
 * catch swallowed, so recovery silently no-op'd and venture-1 froze twice. The fix recovers by LOCK
 * STALENESS (the same proven mechanism as the periodic stale-lock sweep), with NO schema migration.
 */
import { describe, it, expect, vi } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const STALE_MS = 120_000;

// Build a worker whose first supabase.from() (the recovery SELECT) returns `selectResult` and captures
// the .lt(column, value) staleness filter; later from() calls (UPDATE / emit) are inert.
function makeWorker({ selectResult, captureLt, captureNeq }) {
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let call = 0;
  const supabase = {
    from: vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) {
        // fetch-all-paginated (FR-6) appends .order() and awaits .range(). The chain
        // is fully chainable; .range() is the resolving terminal. A query error is
        // surfaced by rejecting (mirrors fetchAllPaginated throwing on a page error),
        // so _onStartupRecovery's FAIL-LOUD path sees the underlying message.
        const b = {
          select: () => b,
          eq: () => b,
          lt: (col, val) => { if (captureLt) captureLt(col, val); return b; },
          // the OLD broken comparison — present only so a regression that re-introduces it is caught
          neq: (col, val) => { if (captureNeq) captureNeq(col, val); return b; },
          order: () => b,
          range: () => (selectResult && selectResult.error
            ? Promise.reject(new Error(selectResult.error.message))
            : Promise.resolve(selectResult)),
        };
        return b;
      }
      // UPDATE chain (and anything else) — inert success
      return { update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }), insert: () => Promise.resolve({ error: null }) };
    }),
  };
  const worker = new StageExecutionWorker({ supabase, logger, staleLockThresholdMs: STALE_MS });
  return { worker, logger, supabase };
}

describe('startup recovery — staleness-based (FR-1)', () => {
  it('recovers a stale-locked venture on startup (resets it, no uuid cast error, no silent no-op)', async () => {
    const stale = [{ id: 'v1', name: 'Frozen Venture', orchestrator_lock_acquired_at: new Date(Date.now() - 10 * STALE_MS).toISOString() }];
    const { worker, logger } = makeWorker({ selectResult: { data: stale, error: null } });
    await worker._onStartupRecovery();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Startup recovery: resetting Frozen Venture'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('1 venture(s) reset'));
  });

  it('queries by staleness cutoff (fresh locks are excluded) and NEVER the broken workerId comparison', async () => {
    let ltCol = null, ltVal = null, neqUsed = false;
    const { worker } = makeWorker({
      selectResult: { data: [], error: null },
      captureLt: (col, val) => { ltCol = col; ltVal = val; },
      captureNeq: () => { neqUsed = true; },
    });
    await worker._onStartupRecovery();
    // staleness filter: orchestrator_lock_acquired_at < cutoff (≈ now - threshold) — so a FRESH lock
    // (acquired_at newer than the cutoff) is never returned, hence never reset.
    expect(ltCol).toBe('orchestrator_lock_acquired_at');
    const cutoffMs = new Date(ltVal).getTime();
    expect(Date.now() - cutoffMs).toBeGreaterThanOrEqual(STALE_MS - 5_000);
    expect(neqUsed).toBe(false); // the uuid-vs-string comparison must be gone
  });

  it('fail-loud: a recovery query error logs at ERROR and does not throw or silently swallow', async () => {
    const { worker, logger } = makeWorker({ selectResult: { data: null, error: { message: 'DB down' } } });
    await expect(worker._onStartupRecovery()).resolves.toBeUndefined(); // non-fatal
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Startup recovery query failed (FAIL-LOUD): DB down'));
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('query failed')); // not the old silent warn
  });
});
