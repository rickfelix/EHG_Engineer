/**
 * Unit tests for the feature-flag governance staleness classifier.
 * SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-1 / FR-2).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyFlag,
  computeStaleFlags,
  formatDigest,
  DISABLED_AGING_DAYS,
  ENABLED_UNROLLED_DAYS
} from '../../lib/feature-flags/governance-review.js';

const NOW = new Date('2026-06-08T00:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

describe('classifyFlag', () => {
  it('returns null for a healthy reviewed flag', () => {
    expect(classifyFlag({
      flag_key: 'OK', lifecycle_state: 'enabled', is_enabled: true,
      last_reviewed_at: daysAgo(1), rolled_out_at: daysAgo(5), updated_at: daysAgo(5)
    }, NOW)).toBeNull();
  });

  it('flags never-reviewed', () => {
    const c = classifyFlag({ flag_key: 'NR', lifecycle_state: 'enabled', is_enabled: true, last_reviewed_at: null, rolled_out_at: daysAgo(1), updated_at: daysAgo(1) }, NOW);
    expect(c.reasons).toContain('never-reviewed');
    expect(c.recommendation).toBe('review');
  });

  it('flags past-expiry as extend', () => {
    const c = classifyFlag({ flag_key: 'EX', lifecycle_state: 'enabled', is_enabled: true, last_reviewed_at: daysAgo(1), expiry_at: daysAgo(2), rolled_out_at: daysAgo(3), updated_at: daysAgo(3) }, NOW);
    expect(c.reasons).toContain('past-expiry');
    expect(c.recommendation).toBe('extend');
  });

  it('flags disabled-aging as kill', () => {
    const c = classifyFlag({ flag_key: 'DA', lifecycle_state: 'disabled', is_enabled: false, last_reviewed_at: daysAgo(1), created_at: daysAgo(DISABLED_AGING_DAYS + 5) }, NOW);
    expect(c.reasons).toContain('disabled-aging');
    expect(c.recommendation).toBe('kill');
  });

  it('flags enabled-never-rolled-out as graduate', () => {
    const c = classifyFlag({ flag_key: 'EU', lifecycle_state: 'enabled', is_enabled: true, last_reviewed_at: daysAgo(1), rolled_out_at: null, created_at: daysAgo(ENABLED_UNROLLED_DAYS + 2) }, NOW);
    expect(c.reasons).toContain('enabled-never-rolled-out');
    expect(c.recommendation).toBe('graduate');
  });

  it('treats archived/expired terminal states as never stale', () => {
    expect(classifyFlag({ flag_key: 'AR', lifecycle_state: 'archived', is_enabled: false, last_reviewed_at: null }, NOW)).toBeNull();
    expect(classifyFlag({ flag_key: 'XP', lifecycle_state: 'expired', is_enabled: false, last_reviewed_at: null, expiry_at: daysAgo(10) }, NOW)).toBeNull();
  });

  it('does not flag a freshly enabled un-rolled flag (within grace window)', () => {
    expect(classifyFlag({ flag_key: 'NEW', lifecycle_state: 'enabled', is_enabled: true, last_reviewed_at: daysAgo(1), rolled_out_at: null, created_at: daysAgo(1) }, NOW)).toBeNull();
  });
});

describe('computeStaleFlags', () => {
  it('aggregates stale flags and counts by recommendation', () => {
    const flags = [
      { flag_key: 'OK', lifecycle_state: 'enabled', is_enabled: true, last_reviewed_at: daysAgo(1), rolled_out_at: daysAgo(5), updated_at: daysAgo(5) },
      { flag_key: 'NR', lifecycle_state: 'draft', is_enabled: false, last_reviewed_at: null, updated_at: daysAgo(1) },
      { flag_key: 'DA', lifecycle_state: 'disabled', is_enabled: false, last_reviewed_at: daysAgo(1), created_at: daysAgo(DISABLED_AGING_DAYS + 1) }
    ];
    const r = computeStaleFlags(flags, NOW);
    expect(r.total).toBe(3);
    expect(r.stale).toHaveLength(2);
    expect(r.byRecommendation.kill).toBe(1);
    expect(r.byRecommendation.review).toBe(1);
  });

  it('handles empty/undefined input', () => {
    expect(computeStaleFlags([], NOW).stale).toHaveLength(0);
    expect(computeStaleFlags(undefined, NOW).total).toBe(0);
  });
});

describe('formatDigest', () => {
  it('emits an explicit zero line when nothing is stale (never silent)', () => {
    const out = formatDigest(computeStaleFlags([{ flag_key: 'OK', lifecycle_state: 'enabled', is_enabled: true, last_reviewed_at: daysAgo(1), rolled_out_at: daysAgo(5), updated_at: daysAgo(5) }], NOW));
    expect(out).toMatch(/0 stale flags out of 1/);
  });

  it('lists each stale flag with its recommendation', () => {
    const out = formatDigest(computeStaleFlags([{ flag_key: 'DA', lifecycle_state: 'disabled', is_enabled: false, last_reviewed_at: daysAgo(1), updated_at: daysAgo(DISABLED_AGING_DAYS + 1) }], NOW));
    expect(out).toMatch(/DA/);
    expect(out).toMatch(/KILL/);
  });
});
