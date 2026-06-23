/**
 * SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2) — tests for the pure
 * sourcing-engine awareness helpers used by the capacity forecaster's belt-low / DEFICIT output.
 */
import { describe, it, expect } from 'vitest';
import {
  SOURCING_ENGINE_FLAGS,
  isSourcingFlagOn,
  readSourcingEngineFlags,
  readSourcingEngineFlagsFromDb,
  reconcileSourcingArmState,
  formatSourcingAwareness,
} from '../../scripts/lib/sourcing-engine-awareness.mjs';

// Minimal supabase mock: from().select() -> {data,error}; from().upsert().select() -> {data,error}.
function fakeSb({ rows = [], selectError = null, upsertError = null } = {}) {
  return {
    from() {
      return {
        select: () => Promise.resolve({ data: selectError ? null : rows, error: selectError }),
        upsert: () => ({ select: () => Promise.resolve({ data: upsertError ? null : rows, error: upsertError }) }),
      };
    },
  };
}

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

// SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001
describe('SOURCING_ENGINE_FLAGS — FR-2 registers all three arms', () => {
  it('includes gauge-gap-miner, deferred-watcher, AND auto-refill', () => {
    const labels = SOURCING_ENGINE_FLAGS.map((f) => f.label);
    expect(labels).toContain('gauge-gap-miner');
    expect(labels).toContain('deferred-watcher');
    expect(labels).toContain('auto-refill');
    const autoRefill = SOURCING_ENGINE_FLAGS.find((f) => f.label === 'auto-refill');
    expect(autoRefill.env).toBe('SOURCING_AUTO_REFILL_V1');
  });
});

describe('readSourcingEngineFlagsFromDb — FR-1/FR-5 (DB source of truth, independent of process.env)', () => {
  it('derives ON for an arm whose activation-state row is enabled, OFF when disabled — IGNORING process.env', async () => {
    // process.env says everything OFF; the DB says gauge-gap-miner ON, deferred-watcher OFF.
    const env = { SOURCING_GAUGE_GAP_MINER_V1: 'off', SOURCING_DEFERRED_WATCHER_V1: 'off', SOURCING_AUTO_REFILL_V1: 'off' };
    const sb = fakeSb({ rows: [
      { arm: 'gauge-gap-miner', enabled: true },
      { arm: 'deferred-watcher', enabled: false },
      { arm: 'auto-refill', enabled: true },
    ] });
    const flags = await readSourcingEngineFlagsFromDb(sb, env);
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);   // DB-on despite env-off
    expect(byLabel['deferred-watcher']).toBe(false); // DB-off
    expect(byLabel['auto-refill']).toBe(true);
    expect(flags.length).toBe(SOURCING_ENGINE_FLAGS.length);
  });

  it('an arm with NO row reads OFF', async () => {
    const sb = fakeSb({ rows: [{ arm: 'gauge-gap-miner', enabled: true }] });
    const flags = await readSourcingEngineFlagsFromDb(sb, {});
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);
    expect(byLabel['deferred-watcher']).toBe(false);
    expect(byLabel['auto-refill']).toBe(false);
  });

  it('FAIL-OPEN: on a query error (e.g. table absent pre-migration) falls back to the env reader', async () => {
    const env = { SOURCING_GAUGE_GAP_MINER_V1: 'on', SOURCING_DEFERRED_WATCHER_V1: 'off', SOURCING_AUTO_REFILL_V1: 'off' };
    const sb = fakeSb({ selectError: { message: 'relation "sourcing_engine_activation_state" does not exist' } });
    const flags = await readSourcingEngineFlagsFromDb(sb, env);
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);  // from env fallback
    expect(byLabel['deferred-watcher']).toBe(false);
  });
});

describe('reconcileSourcingArmState — FR-3 idempotent upsert', () => {
  it('upserts the given arm→enabled map and returns the count', async () => {
    const sb = fakeSb({ rows: [{ arm: 'gauge-gap-miner' }, { arm: 'auto-refill' }] });
    const n = await reconcileSourcingArmState(sb, { 'gauge-gap-miner': true, 'auto-refill': true });
    expect(n).toBe(2);
  });
  it('returns 0 for an empty map (no write)', async () => {
    const sb = fakeSb({ rows: [] });
    expect(await reconcileSourcingArmState(sb, {})).toBe(0);
  });
  it('fail-soft: returns 0 on an upsert error (does not throw)', async () => {
    const sb = fakeSb({ upsertError: { message: 'boom' } });
    expect(await reconcileSourcingArmState(sb, { 'auto-refill': true })).toBe(0);
  });
});
