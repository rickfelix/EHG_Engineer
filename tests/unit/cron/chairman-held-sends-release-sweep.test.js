/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 — release sweep entrypoint. Mirrors the DI pattern of
 * the existing adam-late-verdict-reconcile-sweep.test.js: fake supabase + injected releaseHeldSend.
 * Focus: per-row error isolation (D2 amplifier fix -- one poison row must not abort the batch) and
 * correct outcome-to-summary-bucket mapping, including the two new unclaim outcomes.
 */
import { describe, it, expect, vi } from 'vitest';
import { main } from '../../../scripts/cron/chairman-held-sends-release-sweep.mjs';

/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-6): the sweep's main() issues TWO distinct queries
 * against chairman_held_sends -- the claimable read (.select().eq('status','held').order().limit())
 * feeding `rows`, and the FR-6 orphan scan (.select().in('status',[...]).limit()) feeding
 * `orphanScanRows`. TESTING sub-agent finding G4 (HIGH): the earlier version of this fake had no
 * .in() branch at all, so main()'s orphan query threw, the best-effort catch swallowed it silently,
 * and EVERY existing test here logged orphan_scan_skipped with summary.orphans=[] while reading
 * green -- a regression that broke the orphan scan outright would never have turned red.
 * orphanScanRows defaults to `rows` when omitted, so every pre-existing call site (none of which
 * asserts on summary.orphans) is unaffected.
 */
function makeSupabase(rows, { orphanScanRows } = {}) {
  return {
    from(table) {
      if (table !== 'chairman_held_sends') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: rows, error: null }),
            }),
          }),
          in: () => ({
            limit: async () => ({ data: orphanScanRows !== undefined ? orphanScanRows : rows, error: null }),
          }),
        }),
      };
    },
  };
}

describe('chairman-held-sends-release-sweep main()', () => {
  it('exits OK (0), not INFRA, when the table does not exist yet (migration not applied -- operator-contract note)', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "Could not find the table 'public.chairman_held_sends' in the schema cache" } }) }) }) }) }) };
    const logger = { log: vi.fn() };
    const result = await main([], { supabase, logger, env: {} });
    expect(result.exitCode).toBe(0);
    expect(result.summary.tableApplied).toBe(false);
  });

  it('exits INFRA (1) when the read query itself fails', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'read boom' } }) }) }) }) }) };
    const logger = { log: vi.fn() };
    const result = await main([], { supabase, logger, env: {} });
    expect(result.exitCode).toBe(1);
    expect(result.summary.error).toBe('read boom');
  });

  it('processes every row and buckets outcomes correctly, including the D1/D2 unclaim outcomes', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
    const supabase = makeSupabase(rows);
    const outcomesById = {
      a: { action: 'released' },
      b: { action: 'refuse', reason: 'self_answered' },
      c: { action: 'hold', reason: 'unanswered' },
      d: { action: 'dispatch_not_sent_unclaimed' },
      e: { action: 'dispatch_threw_unclaimed' },
    };
    const releaseHeldSend = vi.fn(async (_sb, row) => outcomesById[row.id]);
    const logger = { log: vi.fn() };
    const result = await main([], { supabase, logger, env: {}, releaseDeps: {}, releaseHeldSend });

    expect(result.exitCode).toBe(0);
    expect(releaseHeldSend).toHaveBeenCalledTimes(5);
    expect(result.summary.released).toBe(1);
    expect(result.summary.refused).toBe(1);
    // 'hold' + both new unclaim outcomes all bucket as "held_still" -- all three mean the row is
    // back in (or remains in) the retryable held pool.
    expect(result.summary.heldStill).toBe(3);
    expect(result.summary.rowErrors).toBe(0);
  });

  it('D2 amplifier fix: one row whose releaseHeldSend call throws does NOT abort processing of the remaining rows', async () => {
    const rows = [{ id: 'poison' }, { id: 'fine-1' }, { id: 'fine-2' }];
    const supabase = makeSupabase(rows);
    const releaseHeldSend = vi.fn(async (_sb, row) => {
      if (row.id === 'poison') throw new Error('unexpected explosion');
      return { action: 'released' };
    });
    const logger = { log: vi.fn() };
    const result = await main([], { supabase, logger, env: {}, releaseHeldSend });

    expect(result.exitCode).toBe(0);
    expect(releaseHeldSend).toHaveBeenCalledTimes(3);
    expect(result.summary.rowErrors).toBe(1);
    expect(result.summary.released).toBe(2);
    const poisonOutcome = result.summary.outcomes.find((o) => o.id === 'poison');
    expect(poisonOutcome).toMatchObject({ action: 'row_error' });
    expect(poisonOutcome.error).toContain('unexpected explosion');
  });

  it('a released row whose audit write failed is still counted as released (best-effort audit) but flagged separately', async () => {
    const rows = [{ id: 'a' }];
    const supabase = makeSupabase(rows);
    const releaseHeldSend = vi.fn(async () => ({ action: 'released_but_audit_write_failed', error: 'deadlock' }));
    const logger = { log: vi.fn() };
    const result = await main([], { supabase, logger, env: {}, releaseHeldSend });

    expect(result.summary.released).toBe(1);
    expect(result.summary.auditWriteFailed).toBe(1);
  });

  // ── SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-2) ──────────────────────────────────────────
  // TESTING sub-agent finding G1 (HIGH): this file previously never inspected the `deps` object
  // main() actually passes to releaseHeldSend, so a regression to FR-2's context.now default (or
  // its merge-not-default-only semantics) would ship green. These assert on the THIRD argument of
  // every releaseHeldSend call.
  it('FR-2: defaults context.now to a finite epoch when the caller supplies no releaseDeps at all', async () => {
    const rows = [{ id: 'a' }];
    const supabase = makeSupabase(rows);
    const releaseHeldSend = vi.fn(async () => ({ action: 'hold', reason: 'unanswered' }));
    const logger = { log: vi.fn() };
    await main([], { supabase, logger, env: {}, releaseHeldSend });

    const [, , thirdArg] = releaseHeldSend.mock.calls[0];
    expect(Number.isFinite(thirdArg.context.now)).toBe(true);
  });

  it('FR-2: MERGES a caller-injected fixed context.now (e.g. a deterministic test clock) rather than overwriting it with the default -- the default must never win over an explicit value', async () => {
    const rows = [{ id: 'a' }];
    const supabase = makeSupabase(rows);
    const releaseHeldSend = vi.fn(async () => ({ action: 'hold', reason: 'unanswered' }));
    const logger = { log: vi.fn() };
    await main([], { supabase, logger, env: {}, releaseHeldSend, releaseDeps: { context: { now: 1234567 } } });

    const [, , thirdArg] = releaseHeldSend.mock.calls[0];
    expect(thirdArg.context.now).toBe(1234567);
  });

  it('FR-2: preserves every OTHER releaseDeps key (resolveVerifiedAnswer, sendChairmanSMS, sendOpts, claimedBy) alongside the injected default clock -- a regression to default-ONLY (replacing releaseDeps wholesale) would drop these', async () => {
    const rows = [{ id: 'a' }];
    const supabase = makeSupabase(rows);
    const releaseHeldSend = vi.fn(async () => ({ action: 'hold', reason: 'unanswered' }));
    const logger = { log: vi.fn() };
    const sentinelResolver = vi.fn();
    const sentinelSend = vi.fn();
    await main([], {
      supabase, logger, env: {}, releaseHeldSend,
      releaseDeps: { resolveVerifiedAnswer: sentinelResolver, sendChairmanSMS: sentinelSend, claimedBy: 'test-claimant' },
    });

    const [, , thirdArg] = releaseHeldSend.mock.calls[0];
    expect(thirdArg.resolveVerifiedAnswer).toBe(sentinelResolver);
    expect(thirdArg.sendChairmanSMS).toBe(sentinelSend);
    expect(thirdArg.claimedBy).toBe('test-claimant');
    expect(Number.isFinite(thirdArg.context.now)).toBe(true);
  });

  // ── SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-6) ──────────────────────────────────────────
  it('FR-6: main() surfaces a detected orphan (a row stuck in releasing) in summary.orphans and logs a loud line', async () => {
    const rows = [];
    const orphanScanRows = [{ id: 'stuck-1', status: 'releasing', claimed_at: new Date(0).toISOString() }];
    const supabase = makeSupabase(rows, { orphanScanRows });
    const releaseHeldSend = vi.fn();
    const logger = { log: vi.fn() };
    const result = await main([], { supabase, logger, env: {}, releaseHeldSend });

    expect(result.summary.orphans).toHaveLength(1);
    expect(result.summary.orphans[0]).toMatchObject({ id: 'stuck-1', reasons: ['stuck_in_releasing'] });
    const orphanLog = logger.log.mock.calls.map((c) => c[0]).find((line) => line.includes('orphans_detected'));
    expect(orphanLog).toBeTruthy();
  });

  it('FR-6: main() reports an empty orphans array (not a crash) when nothing is orphaned', async () => {
    const rows = [];
    const orphanScanRows = [{ id: 'healthy-1', status: 'held', attempts: 0, consult_correlation_id: null, consult_row_id: null }];
    const supabase = makeSupabase(rows, { orphanScanRows });
    const releaseHeldSend = vi.fn();
    const logger = { log: vi.fn() };
    const result = await main([], { supabase, logger, env: {}, releaseHeldSend });

    expect(result.summary.orphans).toEqual([]);
  });
});
