/**
 * QF-20260703-793: pure-function tests for handoff-rejection-rates.mjs.
 */
import { describe, it, expect } from 'vitest';
import {
  bucketRejectionReason,
  computeTransitionStats,
  computeTopRejectionReasons,
  computeSdTypeStats,
} from '../../../scripts/analytics/handoff-rejection-rates.mjs';

describe('bucketRejectionReason', () => {
  it('extracts a leading GATE_NAME-style token', () => {
    expect(bucketRejectionReason('RETROSPECTIVE_QUALITY_GATE validation failed - no retro')).toBe('RETROSPECTIVE_QUALITY_GATE');
    expect(bucketRejectionReason('GATE_CLAIM_VALIDITY validation failed: NO_CLAIM')).toBe('GATE_CLAIM_VALIDITY');
  });

  it('falls back to a truncated (40-char) snippet when there is no leading gate token', () => {
    const reason = 'Strategic Directive does not meet completeness bar for this phase';
    expect(bucketRejectionReason(reason)).toBe(reason.slice(0, 40));
  });

  it('handles null/empty reasons', () => {
    expect(bucketRejectionReason(null)).toBe('(no reason recorded)');
    expect(bucketRejectionReason('')).toBe('(no reason recorded)');
  });
});

describe('computeTransitionStats', () => {
  const rows = [
    { handoff_type: 'LEAD-TO-PLAN', status: 'accepted', created_at: '2026-01-01T00:00:00' },
    { handoff_type: 'LEAD-TO-PLAN', status: 'rejected', created_at: '2026-06-01T00:00:00' },
    { handoff_type: 'LEAD-FINAL-APPROVAL', status: 'accepted', created_at: '2026-06-01T00:00:00' },
  ];

  it('groups by handoff_type (not from_phase->to_phase)', () => {
    const stats = computeTransitionStats(rows);
    expect(stats['LEAD-TO-PLAN']).toEqual({ total: 2, rejected: 1 });
    expect(stats['LEAD-FINAL-APPROVAL']).toEqual({ total: 1, rejected: 0 });
  });

  it('respects a sinceMs cutoff for a trailing window', () => {
    const stats = computeTransitionStats(rows, { sinceMs: Date.parse('2026-03-01T00:00:00Z') });
    expect(stats['LEAD-TO-PLAN']).toEqual({ total: 1, rejected: 1 });
  });
});

describe('computeTopRejectionReasons', () => {
  it('ranks reasons by count, only counting rejected rows', () => {
    const rows = [
      { status: 'rejected', rejection_reason: 'GATE_X validation failed' },
      { status: 'rejected', rejection_reason: 'GATE_X validation failed' },
      { status: 'accepted', rejection_reason: 'GATE_X validation failed' },
      { status: 'rejected', rejection_reason: 'GATE_Y validation failed' },
    ];
    const top = computeTopRejectionReasons(rows, 2);
    expect(top[0]).toEqual(['GATE_X', 2]);
    expect(top[1]).toEqual(['GATE_Y', 1]);
  });
});

describe('computeSdTypeStats', () => {
  it('resolves sd_id via the provided map and falls back to unknown', () => {
    const rows = [
      { sd_id: 'a', status: 'rejected' },
      { sd_id: 'a', status: 'accepted' },
      { sd_id: 'missing', status: 'rejected' },
    ];
    const map = new Map([['a', 'infrastructure']]);
    const stats = computeSdTypeStats(rows, map);
    expect(stats.infrastructure).toEqual({ total: 2, rejected: 1 });
    expect(stats.unknown).toEqual({ total: 1, rejected: 1 });
  });
});
