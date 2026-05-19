/**
 * SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-7
 *
 * Regression test for backfill-chairman-decisions-missing-rows.mjs
 * deriveDecisionType() — the canonical 5-way switch.
 */
import { describe, it, expect } from 'vitest';
import { deriveDecisionType } from '../../scripts/backfill-chairman-decisions-missing-rows.mjs';

describe('deriveDecisionType — canonical 5-way switch', () => {
  describe('work_type=sd_required → SKIP (closes the bug)', () => {
    it('S10 (sd_required, gate_type=promotion, review_mode=auto) → null', () => {
      expect(deriveDecisionType('sd_required', 'promotion', 'auto')).toBeNull();
    });
    it('S18 (sd_required, gate_type=promotion, review_mode=auto) → null', () => {
      expect(deriveDecisionType('sd_required', 'promotion', 'auto')).toBeNull();
    });
    it('S19 (sd_required, gate_type=promotion, review_mode=auto) → null', () => {
      expect(deriveDecisionType('sd_required', 'promotion', 'auto')).toBeNull();
    });
    it('sd_required + review_mode=review → STILL null (work_type wins)', () => {
      expect(deriveDecisionType('sd_required', 'kill', 'review')).toBeNull();
    });
  });

  describe('work_type=decision_gate → stage_gate or null', () => {
    it('S3 (decision_gate, gate_type=kill, review_mode=auto) → stage_gate', () => {
      expect(deriveDecisionType('decision_gate', 'kill', 'auto')).toBe('stage_gate');
    });
    it('S17 (decision_gate, gate_type=promotion, review_mode=auto) → stage_gate', () => {
      expect(deriveDecisionType('decision_gate', 'promotion', 'auto')).toBe('stage_gate');
    });
    it('decision_gate with gate_type=none + review_mode=auto → null', () => {
      expect(deriveDecisionType('decision_gate', 'none', 'auto')).toBeNull();
    });
    it('decision_gate with gate_type=none + review_mode=review → review', () => {
      expect(deriveDecisionType('decision_gate', 'none', 'review')).toBe('review');
    });
  });

  describe('work_type=artifact_only → review or null', () => {
    it('S1 (artifact_only, gate_type=none, review_mode=auto) → null', () => {
      expect(deriveDecisionType('artifact_only', 'none', 'auto')).toBeNull();
    });
    it('S7 (artifact_only, gate_type=none, review_mode=review) → review', () => {
      expect(deriveDecisionType('artifact_only', 'none', 'review')).toBe('review');
    });
    it('artifact_only with stray gate_type=kill → still null (work_type dominates)', () => {
      expect(deriveDecisionType('artifact_only', 'kill', 'auto')).toBeNull();
    });
  });

  describe('work_type=automated_check → SKIP', () => {
    it('S2 (automated_check, gate_type=none, review_mode=auto) → null', () => {
      expect(deriveDecisionType('automated_check', 'none', 'auto')).toBeNull();
    });
    it('S20 (automated_check, gate_type=none, review_mode=auto) → null', () => {
      expect(deriveDecisionType('automated_check', 'none', 'auto')).toBeNull();
    });
    it('automated_check + review_mode=review → STILL null (system-driven)', () => {
      expect(deriveDecisionType('automated_check', 'kill', 'review')).toBeNull();
    });
  });

  describe('NULL / unknown work_type → SKIP with warning', () => {
    it('null work_type → null', () => {
      expect(deriveDecisionType(null, 'promotion', 'auto')).toBeNull();
    });
    it('undefined work_type → null', () => {
      expect(deriveDecisionType(undefined, 'kill', 'review')).toBeNull();
    });
    it('unknown work_type string → null', () => {
      expect(deriveDecisionType('mystery_value', 'promotion', 'auto')).toBeNull();
    });
  });

  describe('Idempotency: same inputs → same outputs', () => {
    it('repeat call yields identical result', () => {
      const r1 = deriveDecisionType('sd_required', 'promotion', 'auto');
      const r2 = deriveDecisionType('sd_required', 'promotion', 'auto');
      expect(r1).toBe(r2);
      expect(r1).toBeNull();
    });
  });
});

describe('canonical mapping coverage (all 5 work_types × representative gate/review pairs)', () => {
  const cases = [
    { workType: 'sd_required',     gateType: 'promotion', reviewMode: 'auto',   expected: null },
    { workType: 'decision_gate',   gateType: 'kill',      reviewMode: 'auto',   expected: 'stage_gate' },
    { workType: 'decision_gate',   gateType: 'promotion', reviewMode: 'auto',   expected: 'stage_gate' },
    { workType: 'artifact_only',   gateType: 'none',      reviewMode: 'review', expected: 'review' },
    { workType: 'artifact_only',   gateType: 'none',      reviewMode: 'auto',   expected: null },
    { workType: 'automated_check', gateType: 'none',      reviewMode: 'auto',   expected: null },
  ];
  it.each(cases)('work_type=$workType, gate=$gateType, review=$reviewMode → $expected', ({ workType, gateType, reviewMode, expected }) => {
    expect(deriveDecisionType(workType, gateType, reviewMode)).toBe(expected);
  });
});
