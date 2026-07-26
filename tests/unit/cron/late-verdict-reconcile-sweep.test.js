/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 — TS-11, FR-4b durable cron entrypoint.
 * Fully DI'd: no network, no real clock, no DB.
 */
import { describe, it, expect, vi } from 'vitest';

// The sweep imports @supabase/supabase-js at module level for its buildSupabase fallback. Every
// case here injects a fake client, but the import alone means nothing STRUCTURALLY prevents a real
// one — so mock the module outright. A unit test must not be able to open a socket even by
// accident, and createClient throwing here proves no case silently fell through to the real path.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('unit test must never construct a real supabase client'); },
}));

import { main } from '../../../scripts/cron/adam-late-verdict-reconcile-sweep.mjs';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const NOW = 1770000000000;

function logger() {
  const lines = [];
  return { lines, log: (l) => lines.push(l), json: () => JSON.parse(lines[0].replace('[late-verdict-reconcile] ', '')) };
}

describe('adam-late-verdict-reconcile-sweep main()', () => {
  it('exits 0 and reports what it consumed', async () => {
    const log = logger();
    const reconcile = vi.fn(async () => ({ checked: 4, reconciled: 2, reconciledIds: ['a', 'b'], nearMisses: 1 }));
    const { exitCode, summary } = await main([], {
      env: ENV, now: NOW, logger: log, supabase: {}, reconcile,
      recordDisposition: async () => ({ created: true }),
      detectVerdictDelta: () => false,
    });

    expect(exitCode).toBe(0);
    expect(summary).toMatchObject({ checked: 4, reconciled: 2 });
    expect(log.json()).toMatchObject({ ok: true, checked: 4, reconciled: 2, near_misses: 1, dry_run: false });
  });

  it('a quiet lane is a HEALTHY exit 0, never a breach', async () => {
    // Under half of consults are ever answered (MEASURED 2026-07-25: 42/93 = 45.2%), so "nothing to
    // reconcile" must never be escalated — that is the alert-fatigue failure this SD exists to end.
    const log = logger();
    const { exitCode } = await main([], {
      env: ENV, now: NOW, logger: log, supabase: {},
      reconcile: async () => ({ checked: 9, reconciled: 0, reconciledIds: [], nearMisses: 0 }),
      recordDisposition: async () => ({ created: true }),
      detectVerdictDelta: () => false,
    });
    expect(exitCode).toBe(0);
    expect(log.json()).toMatchObject({ ok: true, reconciled: 0 });
  });

  it('condition C: an all-FAILING lane is visible in the log, not disguised as quiet', async () => {
    // The reconciler fails open per candidate, so a sweep where every write threw still returns
    // reconciled:0 — wire-identical to "nothing to do" unless the counters are actually printed.
    // Previously nothing asserted these fields, and the stubs did not even return them, so the
    // surfacing could have been dropped entirely with the suite still green.
    const log = logger();
    const { exitCode } = await main([], {
      env: ENV, now: NOW, logger: log, supabase: {},
      reconcile: async () => ({ checked: 5, reconciled: 0, reconciledIds: [], nearMisses: 0,
        alreadyDispositioned: 0, errors: 5, firstError: 'raw driver text', firstErrorCode: '23514' }),
      recordDisposition: async () => ({ created: true }), detectVerdictDelta: () => false,
    });

    expect(exitCode).toBe(0); // fail-open is deliberate: the rows stay retryable
    expect(log.json()).toMatchObject({ ok: true, checked: 5, reconciled: 0, write_errors: 5, first_error_code: '23514' });
  });

  it('SEC-13: the raw driver message NEVER reaches the log', async () => {
    // recordDisposition rethrows the driver message verbatim, and a Postgres constraint violation
    // embeds "Failing row contains (...)" with the consult body. This log is world-readable on a
    // public repo, so only the error CODE may be printed. Capping length would not help — it bounds
    // size, not content, and in practice truncates mid-body.
    const log = logger();
    await main([], {
      env: ENV, now: NOW, logger: log, supabase: {},
      reconcile: async () => ({ checked: 1, reconciled: 0, reconciledIds: [], nearMisses: 0,
        alreadyDispositioned: 0, errors: 1,
        firstError: 'violates check constraint "c" Failing row contains (a1, SECRET-CONSULT-BODY)',
        firstErrorCode: '23514' }),
      recordDisposition: async () => ({ created: true }), detectVerdictDelta: () => false,
    });

    const line = log.lines[0];
    expect(line).not.toContain('SECRET-CONSULT-BODY');
    expect(line).not.toContain('Failing row contains');
    expect(log.json().first_error_code).toBe('23514');
  });

  it('SEC-14: the counters are present on a QUIET lane too, not just a matched one', async () => {
    // 54.8% of consults are never answered, so the no-answers path is the steady state. The
    // reconciler's early-return shape omitted these keys and JSON.stringify drops undefined, so
    // write_errors was absent from most real log lines — reintroducing field-absent vs field-zero
    // ambiguity in the very signal added to remove it.
    const log = logger();
    await main([], {
      env: ENV, now: NOW, logger: log, supabase: {},
      reconcile: async () => ({ checked: 9, reconciled: 0, reconciledIds: [], nearMisses: 0,
        alreadyDispositioned: 0, errors: 0, firstError: null, firstErrorCode: null }),
      recordDisposition: async () => ({ created: true }), detectVerdictDelta: () => false,
    });

    const parsed = log.json();
    expect(Object.prototype.hasOwnProperty.call(parsed, 'write_errors')).toBe(true);
    expect(parsed.write_errors).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'already_dispositioned')).toBe(true);
  });

  it('--dry-run records nothing but still exercises the read/match path', async () => {
    const log = logger();
    const recordDisposition = vi.fn();
    let passedRecord;
    const reconcile = vi.fn(async (_sb, opts) => { passedRecord = opts.recordDisposition; return { checked: 1, reconciled: 0, reconciledIds: [], nearMisses: 0 }; });

    const { exitCode } = await main(['--dry-run'], {
      env: ENV, now: NOW, logger: log, supabase: {}, reconcile,
      recordDisposition, detectVerdictDelta: () => false,
    });

    expect(exitCode).toBe(0);
    expect(log.json().dry_run).toBe(true);
    await expect(passedRecord({})).resolves.toMatchObject({ dryRun: true });
    expect(recordDisposition).not.toHaveBeenCalled(); // the real writer is never reached
  });

  it('resolves its REAL collaborators (no injected reconcile) — guards CJS/ESM interop', async () => {
    // Every other case injects `reconcile`, so none of them exercise the actual import chain.
    // reconcileLateVerdicts lives in a .cjs module imported from ESM, which is exactly where a
    // named export silently resolves to undefined and the sweep would no-op forever in prod.
    const log = logger();
    const fakeSupabase = {
      from() { return this; },
      select() { return this; },
      eq() { return this; },
      is() { return this; },
      order() { return this; }, // SEC-3 added ORDER to the candidate query; omitting it here threw
      gte() { return this; },   // SEC-11 added the recency horizon
      limit: async () => ({ data: [], error: null }),
    };
    const { exitCode, summary } = await main([], { env: ENV, now: NOW, logger: log, supabase: fakeSupabase });
    expect(exitCode).toBe(0);
    expect(summary).toMatchObject({ checked: 0, reconciled: 0 });
  });

  it('missing credentials is an INFRA failure (exit 1), never a silent quiet lane', async () => {
    const log = logger();
    const { exitCode } = await main([], { env: {}, now: NOW, logger: log });
    expect(exitCode).toBe(1);
    expect(log.json()).toMatchObject({ ok: false, reason: 'infra' });
  });

  it('a throwing sweep is an INFRA failure (exit 1) with a truncated error', async () => {
    const log = logger();
    const { exitCode } = await main([], {
      env: ENV, now: NOW, logger: log, supabase: {},
      reconcile: async () => { throw new Error('lane read failed'); },
      recordDisposition: async () => ({}), detectVerdictDelta: () => false,
    });
    expect(exitCode).toBe(1);
    expect(log.json()).toMatchObject({ ok: false, reason: 'infra' });
    // This repo is PUBLIC and GHA logs are world-readable — the error must be bounded.
    expect(log.json().error.length).toBeLessThanOrEqual(200);
  });
});
