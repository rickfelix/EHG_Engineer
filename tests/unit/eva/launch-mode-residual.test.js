/**
 * SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 — the D4 residual left by -001:
 * chairman-only flip authorization + audit-first trail, sim-FAIL enforcement,
 * S23 live-evidence branch, and the Stripe venture-mode guard.
 * Maps to PRD test scenarios TS-1..TS-7.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  setLaunchMode,
  isAllowlistedModeFlipper,
  SIMULATED,
  LIVE,
} from '../../../lib/eva/launch-mode.js';
import {
  evaluateSimArtifacts,
  evaluateModeEvidence,
  LAUNCH_EVIDENCE_TYPES,
} from '../../../lib/eva/mode-evidence.js';
import { assertVentureLiveAllowed } from '../../../lib/payments/stripe-client.js';

const V_ID = 'venture-1111';
const CHAIRMAN_DECISION = { id: 'dec-1', decided_by: 'chairman_ui' };

/**
 * Fake supabase for setLaunchMode: getLaunchMode read + audit insert + flip
 * update + compensating delete, each independently rig-able.
 */
function flipFakeSb({ currentMode = SIMULATED, auditError = null, flipError = null, log = { audits: [], flips: [], deletes: [] } } = {}) {
  return {
    _log: log,
    from(table) {
      if (table === 'ventures') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { launch_mode: currentMode }, error: null }) }) }),
          update: (patch) => ({ eq: () => { log.flips.push(patch); return Promise.resolve({ error: flipError }); } }),
        };
      }
      if (table === 'launch_mode_audit') {
        return {
          insert: (row) => ({ select: () => ({ single: () => { log.audits.push(row); return Promise.resolve(auditError ? { data: null, error: auditError } : { data: { id: 'audit-1' }, error: null }); } }) }),
          delete: () => ({ eq: (col, val) => { log.deletes.push(val); return Promise.resolve({ error: null }); } }),
        };
      }
      throw new Error('unexpected table ' + table);
    },
  };
}

describe('TS-1: allowlisted chairman decision flips mode with exactly one audit row', () => {
  it('flips simulated -> live, audit row carries who/from/to', async () => {
    const sb = flipFakeSb({});
    const res = await setLaunchMode({ supabase: sb, ventureId: V_ID, toMode: LIVE, decision: CHAIRMAN_DECISION });
    expect(res.flipped).toBe(true);
    expect(res.fromMode).toBe(SIMULATED);
    expect(sb._log.audits).toHaveLength(1);
    expect(sb._log.audits[0]).toMatchObject({ venture_id: V_ID, from_mode: SIMULATED, to_mode: LIVE, decided_by: 'chairman_ui', decision_id: 'dec-1' });
    expect(sb._log.flips).toEqual([{ launch_mode: LIVE }]);
  });

  it('no-ops when already in the target mode (no audit, no flip)', async () => {
    const sb = flipFakeSb({ currentMode: LIVE });
    const res = await setLaunchMode({ supabase: sb, ventureId: V_ID, toMode: LIVE, decision: CHAIRMAN_DECISION });
    expect(res.flipped).toBe(false);
    expect(res.reason).toBe('already_in_mode');
    expect(sb._log.audits).toHaveLength(0);
  });
});

describe('TS-2: non-allowlisted flips are refused', () => {
  it('agents and unknown actors cannot flip; chairman variants can', () => {
    expect(isAllowlistedModeFlipper('chairman_ui')).toBe(true);
    expect(isAllowlistedModeFlipper('Chairman Dashboard')).toBe(true);
    expect(isAllowlistedModeFlipper('monitoring_agent')).toBe(false); // stricter than the S16 allowlist, by design
    expect(isAllowlistedModeFlipper('testing_agent')).toBe(false);
    expect(isAllowlistedModeFlipper('eva')).toBe(false);
    expect(isAllowlistedModeFlipper(null)).toBe(false);
  });

  it('setLaunchMode refuses a non-allowlisted decision with no writes at all', async () => {
    const sb = flipFakeSb({});
    const res = await setLaunchMode({ supabase: sb, ventureId: V_ID, toMode: LIVE, decision: { id: 'dec-2', decided_by: 'testing_agent' } });
    expect(res.flipped).toBe(false);
    expect(res.reason).toBe('decided_by_not_allowlisted');
    expect(sb._log.audits).toHaveLength(0);
    expect(sb._log.flips).toHaveLength(0);
  });
});

describe('TS-3: fail-closed audit semantics', () => {
  it('audit-write failure means NO flip is attempted (audit-first)', async () => {
    const sb = flipFakeSb({ auditError: { message: 'relation launch_mode_audit does not exist' } });
    const res = await setLaunchMode({ supabase: sb, ventureId: V_ID, toMode: LIVE, decision: CHAIRMAN_DECISION });
    expect(res.flipped).toBe(false);
    expect(res.reason).toMatch(/audit_write_failed/);
    expect(sb._log.flips).toHaveLength(0); // the coherent degraded state while DDL is unapplied
  });

  it('flip failure after audit compensates the audit row and errors', async () => {
    const sb = flipFakeSb({ flipError: { message: 'column launch_mode does not exist' } });
    const res = await setLaunchMode({ supabase: sb, ventureId: V_ID, toMode: LIVE, decision: CHAIRMAN_DECISION });
    expect(res.flipped).toBe(false);
    expect(res.reason).toMatch(/flip_write_failed/);
    expect(sb._log.deletes).toEqual(['audit-1']); // audit never records a flip that did not happen
  });
});

describe('TS-4: sim work cannot masquerade as real (shared helper)', () => {
  it('unlabeled launch evidence fails the sim check; labeled passes', () => {
    expect(evaluateSimArtifacts([{ artifact_type: 'launch_metrics', payload: {} }]).pass).toBe(false);
    expect(evaluateSimArtifacts([{ artifact_type: 'launch_metrics', payload: { labeled_simulation: true } }]).pass).toBe(true);
    expect(evaluateSimArtifacts([{ artifact_type: 'unrelated', payload: {} }]).pass).toBe(true); // only launch evidence is subject
    expect(LAUNCH_EVIDENCE_TYPES).toContain('launch_metrics');
  });

  it('evaluateModeEvidence in simulated mode reports the unlabeled offenders', () => {
    const r = evaluateModeEvidence({ mode: SIMULATED, artifacts: [{ artifact_type: 'launch_metrics', payload: {} }] });
    expect(r.pass).toBe(false);
    expect(r.unlabeled).toEqual(['launch_metrics']);
  });
});

describe('TS-5: live mode demands external observations (fail-closed)', () => {
  it('null/absent observations fail closed; verified observations pass', () => {
    expect(evaluateModeEvidence({ mode: LIVE, observations: null }).pass).toBe(false);
    expect(evaluateModeEvidence({ mode: LIVE, observations: { endpointStatus: 200, billingProductId: 'prod_1', telemetryRowCount: 3 } }).pass).toBe(true);
    expect(evaluateModeEvidence({ mode: LIVE, observations: { endpointStatus: 200, billingProductId: 'prod_1', telemetryRowCount: 0 } }).pass).toBe(false);
  });
});

describe('TS-6: Stripe live rail refuses simulated ventures', () => {
  const liveEnv = { STRIPE_RAIL_LIVE_MODE: 'true' };
  const sbWithMode = (mode) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { launch_mode: mode }, error: null }) }) }) }),
  });

  it('refuses when the venture is simulated even with the env flag on', async () => {
    await expect(assertVentureLiveAllowed({ supabase: sbWithMode(SIMULATED), ventureId: V_ID, env: liveEnv }))
      .rejects.toThrow(/launch_mode='simulated'/);
  });

  it('refuses when venture context is missing under the live flag (fail-closed)', async () => {
    await expect(assertVentureLiveAllowed({ env: liveEnv })).rejects.toThrow(/venture context required/);
  });

  it('allows a live venture under the live flag, and any venture on the test rail', async () => {
    await expect(assertVentureLiveAllowed({ supabase: sbWithMode(LIVE), ventureId: V_ID, env: liveEnv })).resolves.toBe(true);
    await expect(assertVentureLiveAllowed({ env: { STRIPE_RAIL_LIVE_MODE: 'false' } })).resolves.toBe(true);
  });
});

describe('TS-7: graceful degradation while the gated DDL is unapplied', () => {
  it('a mode-read error (missing column) degrades to simulated, so live paths stay closed', async () => {
    const erroringSb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'column ventures.launch_mode does not exist' } }) }) }) }) };
    const { getLaunchMode } = await import('../../../lib/eva/launch-mode.js');
    expect(await getLaunchMode(erroringSb, V_ID)).toBe(SIMULATED);
  });
});
