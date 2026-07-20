// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-3) — theater-guard sweep tests.
import { describe, it, expect, vi } from 'vitest';
import { sweepArtifactTheater, runArtifactTheaterSweep, DEFAULT_PLAN_WINDOW_MS } from './theater-guard.js';

const NOW = new Date('2026-07-12T12:00:00Z');
const OLD = new Date(NOW.getTime() - DEFAULT_PLAN_WINDOW_MS - 1000).toISOString(); // just past the window
const RECENT = new Date(NOW.getTime() - 1000).toISOString(); // well within the window

describe('sweepArtifactTheater (pure logic)', () => {
  it('AC-1: flags an unconsumed row older than the plan window', () => {
    const rows = [{ id: 'a1', created_at: OLD, consumed_at: null }];
    const result = sweepArtifactTheater(rows, { now: NOW });
    expect(result.flagged).toHaveLength(1);
    expect(result.flagged[0]).toEqual({ id: 'a1', reason: 'NO_CONSUMING_CHANNEL_ACTION_WITHIN_PLAN_WINDOW' });
    expect(result.checked).toBe(1);
  });

  it('does not flag an unconsumed row still within the plan window', () => {
    const rows = [{ id: 'a2', created_at: RECENT, consumed_at: null }];
    const result = sweepArtifactTheater(rows, { now: NOW });
    expect(result.flagged).toHaveLength(0);
  });

  it('AC-2: an actively-consumed asset is never flagged, even if old (reference != false-positive)', () => {
    const rows = [{ id: 'a3', created_at: OLD, consumed_at: RECENT }];
    const result = sweepArtifactTheater(rows, { now: NOW });
    expect(result.flagged).toHaveLength(0);
  });

  it('respects an overridden planWindowMs (the PRD-flagged unpinned value)', () => {
    const rows = [{ id: 'a4', created_at: RECENT, consumed_at: null }];
    const result = sweepArtifactTheater(rows, { now: NOW, planWindowMs: 500 }); // 500ms window, RECENT is 1000ms old
    expect(result.flagged).toHaveLength(1);
    expect(result.planWindowMs).toBe(500);
  });

  it('handles an empty row set without error', () => {
    expect(sweepArtifactTheater([], { now: NOW })).toEqual({ flagged: [], checked: 0, planWindowMs: DEFAULT_PLAN_WINDOW_MS });
  });
});

describe('runArtifactTheaterSweep (DB wrapper)', () => {
  it('queries only unconsumed rows and delegates to the pure sweep', async () => {
    // runArtifactTheaterSweep paginates via fetchAllPaginated (SD-LEO-INFRA-COUNT-TRUNCATION-
    // DISCIPLINE-001 FR-6 batch 8): .is() now returns a chainable .order() -> .range() page.
    const is = vi.fn().mockReturnValue({
      order: () => ({
        range: () => Promise.resolve({ data: [{ id: 'a1', created_at: OLD, consumed_at: null }], error: null }),
      }),
    });
    const select = vi.fn().mockReturnValue({ is });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from };

    const result = await runArtifactTheaterSweep(supabase, { now: NOW });
    expect(from).toHaveBeenCalledWith('creative_assets');
    expect(select).toHaveBeenCalledWith('id, created_at, consumed_at');
    expect(is).toHaveBeenCalledWith('consumed_at', null);
    expect(result.flagged).toHaveLength(1);
  });

  it('throws on a query error rather than silently returning an empty sweep', async () => {
    const is = vi.fn().mockReturnValue({
      order: () => ({
        range: () => Promise.resolve({ data: null, error: new Error('db down') }),
      }),
    });
    const supabase = { from: () => ({ select: () => ({ is }) }) };
    await expect(runArtifactTheaterSweep(supabase)).rejects.toThrow('db down');
  });
});
