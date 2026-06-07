/**
 * Unit tests (no DB) for the Pending-Enablement Registry pure logic.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001A.
 */
import { describe, it, expect } from 'vitest';
import {
  PENDING_AGE_DAYS,
  isPendingRegistryFlag,
  pendingAgeDays,
  isAgedPending,
  selectAgedPending,
  renderAgedPendingText,
  renderAgedPendingHtml,
} from '../lib/pending-enablement-registry.js';

const NOW = Date.parse('2026-06-07T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const agedPending = {
  flag_key: 'OLD_FLAG', is_enabled: false, lifecycle_state: 'disabled',
  rolled_out_at: daysAgo(30), gates_what: 'guards X', enablement_criteria: 'when Y', target: 'EHG_Engineer',
};
const freshPending = { ...agedPending, flag_key: 'NEW_FLAG', rolled_out_at: daysAgo(2) };
const enabledFlag = { ...agedPending, flag_key: 'ON_FLAG', is_enabled: true, lifecycle_state: 'enabled' };
const retiredFlag = { ...agedPending, flag_key: 'GONE_FLAG', lifecycle_state: 'archived' };
const noRollout = { ...agedPending, flag_key: 'NO_DATE', rolled_out_at: null };

describe('isPendingRegistryFlag', () => {
  it('true for a registered default-OFF (disabled) flag with a rollout date', () => {
    expect(isPendingRegistryFlag(agedPending)).toBe(true);
  });
  it('true for a draft default-OFF flag', () => {
    expect(isPendingRegistryFlag({ ...agedPending, lifecycle_state: 'draft' })).toBe(true);
  });
  it('false when enabled', () => expect(isPendingRegistryFlag(enabledFlag)).toBe(false));
  it('false when retired (archived/expired)', () => {
    expect(isPendingRegistryFlag(retiredFlag)).toBe(false);
    expect(isPendingRegistryFlag({ ...agedPending, lifecycle_state: 'expired' })).toBe(false);
  });
  it('false when never rolled out (not yet a registry item)', () => expect(isPendingRegistryFlag(noRollout)).toBe(false));
  it('false for null/garbage', () => {
    expect(isPendingRegistryFlag(null)).toBe(false);
    expect(isPendingRegistryFlag('x')).toBe(false);
  });
});

describe('pendingAgeDays + staleness anchor', () => {
  it('counts whole days since rollout', () => expect(pendingAgeDays(agedPending, NOW)).toBe(30));
  it('uses last_reviewed_at over rolled_out_at when present', () => {
    const reviewed = { ...agedPending, last_reviewed_at: daysAgo(3) };
    expect(pendingAgeDays(reviewed, NOW)).toBe(3);
  });
  it('null when no anchor', () => expect(pendingAgeDays(noRollout, NOW)).toBe(null));
});

describe('isAgedPending threshold', () => {
  it(`aged when older than ${PENDING_AGE_DAYS}d`, () => expect(isAgedPending(agedPending, { now: NOW })).toBe(true));
  it('not aged when within the window', () => expect(isAgedPending(freshPending, { now: NOW })).toBe(false));
  it('exactly at the threshold is not yet aged (strictly greater)', () => {
    const exactly7 = { ...agedPending, rolled_out_at: daysAgo(7) };
    expect(isAgedPending(exactly7, { now: NOW })).toBe(false);
  });
  it('recently reviewed pending item resets the clock', () => {
    const reviewed = { ...agedPending, last_reviewed_at: daysAgo(1) };
    expect(isAgedPending(reviewed, { now: NOW })).toBe(false);
  });
  it('enabled / retired never aged-pending', () => {
    expect(isAgedPending(enabledFlag, { now: NOW })).toBe(false);
    expect(isAgedPending(retiredFlag, { now: NOW })).toBe(false);
  });
});

describe('selectAgedPending', () => {
  it('keeps only aged-pending, oldest first', () => {
    const older = { ...agedPending, flag_key: 'OLDER', rolled_out_at: daysAgo(40) };
    const out = selectAgedPending([freshPending, agedPending, enabledFlag, retiredFlag, older], { now: NOW });
    expect(out.map((f) => f.flag_key)).toEqual(['OLDER', 'OLD_FLAG']);
  });
  it('handles non-array input', () => expect(selectAgedPending(null)).toEqual([]));
});

describe('renderers', () => {
  it('empty string when nothing aged', () => {
    expect(renderAgedPendingText([], { now: NOW })).toBe('');
    expect(renderAgedPendingHtml([], { now: NOW })).toBe('');
  });
  it('text includes flag_key, age, gates, and the decision affordance', () => {
    const out = renderAgedPendingText([agedPending], { now: NOW });
    expect(out).toContain('OLD_FLAG');
    expect(out).toContain('pending 30d');
    expect(out).toContain('guards X');
    expect(out).toContain('enable / defer / retire');
  });
  it('html escapes injected content', () => {
    const evil = { ...agedPending, flag_key: 'X', gates_what: '<script>alert(1)</script>' };
    const out = renderAgedPendingHtml([evil], { now: NOW });
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });
});
