/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 — release sweep entrypoint. Mirrors the DI pattern of
 * the existing adam-late-verdict-reconcile-sweep.test.js: fake supabase + injected releaseHeldSend.
 * Focus: per-row error isolation (D2 amplifier fix -- one poison row must not abort the batch) and
 * correct outcome-to-summary-bucket mapping, including the two new unclaim outcomes.
 */
import { describe, it, expect, vi } from 'vitest';
import { main } from '../../../scripts/cron/chairman-held-sends-release-sweep.mjs';

function makeSupabase(rows) {
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
});
