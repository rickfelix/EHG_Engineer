/**
 * SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 (FR-4) — publish-outcome-observer cron step.
 *
 * Pins: --dry-run performs zero registration/sweep/stamp calls, a successful cycle
 * registers (only if not already registered) + sweeps + stamps liveness, a sweep error
 * is never masked as a fired cycle, a liveness-stamp failure is non-fatal (mirrors the
 * sibling payment-attribution-sweep), the second run of an idempotent fixture selects
 * zero rows (TS-2), and the summary reports rows_written/rows_write_failed distinct
 * from rows_unmeasurable on a zero-yield run (TS-11).
 */
import { describe, it, expect, vi } from 'vitest';
import { main, parseArgs, ensureArmedRegistration, sweepOnce, SD_KEY, ACTIVATION_TRIGGER } from '../../../scripts/cron/publish-outcome-observer.mjs';

function makeRegistrySupabase({ alreadyRegistered = false } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return {
    _upsert: upsert,
    from(table) {
      if (table === 'periodic_process_registry') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => (alreadyRegistered
            ? { data: { process_key: 'g3-armed-existing' }, error: null }
            : { data: null, error: null }),
          upsert,
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('publish-outcome-observer static wiring', () => {
  it('exports SD_KEY and ACTIVATION_TRIGGER matching the cron workflow', () => {
    expect(SD_KEY).toBe('SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001');
    expect(ACTIVATION_TRIGGER).toBe('.github/workflows/publish-outcome-observer-cron.yml');
  });
});

describe('publish-outcome-observer main()', () => {
  it('--dry-run performs zero registration/sweep/stamp calls', async () => {
    const sweepOnceFn = vi.fn();
    const stampLastFired = vi.fn();
    const supabase = makeRegistrySupabase();

    const result = await main(['node', 's', '--once', '--dry-run'], {
      supabase, sweepOnce: sweepOnceFn, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.action).toBe('dry_run');
    expect(result.exitCode).toBe(0);
    expect(supabase._upsert).not.toHaveBeenCalled();
    expect(sweepOnceFn).not.toHaveBeenCalled();
    expect(stampLastFired).not.toHaveBeenCalled();
  });

  it('a successful cycle registers (not yet registered), sweeps, and stamps liveness', async () => {
    const sweepOnceFn = vi.fn().mockResolvedValue({ rows_selected: 3, rows_unmeasurable: 1, rows_written: 2, rows_write_failed: 0 });
    const stampLastFired = vi.fn().mockResolvedValue({ stamped: true });
    const supabase = makeRegistrySupabase({ alreadyRegistered: false });

    const result = await main(['node', 's', '--once'], {
      supabase, sweepOnce: sweepOnceFn, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(supabase._upsert).toHaveBeenCalledTimes(1);
    expect(sweepOnceFn).toHaveBeenCalledWith(supabase, undefined);
    expect(stampLastFired).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('swept');
    expect(result.summary.rows_selected).toBe(3);
    expect(result.summary.rows_written).toBe(2);
  });

  it('skips re-registration when a registry row already exists', async () => {
    const sweepOnceFn = vi.fn().mockResolvedValue({ rows_selected: 0, rows_unmeasurable: 0, rows_written: 0, rows_write_failed: 0 });
    const stampLastFired = vi.fn().mockResolvedValue({ stamped: true });
    const supabase = makeRegistrySupabase({ alreadyRegistered: true });

    await main(['node', 's', '--once'], {
      supabase, sweepOnce: sweepOnceFn, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(supabase._upsert).not.toHaveBeenCalled();
  });

  it('a sweep error is never masked as a fired cycle -- liveness stamp is skipped, exit is non-zero', async () => {
    const sweepOnceFn = vi.fn().mockRejectedValue(new Error('db unreachable'));
    const stampLastFired = vi.fn();
    const supabase = makeRegistrySupabase();

    const result = await main(['node', 's', '--once'], {
      supabase, sweepOnce: sweepOnceFn, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(stampLastFired).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.action).toBe('sweep_error');
  });

  it('a liveness-stamp failure is non-fatal -- the cycle still reports success', async () => {
    const sweepOnceFn = vi.fn().mockResolvedValue({ rows_selected: 0, rows_unmeasurable: 0, rows_written: 0, rows_write_failed: 0 });
    const stampLastFired = vi.fn().mockRejectedValue(new Error('not registered'));
    const supabase = makeRegistrySupabase();

    const result = await main(['node', 's', '--once'], {
      supabase, sweepOnce: sweepOnceFn, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('swept');
  });

  // TS-11: a zero-yield run is visible in the returned summary, never silent.
  it('reports rows_written/rows_write_failed distinct from rows_unmeasurable on a zero-yield run (TS-11)', async () => {
    const sweepOnceFn = vi.fn().mockResolvedValue({ rows_selected: 3, rows_unmeasurable: 3, rows_written: 0, rows_write_failed: 3 });
    const stampLastFired = vi.fn().mockResolvedValue({ stamped: true });
    const supabase = makeRegistrySupabase();

    const result = await main(['node', 's', '--once'], {
      supabase, sweepOnce: sweepOnceFn, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.rows_selected).toBe(3);
    expect(result.summary.rows_unmeasurable).toBe(3);
    expect(result.summary.rows_written).toBe(0);
    expect(result.summary.rows_write_failed).toBe(3);
  });
});

describe('ensureArmedRegistration', () => {
  it('registers exactly once for an unregistered process_key', async () => {
    const supabase = makeRegistrySupabase({ alreadyRegistered: false });
    const processKey = await ensureArmedRegistration(supabase, { log() {}, warn() {}, error() {} });
    expect(processKey).toBe('g3-armed-sd-leo-infra-publish-outcome-observer-001');
    expect(supabase._upsert).toHaveBeenCalledTimes(1);
  });
});

/**
 * sweepOnce: the actual per-row loop. Uses fake observeOutcome/recordPublishOutcome
 * implementations (unit-level, no real ledger join) -- FR-1's real join proof lives in
 * tests/unit/marketing/publisher.test.js; observeOutcome's own classification logic is
 * covered in tests/unit/marketing/observe-outcome.test.js.
 */
function makeLedgerSelectSupabase(rows) {
  return {
    from: vi.fn((table) => {
      if (table !== 'venture_channel_publish_ledger') throw new Error(`unexpected table: ${table}`);
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve({ data: rows, error: null }))
      };
      return chain;
    })
  };
}

describe('sweepOnce', () => {
  it('classifies, records, and counts each selected row', async () => {
    const rows = [{ correlation_id: 'corr-1' }, { correlation_id: 'corr-2' }, { correlation_id: 'corr-3' }];
    const supabase = makeLedgerSelectSupabase(rows);
    const observeOutcomeFn = vi.fn()
      .mockResolvedValueOnce({ outcome: 'shipped_clean', outcomeRef: 'p1' })
      .mockResolvedValueOnce({ outcome: 'unmeasurable', outcomeRef: null })
      .mockResolvedValueOnce({ outcome: 'unknown', outcomeRef: null });
    const recordPublishOutcomeFn = vi.fn().mockResolvedValue({ success: true });

    const counters = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn });

    expect(counters.rows_selected).toBe(3);
    expect(counters.rows_unmeasurable).toBe(1);
    expect(counters.rows_written).toBe(2); // shipped_clean + unmeasurable both get written; the 'unknown' one is skipped
    expect(recordPublishOutcomeFn).toHaveBeenCalledTimes(2);
  });

  // TS-2 (idempotent re-run, unit form): once every selected row has been recorded to a
  // terminal (non-unknown) outcome, the SECOND sweep's row SELECTION returns zero rows --
  // recordPublishOutcome does an unconditional .eq('correlation_id') update with no
  // outcome='unknown' guard on the write itself, so idempotency is enforced by FR-4's
  // row SELECTION (outcome='unknown'), never by the write.
  it('the second sweep selects zero rows once the first sweep recorded terminal outcomes (TS-2)', async () => {
    let remainingUnknownRows = [{ correlation_id: 'corr-1' }];
    const supabase = {
      from: vi.fn((table) => {
        if (table !== 'venture_channel_publish_ledger') throw new Error(`unexpected table: ${table}`);
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          limit: vi.fn(() => Promise.resolve({ data: remainingUnknownRows, error: null }))
        };
        return chain;
      })
    };
    const observeOutcomeFn = vi.fn().mockResolvedValue({ outcome: 'shipped_clean', outcomeRef: 'p1' });
    const recordPublishOutcomeFn = vi.fn().mockImplementation(async () => {
      remainingUnknownRows = []; // simulates the row now being outcome='shipped_clean', no longer selected
      return { success: true };
    });

    const first = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn });
    expect(first.rows_selected).toBe(1);
    expect(first.rows_written).toBe(1);

    const second = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn });
    expect(second.rows_selected).toBe(0);
    expect(second.rows_written).toBe(0);
  });

  it('a 23514 (expected-pre-migration) write failure counts in rows_write_failed, not rows_written (TS-12)', async () => {
    const supabase = makeLedgerSelectSupabase([{ correlation_id: 'corr-1' }]);
    const observeOutcomeFn = vi.fn().mockResolvedValue({ outcome: 'unmeasurable', outcomeRef: null });
    const recordPublishOutcomeFn = vi.fn().mockResolvedValue({ success: false, reason: 'expected-pre-migration' });

    const counters = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn });

    expect(counters.rows_unmeasurable).toBe(1);
    expect(counters.rows_write_failed).toBe(1);
    expect(counters.rows_written).toBe(0);
  });
});
