/**
 * SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2) — tests for the pure
 * sourcing-engine awareness helpers used by the capacity forecaster's belt-low / DEFICIT output.
 */
import { describe, it, expect } from 'vitest';
import {
  SOURCING_ENGINE_FLAGS,
  isSourcingFlagOn,
  readSourcingEngineFlags,
  formatSourcingAwareness,
} from '../../scripts/lib/sourcing-engine-awareness.mjs';

describe('isSourcingFlagOn', () => {
  it('treats on/1/true (case-insensitive) as enabled', () => {
    for (const v of ['on', 'ON', '1', 'true', 'TRUE', 'True']) expect(isSourcingFlagOn(v)).toBe(true);
  });
  it('treats anything else (incl. undefined/null/off) as disabled', () => {
    for (const v of [undefined, null, '', 'off', '0', 'false', 'yes', 'enabled']) expect(isSourcingFlagOn(v)).toBe(false);
  });
});

describe('readSourcingEngineFlags', () => {
  it('reads the canonical flags from an env-like object', () => {
    const flags = readSourcingEngineFlags({ SOURCING_GAUGE_GAP_MINER_V1: 'on', SOURCING_DEFERRED_WATCHER_V1: 'off' });
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);
    expect(byLabel['deferred-watcher']).toBe(false);
    expect(flags.length).toBe(SOURCING_ENGINE_FLAGS.length);
  });
  it('defaults every flag to OFF when env is empty', () => {
    const flags = readSourcingEngineFlags({});
    expect(flags.every((f) => f.enabled === false)).toBe(true);
  });
});

describe('formatSourcingAwareness — belt-low remediation framing', () => {
  it('DORMANT engine + backlog → recommends ACTIVATE/distill, not manual backfill', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: false }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: 42,
    });
    expect(r.anyOn).toBe(false);
    expect(r.countStr).toBe('42');
    expect(r.recommendation).toMatch(/ACTIVATE/);
    expect(r.recommendation).toMatch(/anti-pattern/);
    expect(r.line).toMatch(/gauge-gap-miner=off, deferred-watcher=off/);
    expect(r.line).toMatch(/unpromoted roadmap_wave_items: 42/);
  });

  it('OFF engine + 0 backlog → manual sourcing is appropriate (no false activate nudge)', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: false }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: 0,
    });
    expect(r.recommendation).toMatch(/genuinely empty/);
    expect(r.recommendation).not.toMatch(/ACTIVATE/);
  });

  it('engine ON + backlog → let the engine promote/distill before a hand-ask', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: true }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: 10,
    });
    expect(r.anyOn).toBe(true);
    expect(r.allOn).toBe(false);
    expect(r.recommendation).toMatch(/let the engine promote\/distill/);
  });

  it('engine ON + 0 backlog → belt-low is real worker demand', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: true }, { label: 'deferred-watcher', enabled: true }],
      unpromotedCount: 0,
    });
    expect(r.allOn).toBe(true);
    expect(r.recommendation).toMatch(/real worker demand/);
  });

  it('unknown count (null) is reported as "unknown" and treated as possible-backlog', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: false }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: null,
    });
    expect(r.countStr).toBe('unknown');
    // unknown → safer assumption that backlog may exist → activate framing, not "genuinely empty"
    expect(r.recommendation).toMatch(/ACTIVATE/);
  });

  it('handles empty flags array without throwing', () => {
    const r = formatSourcingAwareness({ flags: [], unpromotedCount: 5 });
    expect(r.flagStr).toBe('none');
    expect(r.anyOn).toBe(false);
  });

  it('defaults gracefully with no arguments', () => {
    const r = formatSourcingAwareness();
    expect(r.countStr).toBe('unknown');
    expect(r.flagStr).toBe('none');
  });
});
