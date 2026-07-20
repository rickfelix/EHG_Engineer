/**
 * SD-LEO-INFRA-FLEET-VIEW-BADGES-001 (FR-1/FR-2): pure chip/badge formatters.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { formatCapacityChip, computeSessionBadge } = require('../../../lib/fleet/fleet-view-badges.cjs');

describe('formatCapacityChip', () => {
  it('renders the binding-weekly headroom for the active account', () => {
    const identity = { accountUuid8: 'abc12345' };
    const store = { abc12345: { weeklyAllModelsPct: 38, weeklyFablePct: 20 } };
    expect(formatCapacityChip(identity, store)).toBe('cap=62%');
  });

  it('degrades to a placeholder when no identity is available', () => {
    expect(formatCapacityChip(null, {})).toBe('cap=--');
  });

  it('degrades to a placeholder when the active account has no recorded reading', () => {
    const identity = { accountUuid8: 'unrecorded1' };
    expect(formatCapacityChip(identity, { other: { weeklyAllModelsPct: 50 } })).toBe('cap=--');
  });
});

describe('computeSessionBadge', () => {
  it('returns SILENT when the session is in a silent-until window', () => {
    expect(computeSessionBadge({ isSilent: true, pAlive: 0.9 })).toBe('SILENT');
  });

  it('returns STRUGGLING when handoff failures exceed the threshold', () => {
    expect(computeSessionBadge({ failCount: 4, pAlive: 0.9 })).toBe('STRUGGLING');
  });

  it('returns STALLED when P(alive) is low', () => {
    expect(computeSessionBadge({ pAlive: 0.1 })).toBe('STALLED');
  });

  it('returns HEALTHY when P(alive) is high', () => {
    expect(computeSessionBadge({ pAlive: 0.95 })).toBe('HEALTHY');
  });

  it('falls back to loop_state when P(alive) is unavailable (MC disabled)', () => {
    expect(computeSessionBadge({ loopState: 'looping' })).toBe('HEALTHY');
    expect(computeSessionBadge({ loopState: 'unknown' })).toBe('UNKNOWN');
    expect(computeSessionBadge({ loopState: null })).toBe('UNKNOWN');
  });

  it('SILENT takes priority over STRUGGLING and STALLED', () => {
    expect(computeSessionBadge({ isSilent: true, failCount: 10, pAlive: 0.01 })).toBe('SILENT');
  });
});
