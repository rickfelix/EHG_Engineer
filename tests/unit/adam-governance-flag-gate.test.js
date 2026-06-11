/**
 * QF-20260610-863 (W0-3): leo_feature_flags is AUTHORITATIVE for ADAM_* governance
 * flags (real kill-switch) + registry-vs-runtime drift detection.
 *
 * Before: consumers read env only — a registry is_enabled=false was dead metadata
 * (proven live: ADAM_GOVERNANCE_HEARTBEAT_V1 registry=false/draft, env=on, loop ran)
 * and classifyFlag returned HEALTHY for exactly that drift.
 *
 * Pins: the conjunctive gate's full truth table incl. the fail-safe asymmetry
 * (registry false reliably kills; DB blip degrades to env verdict, never crashes,
 * never flips ON something env had off), and the drift classifier both directions.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { classifyFlag, computeStaleFlags } from '../../lib/feature-flags/governance-review.js';

const require = createRequire(import.meta.url);
const { isFlagEnabled, resolveGovernanceFlagGate } = require('../../scripts/adam-opportunity-scan.cjs');

// Minimal chainable stub for the single registry read.
function sbStub({ row, error, throws } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (throws) throw new Error('db down');
            return { data: row ?? null, error: error ?? null };
          },
        }),
      }),
    }),
  };
}

describe('isFlagEnabled (pure env helper preserved — FR-5)', () => {
  it('on/1/true => true; off/undefined => false', () => {
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: 'on' })).toBe(true);
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: '1' })).toBe(true);
    expect(isFlagEnabled({ ADAM_GOVERNANCE_HEARTBEAT_V1: 'off' })).toBe(false);
    expect(isFlagEnabled({})).toBe(false);
  });
});

describe('resolveGovernanceFlagGate — conjunctive truth table (FR-1)', () => {
  it('env OFF short-circuits: gate off, registry NEVER read', async () => {
    const neverRead = { from: () => { throw new Error('must not be called'); } };
    const g = await resolveGovernanceFlagGate(neverRead, 'ADAM_GOVERNANCE_HEARTBEAT_V1', false);
    expect(g).toEqual({ enabled: false, source: 'env_off', degraded: false });
  });

  it('env ON + registry is_enabled=false => KILLED (the real kill-switch)', async () => {
    const g = await resolveGovernanceFlagGate(sbStub({ row: { is_enabled: false } }), 'F', true);
    expect(g.enabled).toBe(false);
    expect(g.source).toBe('registry_kill');
    expect(g.degraded).toBe(false);
  });

  it('env ON + registry is_enabled=true => enabled', async () => {
    const g = await resolveGovernanceFlagGate(sbStub({ row: { is_enabled: true } }), 'F', true);
    expect(g).toEqual({ enabled: true, source: 'env_and_registry_on', degraded: false });
  });
});

describe('resolveGovernanceFlagGate — fail-safe degradation (FR-2)', () => {
  it('DB throw degrades to the env verdict (on), flagged degraded, never throws', async () => {
    const g = await resolveGovernanceFlagGate(sbStub({ throws: true }), 'F', true);
    expect(g.enabled).toBe(true);
    expect(g.source).toBe('registry_degraded_env_verdict');
    expect(g.degraded).toBe(true);
  });

  it('PostgREST error object degrades the same way', async () => {
    const g = await resolveGovernanceFlagGate(sbStub({ error: { message: 'timeout' } }), 'F', true);
    expect(g.degraded).toBe(true);
    expect(g.enabled).toBe(true);
  });

  it('missing registry row degrades to env verdict (no row != kill)', async () => {
    const g = await resolveGovernanceFlagGate(sbStub({ row: null }), 'F', true);
    expect(g.enabled).toBe(true);
    expect(g.degraded).toBe(true);
  });

  it('a DB blip can never flip ON a flag env had OFF (env_off precedes any read)', async () => {
    const g = await resolveGovernanceFlagGate(sbStub({ throws: true }), 'F', false);
    expect(g.enabled).toBe(false);
    expect(g.source).toBe('env_off');
  });
});

describe('classifyFlag registry-vs-runtime drift (FR-3)', () => {
  const NOW = new Date('2026-06-10T00:00:00Z').getTime();
  const driftedRow = {
    flag_key: 'ADAM_GOVERNANCE_HEARTBEAT_V1',
    lifecycle_state: 'draft',
    is_enabled: false,
    last_reviewed_at: new Date(NOW - 86400000).toISOString(),
    rolled_out_at: new Date(NOW - 86400000).toISOString(),
    created_at: new Date(NOW - 86400000).toISOString(),
  };

  it('flags an ADAM_* row off/draft while env=on as RECONCILE (was HEALTHY — the live bug)', () => {
    const c = classifyFlag(driftedRow, NOW, { env: { ADAM_GOVERNANCE_HEARTBEAT_V1: 'on' } });
    expect(c).not.toBeNull();
    expect(c.reasons).toContain('registry-runtime-drift');
    expect(c.recommendation).toBe('reconcile');
  });

  it('no drift when env is off (registry off matches runtime off)', () => {
    const c = classifyFlag(driftedRow, NOW, { env: {} });
    // may still be stale for OTHER reasons, but never drift
    expect(c?.reasons ?? []).not.toContain('registry-runtime-drift');
  });

  it('no drift for a consistent enabled row (env=on, registry on)', () => {
    const c = classifyFlag(
      { ...driftedRow, lifecycle_state: 'enabled', is_enabled: true },
      NOW,
      { env: { ADAM_GOVERNANCE_HEARTBEAT_V1: 'on' } }
    );
    expect(c?.reasons ?? []).not.toContain('registry-runtime-drift');
  });

  it('non-ADAM_* flags are out of drift scope', () => {
    const c = classifyFlag(
      { ...driftedRow, flag_key: 'OTHER_FLAG' },
      NOW,
      { env: { OTHER_FLAG: 'on' } }
    );
    expect(c?.reasons ?? []).not.toContain('registry-runtime-drift');
  });

  it('computeStaleFlags threads opts.env through to the classifier', () => {
    const res = computeStaleFlags([driftedRow], NOW, { env: { ADAM_GOVERNANCE_HEARTBEAT_V1: 'on' } });
    expect(res.byRecommendation.reconcile).toBe(1);
  });

  it('no-env callers keep legacy behavior byte-identical (classifyFlag 2-arg)', () => {
    const c = classifyFlag(driftedRow, NOW);
    expect(c?.reasons ?? []).not.toContain('registry-runtime-drift');
  });
});
