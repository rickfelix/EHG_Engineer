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

  // SD-LEO-INFRA-SILENT-HOLDER-AUDIT-001: the IDLE branch is deleted — it compared loopState
  // against 'idle', a value the writer enum (loop-state-tracker.cjs:19-29:
  // active|awaiting_tick|exited|unknown) never produces, so this test ratified dead code. A
  // genuinely idle seat is identified by its claim surfaces, not loop_state.
  it("an unrecognized loop_state value falls through to WORKING (no dead 'idle' branch)", () => {
    expect(computeSessionBadge({ loopState: 'idle', pAlive: 0.9 })).toBe('WORKING');
  });

  it('UNKNOWN on a tool-silent mid-loop seat, regardless of model/effort (measured false DEEP WORK)', () => {
    expect(computeSessionBadge({ loopState: 'active', pAlive: 0.9, model: 'opus', effort: 'high', toolSilentMinutes: 60 })).toBe('UNKNOWN');
    expect(computeSessionBadge({ loopState: 'awaiting_tick', pAlive: 0.9, model: 'opus', effort: 'xhigh', toolSilentMinutes: 15 })).toBe('UNKNOWN');
    expect(computeSessionBadge({ loopState: 'active', pAlive: 0.9, model: 'opus', effort: 'high', toolSilentMinutes: 3 })).toBe('DEEP WORK');
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

// SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 (GAP-1, found by the TESTING review): these badge
// branches compared metadata.model by EXACT equality against a bare family. That held only
// while the check-in writer coarsened every model before storing it. Once the exact API id
// is persisted, 'claude-opus-5[1m]' !== 'opus' and DEEP WORK silently never fires again —
// and every existing case in this file seeds a bare family, so the suite stayed green while
// the live dashboard degraded. Same latent-blindspot shape as the door gate.
describe('badge model matching is version-tolerant (SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001)', () => {
  const live = { loop_state: 'working', p_alive: 0.99, computed_status: 'active' };
  it('DEEP WORK fires on a VERSIONED opus id, not just the bare family', () => {
    expect(computeSessionBadge({ ...live, model: 'claude-opus-5[1m]', effort: 'high' })).toBe('DEEP WORK');
    expect(computeSessionBadge({ ...live, model: 'opus', effort: 'high' })).toBe('DEEP WORK');
  });

  it('MECHANICAL fires on a VERSIONED haiku id', () => {
    expect(computeSessionBadge({ ...live, model: 'claude-haiku-4-5-20251001', effort: 'high' })).toBe('MECHANICAL');
  });

  it('an UNRECOGNIZED model matches neither branch rather than being coerced', () => {
    const badge = computeSessionBadge({ ...live, model: 'gpt-5.2', effort: 'high' });
    expect(badge).not.toBe('DEEP WORK');
    expect(badge).not.toBe('MECHANICAL');
  });
});
