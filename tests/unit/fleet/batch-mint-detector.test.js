/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-1): lib/fleet/batch-mint-detector.js
 * Covers TS-1, TS-10, TS-12.
 */
import { describe, it, expect } from 'vitest';
import { detectBatchMintGroups, BATCH_WINDOW_MS } from '../../../lib/fleet/batch-mint-detector.js';

describe('detectBatchMintGroups', () => {
  it('TS-1: 3 mints by the same creator at t=0/3min/8min are ALL held (retroactive, not just the 3rd)', () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 3 * 60000).toISOString() },
      { id: 'QF-3', created_by: 'sess-A', created_at: new Date(t0 + 8 * 60000).toISOString() },
    ];
    const { heldIds, groups } = detectBatchMintGroups(mints);
    expect(heldIds).toEqual(new Set(['QF-1', 'QF-2', 'QF-3']));
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds.sort()).toEqual(['QF-1', 'QF-2', 'QF-3']);
  });

  it('TS-12: exactly 2 mints in the window is NOT held', () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 5 * 60000).toISOString() },
    ];
    expect(detectBatchMintGroups(mints).heldIds.size).toBe(0);
  });

  it('TS-12: a 3rd mint at exactly the window boundary IS included (inclusive boundary)', () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 1000).toISOString() },
      { id: 'QF-3', created_by: 'sess-A', created_at: new Date(t0 + BATCH_WINDOW_MS).toISOString() },
    ];
    expect(detectBatchMintGroups(mints).heldIds.size).toBe(3);
  });

  it('TS-12: 3 mints by 3 DIFFERENT creators are NOT held', () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-B', created_at: new Date(t0 + 60000).toISOString() },
      { id: 'QF-3', created_by: 'sess-C', created_at: new Date(t0 + 120000).toISOString() },
    ];
    expect(detectBatchMintGroups(mints).heldIds.size).toBe(0);
  });

  it('3 singles spread >10min apart are NOT flagged', () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 15 * 60000).toISOString() },
      { id: 'QF-3', created_by: 'sess-A', created_at: new Date(t0 + 30 * 60000).toISOString() },
    ];
    expect(detectBatchMintGroups(mints).heldIds.size).toBe(0);
  });

  it('TS-10: re-scanning the full, converged set retroactively holds all racing members (TOCTOU-safe by re-scan)', () => {
    // Simulates two concurrent mints racing the same window: an earlier sweep might have only
    // seen 2 rows, but the detector is idempotent — re-run against the FULL set once both
    // inserts have landed and it converges to holding all 3, regardless of arrival order.
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const partialView = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 60000).toISOString() },
    ];
    expect(detectBatchMintGroups(partialView).heldIds.size).toBe(0); // only 2 seen — not yet a batch

    const convergedView = [
      ...partialView,
      { id: 'QF-3', created_by: 'sess-A', created_at: new Date(t0 + 90000).toISOString() },
    ];
    const { heldIds } = detectBatchMintGroups(convergedView);
    expect(heldIds).toEqual(new Set(['QF-1', 'QF-2', 'QF-3']));
  });

  it('rows missing id/created_by/created_at are skipped rather than throwing', () => {
    expect(() => detectBatchMintGroups([{ id: 'QF-1' }, null, undefined])).not.toThrow();
    expect(detectBatchMintGroups([{ id: 'QF-1' }, null, undefined]).heldIds.size).toBe(0);
  });

  it('handles an empty/undefined list', () => {
    expect(detectBatchMintGroups([]).heldIds.size).toBe(0);
    expect(detectBatchMintGroups(undefined).heldIds.size).toBe(0);
  });
});
