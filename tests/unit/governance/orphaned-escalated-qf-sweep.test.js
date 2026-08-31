/**
 * QF-20260831-191 — standing gauge for escalated QFs with no linked SD.
 *
 * SPECIMEN: a quick_fixes row reaching status='escalated' with escalated_to_sd_id NULL sits in NO
 * lane — the QF lane treats it as done, no SD exists, so nothing surfaces it. Witnessed:
 * QF-20260831-310 and -373 both sat this way until hand-linked.
 */
import { describe, it, expect } from 'vitest';
import { findOrphanedEscalatedQfs, DEFAULT_GRACE_MS } from '../../../lib/governance/orphaned-escalated-qf-sweep.js';

describe('findOrphanedEscalatedQfs', () => {
  const now = Date.parse('2026-08-31T12:00:00Z');

  it('[SPECIMEN] flags a row past the grace window', () => {
    const rows = [{ id: 'QF-20260831-310', created_at: '2026-08-31T11:00:00Z' }]; // 1h old
    const result = findOrphanedEscalatedQfs(rows, now);
    expect(result).toEqual({ count: 1, orphaned: [{ id: 'QF-20260831-310', created_at: '2026-08-31T11:00:00Z', age_minutes: 60 }] });
  });

  it('[TWO-SIDED] does not flag a row still inside the grace window', () => {
    const rows = [{ id: 'QF-fresh', created_at: '2026-08-31T11:55:00Z' }]; // 5min old
    expect(findOrphanedEscalatedQfs(rows, now)).toEqual({ count: 0, orphaned: [] });
  });

  it('respects a custom grace window', () => {
    const rows = [{ id: 'QF-x', created_at: '2026-08-31T11:58:00Z' }]; // 2min old
    expect(findOrphanedEscalatedQfs(rows, now, 60_000).count).toBe(1); // 1min grace -> trips
    expect(findOrphanedEscalatedQfs(rows, now, DEFAULT_GRACE_MS).count).toBe(0); // 30min grace -> does not
  });

  it('skips rows with a missing or unparseable created_at rather than flagging or throwing', () => {
    const rows = [{ id: 'QF-bad-1' }, { id: 'QF-bad-2', created_at: 'not-a-date' }];
    expect(findOrphanedEscalatedQfs(rows, now)).toEqual({ count: 0, orphaned: [] });
  });

  it('handles an empty/null row set', () => {
    expect(findOrphanedEscalatedQfs([], now)).toEqual({ count: 0, orphaned: [] });
    expect(findOrphanedEscalatedQfs(null, now)).toEqual({ count: 0, orphaned: [] });
  });

  it('reports every orphaned row, not just the first', () => {
    const rows = [
      { id: 'QF-a', created_at: '2026-08-31T10:00:00Z' },
      { id: 'QF-b', created_at: '2026-08-31T11:00:00Z' },
    ];
    expect(findOrphanedEscalatedQfs(rows, now).count).toBe(2);
  });
});
