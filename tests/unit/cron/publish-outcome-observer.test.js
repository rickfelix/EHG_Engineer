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
import { observeOutcome } from '../../../lib/marketing/observer/observe-outcome.js';
import { recordPublishOutcome } from '../../../lib/marketing/autonomy-gate.js';

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
        order: vi.fn(() => chain),
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
      .mockResolvedValueOnce({ outcome: 'shipped_clean', outcomeRef: 'p1', joined: true })
      .mockResolvedValueOnce({ outcome: 'unmeasurable', outcomeRef: null, joined: false })
      .mockResolvedValueOnce({ outcome: 'unknown', outcomeRef: null, joined: true });
    const recordPublishOutcomeFn = vi.fn().mockResolvedValue({ success: true });

    const counters = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn });

    expect(counters.rows_selected).toBe(3);
    expect(counters.rows_joined).toBe(2); // the shipped_clean and unknown rows joined; the unmeasurable one did not
    expect(counters.rows_left_unknown).toBe(1);
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
          order: vi.fn(() => chain),
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

  // MEDIUM finding (EXEC phase): FR-4 requires an expected-pre-migration write failure be
  // reported SEPARATELY from a genuine failure, not lumped into the same rows_write_failed
  // counter (which the original cron-layer code did, discarding recorded.reason entirely).
  it('a 23514 (expected-pre-migration) write failure counts in its own counter, distinct from a genuine failure (TS-12)', async () => {
    const supabase = makeLedgerSelectSupabase([{ correlation_id: 'corr-1' }]);
    const observeOutcomeFn = vi.fn().mockResolvedValue({ outcome: 'unmeasurable', outcomeRef: null, joined: false });
    const recordPublishOutcomeFn = vi.fn().mockResolvedValue({ success: false, reason: 'expected-pre-migration' });

    const counters = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn });

    expect(counters.rows_unmeasurable).toBe(1);
    expect(counters.rows_write_failed_expected_pre_migration).toBe(1);
    expect(counters.rows_write_failed).toBe(0);
    expect(counters.rows_written).toBe(0);
  });

  it('a genuine (non-23514) write failure counts in rows_write_failed, not the expected-pre-migration counter', async () => {
    const supabase = makeLedgerSelectSupabase([{ correlation_id: 'corr-1' }]);
    const observeOutcomeFn = vi.fn().mockResolvedValue({ outcome: 'shipped_clean', outcomeRef: 'p1', joined: true });
    const recordPublishOutcomeFn = vi.fn().mockResolvedValue({ success: false, error: 'connection failure' });

    const counters = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn });

    expect(counters.rows_write_failed).toBe(1);
    expect(counters.rows_write_failed_expected_pre_migration).toBe(0);
  });
});

/**
 * FR-8 AC-1 / TS-7 (VALIDATION + TESTING finding, both independently flagged this gap):
 * every other test in this file injects fakes for BOTH observeOutcomeFn and
 * recordPublishOutcomeFn, so the real composition sweepOnce -> recordPublishOutcome ->
 * evaluateGraduation was never exercised end-to-end -- exactly the gap that let the SEC-2
 * mode-filter defects (the original inertness AND the first fail-open fix attempt) go
 * undetected until an independent code review caught them. This test uses the REAL
 * observeOutcome, recordPublishOutcome, and evaluateGraduation -- only the platform
 * adapter's fetchImpl and the credential resolver are faked (the genuine external
 * boundary), backed by one fake supabase client that models every table this composition
 * actually touches.
 */
describe('sweepOnce end-to-end with the REAL observeOutcome/recordPublishOutcome/evaluateGraduation (FR-8 AC-1, TS-7)', () => {
  function makeEndToEndSupabase() {
    const ledgerRow = {
      id: 'ledger-1', venture_id: 'v-1', channel_type: 'x', correlation_id: 'corr-1',
      created_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const contentRow = { id: 'content-1', external_post_id: '123', platform: 'x' };
    const graduationCalls = [];
    const autonomyUpsert = vi.fn(() => Promise.resolve({ error: null }));

    return {
      autonomyUpsert,
      graduationCalls,
      from: vi.fn((table) => {
        if (table === 'venture_channel_publish_ledger') {
          const filters = {};
          const chain = {
            select: vi.fn((cols) => { chain._cols = cols; return chain; }),
            eq: vi.fn((field, value) => { filters[field] = value; return chain; }),
            not: vi.fn((field, _op, list) => { filters[`${field}_not_in`] = list; return chain; }),
            order: vi.fn(() => chain),
            update: vi.fn((patch) => { chain._update = patch; return chain; }),
            limit: vi.fn((n) => {
              // sweepOnce's own row-selection query (select('correlation_id'))
              if (chain._cols === 'correlation_id') {
                return Promise.resolve({ data: [{ correlation_id: 'corr-1' }], error: null });
              }
              // evaluateGraduation's candidate window query
              graduationCalls.push({ filters: { ...filters }, limit: n });
              return Promise.resolve({ data: [], error: null });
            }),
            maybeSingle: vi.fn(() => {
              if (chain._update) {
                // recordPublishOutcome's update-then-read
                return Promise.resolve({ data: { venture_id: 'v-1', channel_type: 'x', execution_mode: 'mock' }, error: null });
              }
              // observeOutcome's own ledger read
              return Promise.resolve({ data: ledgerRow, error: null });
            }),
          };
          return chain;
        }
        if (table === 'campaign_content') {
          return {
            select: vi.fn(function () { return this; }),
            eq: vi.fn(function () { return this; }),
            maybeSingle: vi.fn(() => Promise.resolve({ data: contentRow, error: null })),
          };
        }
        if (table === 'venture_channel_autonomy') {
          return { upsert: autonomyUpsert };
        }
        if (table === 'venture_demand_verdicts') {
          const chain = {
            select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          };
          return chain;
        }
        if (table === 'venture_channel_secrets') {
          return {
            select: vi.fn(function () { return this; }),
            eq: vi.fn(function () { return this; }),
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          };
        }
        throw new Error(`unmocked table in end-to-end test: ${table}`);
      }),
    };
  }

  it('a mock-mode outcome flows through the real chain: joined, written, and evaluateGraduation runs scoped to mode=mock, never touching venture_channel_autonomy', async () => {
    const supabase = makeEndToEndSupabase();
    // resolveCredentials faked (the genuine external boundary -- no real secret store in
    // this unit test); getTweet's own network call faked via fetchImpl so the REAL
    // XAdapter class still runs, only its transport is stubbed.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ data: { id: '123' } }) });
    const resolveCredentials = vi.fn(() => Promise.resolve({ fetchImpl, accessToken: 'tok' }));
    const observeOutcomeFn = (args) => observeOutcome({ ...args, resolveCredentials });

    const counters = await sweepOnce(supabase, { observeOutcomeFn, recordPublishOutcomeFn: recordPublishOutcome });

    expect(counters.rows_selected).toBe(1);
    expect(counters.rows_joined).toBe(1);
    expect(counters.rows_written).toBe(1);
    // evaluateGraduation's real candidate query ran, scoped to this venture/channel/mode:
    expect(supabase.graduationCalls).toHaveLength(1);
    expect(supabase.graduationCalls[0].filters).toMatchObject({ venture_id: 'v-1', channel_type: 'x', execution_mode: 'mock' });
    // FR-5/SEC-2: a mock-mode evaluation never writes venture_channel_autonomy, in either direction.
    expect(supabase.autonomyUpsert).not.toHaveBeenCalled();
  });
});
