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

describe('computeSessionBadge (design vocab — SD-...-SHELL-001-D / mockup-1 FR-3)', () => {
  const RETIRED = ['SILENT', 'STRUGGLING', 'STALLED', 'HEALTHY', 'UNKNOWN'];

  it('returns WORKING for a live working session (default)', () => {
    expect(computeSessionBadge({ loopState: 'looping', pAlive: 0.95 })).toBe('WORKING');
  });

  it('returns AWAITING INPUT when alive but silent (waiting on input)', () => {
    expect(computeSessionBadge({ isSilent: true, pAlive: 0.9, loopState: 'looping' })).toBe('AWAITING INPUT');
  });

  it('returns DEEP WORK for the heaviest model/effort tier (opus + high/xhigh)', () => {
    expect(computeSessionBadge({ loopState: 'looping', model: 'opus', effort: 'xhigh' })).toBe('DEEP WORK');
    expect(computeSessionBadge({ loopState: 'looping', model: 'opus', effort: 'high' })).toBe('DEEP WORK');
  });

  it("returns IDLE when loop_state is 'idle'", () => {
    expect(computeSessionBadge({ loopState: 'idle', pAlive: 0.9 })).toBe('IDLE');
  });

  it('returns MECHANICAL for the cheap/mechanical proxy (model=haiku OR effort=low)', () => {
    expect(computeSessionBadge({ loopState: 'looping', model: 'haiku' })).toBe('MECHANICAL');
    expect(computeSessionBadge({ loopState: 'looping', effort: 'low' })).toBe('MECHANICAL');
  });

  it('returns OFF for released/stopped/offline status', () => {
    expect(computeSessionBadge({ computedStatus: 'released' })).toBe('OFF');
    expect(computeSessionBadge({ computedStatus: 'stopped' })).toBe('OFF');
    expect(computeSessionBadge({ computedStatus: 'offline' })).toBe('OFF');
  });

  it('returns OFF when P(alive) is decisively low (< 0.2)', () => {
    expect(computeSessionBadge({ pAlive: 0.1, loopState: 'looping' })).toBe('OFF');
  });

  it('returns OFF when there is no signal at all (safe default that replaces old UNKNOWN)', () => {
    expect(computeSessionBadge({})).toBe('OFF');
    expect(computeSessionBadge()).toBe('OFF');
    expect(computeSessionBadge({ loopState: null, pAlive: null })).toBe('OFF');
  });

  it("emits PILOT WK1 ONLY for an explicit role:'pilot' (design placeholder — no real signal source)", () => {
    expect(computeSessionBadge({ role: 'pilot' })).toBe('PILOT WK1');
    // Any non-pilot role (or absent role) never yields PILOT WK1.
    expect(computeSessionBadge({ role: 'worker', loopState: 'looping' })).not.toBe('PILOT WK1');
    expect(computeSessionBadge({ loopState: 'looping' })).not.toBe('PILOT WK1');
  });

  it('OFF takes priority over every other signal', () => {
    expect(
      computeSessionBadge({ computedStatus: 'stopped', isSilent: true, model: 'opus', effort: 'xhigh', role: 'pilot' })
    ).toBe('OFF');
  });

  it('NEGATIVE: never returns any of the 5 retired vocab words for any input', () => {
    const inputs = [
      {}, undefined,
      { isSilent: true }, { failCount: 4 }, { pAlive: 0.1 }, { pAlive: 0.95 },
      { loopState: 'looping' }, { loopState: 'unknown' }, { loopState: 'idle' },
      { model: 'opus', effort: 'high' }, { model: 'haiku' }, { effort: 'low' },
      { role: 'pilot' }, { computedStatus: 'released' }, { computedStatus: 'active' },
    ];
    for (const input of inputs) {
      expect(RETIRED).not.toContain(computeSessionBadge(input));
    }
  });
});
