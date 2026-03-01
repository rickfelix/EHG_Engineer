/**
 * Tests for Compute Posture Configuration (V07: unlimited_compute_posture)
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-069
 */

import { describe, it, expect } from 'vitest';
import {
  getComputePosture,
  evaluateCost,
  POSTURE_MODES,
  DEFAULT_COST_THRESHOLDS,
} from '../../../lib/governance/compute-posture.js';

describe('Compute Posture - getComputePosture()', () => {
  it('returns enforcement by default (V07: compute cost governance)', () => {
    const posture = getComputePosture();
    expect(posture.policy).toBe('enforcement');
    expect(posture.blockOnExceed).toBe(true);
  });

  it('returns awareness mode when explicitly overridden', () => {
    const posture = getComputePosture({ policy: POSTURE_MODES.AWARENESS });
    expect(posture.policy).toBe('awareness-not-enforcement');
    expect(posture.blockOnExceed).toBe(false);
  });

  it('returns enforcement mode when overridden', () => {
    const posture = getComputePosture({ policy: POSTURE_MODES.ENFORCEMENT });
    expect(posture.policy).toBe('enforcement');
    expect(posture.blockOnExceed).toBe(true);
  });

  it('includes default cost thresholds', () => {
    const posture = getComputePosture();
    expect(posture.costThresholds.LEAD).toEqual({ warn: 50, escalate: 200 });
    expect(posture.costThresholds.EXEC).toEqual({ warn: 200, escalate: 800 });
    expect(posture.costThresholds.DEFAULT).toEqual({ warn: 100, escalate: 500 });
  });

  it('merges custom thresholds with defaults', () => {
    const posture = getComputePosture({
      costThresholds: { LEAD: { warn: 100, escalate: 400 } },
    });
    expect(posture.costThresholds.LEAD).toEqual({ warn: 100, escalate: 400 });
    expect(posture.costThresholds.EXEC).toEqual({ warn: 200, escalate: 800 });
  });
});

describe('Compute Posture - evaluateCost()', () => {
  it('returns normal level for low costs', () => {
    const result = evaluateCost(10, 'LEAD');
    expect(result.level).toBe('normal');
    expect(result.blocked).toBe(false);
  });

  it('returns warn level at warn threshold', () => {
    const result = evaluateCost(50, 'LEAD');
    expect(result.level).toBe('warn');
    expect(result.blocked).toBe(false);
  });

  it('returns escalate level and blocks at escalate threshold (enforcement default)', () => {
    const result = evaluateCost(200, 'LEAD');
    expect(result.level).toBe('escalate');
    expect(result.blocked).toBe(true); // V07: enforcement is default
  });

  it('does not block under awareness policy', () => {
    const posture = getComputePosture({ policy: POSTURE_MODES.AWARENESS });
    const result = evaluateCost(9999, 'EXEC', posture);
    expect(result.level).toBe('escalate');
    expect(result.blocked).toBe(false);
  });

  it('blocks under enforcement policy', () => {
    const posture = getComputePosture({ policy: POSTURE_MODES.ENFORCEMENT });
    const result = evaluateCost(9999, 'EXEC', posture);
    expect(result.level).toBe('escalate');
    expect(result.blocked).toBe(true);
  });

  it('falls back to DEFAULT thresholds for unknown stage', () => {
    const result = evaluateCost(100, 'UNKNOWN_STAGE');
    expect(result.level).toBe('warn');
    expect(result.threshold).toEqual({ warn: 100, escalate: 500 });
  });
});

describe('Compute Posture - Constants', () => {
  it('exports POSTURE_MODES', () => {
    expect(POSTURE_MODES.AWARENESS).toBe('awareness-not-enforcement');
    expect(POSTURE_MODES.ENFORCEMENT).toBe('enforcement');
  });

  it('exports DEFAULT_COST_THRESHOLDS with all stage types', () => {
    expect(DEFAULT_COST_THRESHOLDS).toHaveProperty('LEAD');
    expect(DEFAULT_COST_THRESHOLDS).toHaveProperty('PLAN');
    expect(DEFAULT_COST_THRESHOLDS).toHaveProperty('EXEC');
    expect(DEFAULT_COST_THRESHOLDS).toHaveProperty('REVIEW');
    expect(DEFAULT_COST_THRESHOLDS).toHaveProperty('DEFAULT');
  });
});
