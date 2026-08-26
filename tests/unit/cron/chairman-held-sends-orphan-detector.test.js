/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-6) — JS-based orphan detector for
 * chairman_held_sends, deliberately NOT a SQL view (the existing
 * v_chairman_held_sends_unreconcilable view is db-tier-only and blind to a row's first 24h).
 * Pure function, no I/O — covers three signals the view cannot see: a missing consult_row_id
 * readback, a held row already retried at least once, and a row stuck in status='releasing'
 * past one sweep cadence.
 */
import { describe, it, expect } from 'vitest';
import { detectOrphanedHeldSends } from '../../../scripts/cron/chairman-held-sends-release-sweep.mjs';

describe('detectOrphanedHeldSends (FR-6)', () => {
  it('flags a held row with a correlation id but no consult_row_id readback', () => {
    const rows = [{ id: 'a', status: 'held', attempts: 0, consult_correlation_id: 'corr-1', consult_row_id: null }];
    const orphans = detectOrphanedHeldSends(rows, { now: 1000 });
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatchObject({ id: 'a', reasons: ['no_consult_row_id'] });
  });

  it('does NOT flag a held row with no consult_correlation_id at all -- that class belongs to v_chairman_held_sends_unreconcilable, not this detector', () => {
    const rows = [{ id: 'b', status: 'held', attempts: 0, consult_correlation_id: null, consult_row_id: null }];
    expect(detectOrphanedHeldSends(rows, { now: 1000 })).toHaveLength(0);
  });

  it('flags a held row that has already been retried (attempts > 0)', () => {
    const rows = [{ id: 'c', status: 'held', attempts: 3, consult_correlation_id: 'corr-2', consult_row_id: 'row-2' }];
    const orphans = detectOrphanedHeldSends(rows, { now: 1000 });
    expect(orphans).toHaveLength(1);
    expect(orphans[0].reasons).toEqual(['retried_and_still_held']);
  });

  it('a row can carry BOTH reasons at once', () => {
    const rows = [{ id: 'd', status: 'held', attempts: 1, consult_correlation_id: 'corr-3', consult_row_id: null }];
    const orphans = detectOrphanedHeldSends(rows, { now: 1000 });
    expect(orphans[0].reasons.sort()).toEqual(['no_consult_row_id', 'retried_and_still_held']);
  });

  it('flags a row stuck in releasing past the stale threshold', () => {
    const rows = [{ id: 'e', status: 'releasing', claimed_at: new Date(0).toISOString() }];
    const orphans = detectOrphanedHeldSends(rows, { now: 20 * 60 * 1000, staleReleasingMs: 15 * 60 * 1000 });
    expect(orphans).toHaveLength(1);
    expect(orphans[0].reasons).toEqual(['stuck_in_releasing']);
  });

  it('does NOT flag a row freshly claimed into releasing (within the stale window)', () => {
    const rows = [{ id: 'f', status: 'releasing', claimed_at: new Date(19 * 60 * 1000).toISOString() }];
    const orphans = detectOrphanedHeldSends(rows, { now: 20 * 60 * 1000, staleReleasingMs: 15 * 60 * 1000 });
    expect(orphans).toHaveLength(0);
  });

  it('flags a releasing row with no claimed_at at all (malformed claim) regardless of age', () => {
    const rows = [{ id: 'g', status: 'releasing', claimed_at: null }];
    expect(detectOrphanedHeldSends(rows, { now: 1000 })[0].reasons).toEqual(['stuck_in_releasing']);
  });

  it('leaves a healthy released/refused row untouched', () => {
    const rows = [
      { id: 'h', status: 'released', attempts: 0, consult_correlation_id: 'x', consult_row_id: 'y' },
      { id: 'i', status: 'refuse', attempts: 0 },
    ];
    expect(detectOrphanedHeldSends(rows, { now: 1000 })).toHaveLength(0);
  });

  it('returns an empty array for an empty/undefined input', () => {
    expect(detectOrphanedHeldSends([], { now: 1000 })).toEqual([]);
    expect(detectOrphanedHeldSends(undefined, { now: 1000 })).toEqual([]);
  });
});
