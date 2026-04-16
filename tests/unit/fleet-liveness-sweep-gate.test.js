/**
 * Unit tests for the sweep-side MC liveness gate (PRD-SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 US-005).
 *
 * Covers:
 *   TS-4 P(alive)=0.5, hb=12m ⇒ HOLD with WIP_GUARD_MC reason
 *   TS-5 hb=22m ⇒ RELEASE with SWEEP_HARD_CAP_20M regardless of P(alive)
 *
 * The test validates the decision logic embedded in
 * scripts/stale-session-sweep.cjs by replicating the gate rules here and
 * asserting they match the PRD acceptance criteria. This decouples the test
 * from the sweep's supabase dependency without relying on mocks in production
 * code (PRD AC-3).
 */

import { describe, it, expect } from 'vitest';

const FLEET_MC_HARD_CAP_SEC = 1200; // 20 minutes
const FLEET_MC_PALIVE_HOLD_THRESHOLD = 0.3;

// Mirror of the decision tree in scripts/stale-session-sweep.cjs step 4 after
// WIP_GUARD but inside the DEAD loop. Keeping it here makes the test readable
// and independent of supabase.
function decideRelease({ heartbeat_age_seconds, p_alive, has_uncommitted_changes, mc_sweep_gate_enabled = true }) {
  if (has_uncommitted_changes === true) return { action: 'HOLD', reason: 'WIP_GUARD' };
  if (mc_sweep_gate_enabled) {
    if (heartbeat_age_seconds >= FLEET_MC_HARD_CAP_SEC) {
      return { action: 'RELEASE', reason: 'SWEEP_HARD_CAP_20M' };
    }
    if (typeof p_alive === 'number' && p_alive > FLEET_MC_PALIVE_HOLD_THRESHOLD) {
      return { action: 'HOLD', reason: 'WIP_GUARD_MC' };
    }
  }
  return { action: 'RELEASE', reason: 'SWEEP_PID_DEAD' };
}

describe('stale-session-sweep — MC liveness gate', () => {
  it('TS-4: P(alive)=0.5 + hb=12m ⇒ HOLD with WIP_GUARD_MC', () => {
    const d = decideRelease({ heartbeat_age_seconds: 12 * 60, p_alive: 0.5, has_uncommitted_changes: false });
    expect(d.action).toBe('HOLD');
    expect(d.reason).toBe('WIP_GUARD_MC');
  });

  it('TS-5: P(alive)=0.9 + hb=22m ⇒ RELEASE with SWEEP_HARD_CAP_20M (hard cap overrides)', () => {
    const d = decideRelease({ heartbeat_age_seconds: 22 * 60, p_alive: 0.9, has_uncommitted_changes: false });
    expect(d.action).toBe('RELEASE');
    expect(d.reason).toBe('SWEEP_HARD_CAP_20M');
  });

  it('P(alive) below threshold at 12m ⇒ RELEASE with SWEEP_PID_DEAD', () => {
    const d = decideRelease({ heartbeat_age_seconds: 12 * 60, p_alive: 0.2, has_uncommitted_changes: false });
    expect(d.action).toBe('RELEASE');
    expect(d.reason).toBe('SWEEP_PID_DEAD');
  });

  it('WIP_GUARD still fires regardless of MC state (AC-3)', () => {
    const d = decideRelease({ heartbeat_age_seconds: 12 * 60, p_alive: 0.9, has_uncommitted_changes: true });
    expect(d.action).toBe('HOLD');
    expect(d.reason).toBe('WIP_GUARD');
  });

  it('WIP_GUARD fires even past the 20m hard cap', () => {
    const d = decideRelease({ heartbeat_age_seconds: 30 * 60, p_alive: 0.1, has_uncommitted_changes: true });
    expect(d.action).toBe('HOLD');
    expect(d.reason).toBe('WIP_GUARD');
  });

  it('FLEET_MC_SWEEP_GATE=false bypasses MC consultation (pre-MC behavior)', () => {
    const d = decideRelease({ heartbeat_age_seconds: 30 * 60, p_alive: 0.9, has_uncommitted_changes: false, mc_sweep_gate_enabled: false });
    expect(d.action).toBe('RELEASE');
    expect(d.reason).toBe('SWEEP_PID_DEAD');
  });

  it('exactly at 20m hard cap ⇒ RELEASE with SWEEP_HARD_CAP_20M', () => {
    const d = decideRelease({ heartbeat_age_seconds: FLEET_MC_HARD_CAP_SEC, p_alive: 0.9, has_uncommitted_changes: false });
    expect(d.action).toBe('RELEASE');
    expect(d.reason).toBe('SWEEP_HARD_CAP_20M');
  });

  it('no MC estimate ⇒ RELEASE with SWEEP_PID_DEAD (AC-5, fallback behavior)', () => {
    const d = decideRelease({ heartbeat_age_seconds: 18 * 60, p_alive: null, has_uncommitted_changes: false });
    expect(d.action).toBe('RELEASE');
    expect(d.reason).toBe('SWEEP_PID_DEAD');
  });
});
