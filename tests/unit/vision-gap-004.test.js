/**
 * Unit tests for SD-MAN-GEN-CORRECTIVE-VISION-GAP-004
 * Tests: DFE escalation (FR-004), deadline proximity (FR-006), severity calculation
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateDecision,
  calculateSeverity,
  ENGINE_VERSION,
  TRIGGER_TYPES,
} from '../../lib/eva/decision-filter-engine.js';
import { getDeadlineProximityFactor } from '../../scripts/lib/priority-scorer.js';

describe('calculateSeverity (FR-004)', () => {
  it('returns NONE for empty triggers', () => {
    const result = calculateSeverity([]);
    expect(result.severityScore).toBe(0);
    expect(result.escalationLevel).toBe(0);
    expect(result.escalationLabel).toBe('NONE');
  });

  it('returns L1_AUTO for low severity triggers', () => {
    const result = calculateSeverity([
      { type: 'novel_pattern', severity: 'MEDIUM' },
    ]);
    // MEDIUM(20) * novel_pattern(0.8) = 16 → L1
    expect(result.escalationLevel).toBe(1);
    expect(result.escalationLabel).toBe('L1_AUTO');
    expect(result.severityScore).toBeLessThan(30);
  });

  it('returns L2_REVIEW for medium severity triggers', () => {
    const result = calculateSeverity([
      { type: 'budget_exceeded', severity: 'HIGH' },
    ]);
    // HIGH(40) * budget_exceeded(1.5) = 60 → L2
    expect(result.escalationLevel).toBe(2);
    expect(result.escalationLabel).toBe('L2_REVIEW');
    expect(result.severityScore).toBeGreaterThanOrEqual(30);
    expect(result.severityScore).toBeLessThanOrEqual(70);
  });

  it('returns L3_APPROVAL for high severity triggers', () => {
    const result = calculateSeverity([
      { type: 'strategic_pivot', severity: 'HIGH' },
      { type: 'budget_exceeded', severity: 'HIGH' },
      { type: 'low_score', severity: 'HIGH' },
    ]);
    expect(result.escalationLevel).toBe(3);
    expect(result.escalationLabel).toBe('L3_APPROVAL');
    expect(result.severityScore).toBeGreaterThan(70);
  });

  it('caps severity at 100', () => {
    const manyTriggers = Array.from({ length: 10 }, () => ({
      type: 'strategic_pivot',
      severity: 'HIGH',
    }));
    const result = calculateSeverity(manyTriggers);
    expect(result.severityScore).toBeLessThanOrEqual(100);
  });
});

describe('evaluateDecision escalation integration (FR-004)', () => {
  it('includes escalation_level in response', () => {
    const result = evaluateDecision(
      { cost: 99999, score: 3 },
      { preferences: {} }
    );
    expect(result).toHaveProperty('escalation_level');
    expect(result).toHaveProperty('escalation_label');
    expect(result).toHaveProperty('severity_score');
    expect(typeof result.escalation_level).toBe('number');
  });

  it('returns escalation_level 0 when no business triggers', () => {
    const result = evaluateDecision({}, { preferences: {} });
    expect(result.auto_proceed).toBe(true);
    expect(result.escalation_level).toBe(0);
    expect(result.escalation_label).toBe('NONE');
  });

  it('returns higher escalation for multiple HIGH triggers', () => {
    const result = evaluateDecision(
      {
        cost: 99999,
        score: 2,
        visionScore: 10,
        sdPhase: 'EXEC',
      },
      { preferences: {} }
    );
    expect(result.escalation_level).toBeGreaterThanOrEqual(2);
  });
});

describe('getDeadlineProximityFactor (FR-006)', () => {
  const now = new Date('2026-03-01');

  it('returns 1.0 at deadline', () => {
    expect(getDeadlineProximityFactor('2026-03-01', now)).toBe(1);
  });

  it('returns 1.0 past deadline', () => {
    expect(getDeadlineProximityFactor('2026-02-01', now)).toBe(1);
  });

  it('returns 0.0 at 90+ days out', () => {
    expect(getDeadlineProximityFactor('2026-06-01', now)).toBe(0);
  });

  it('returns ~0.5 at 45 days out', () => {
    const factor = getDeadlineProximityFactor('2026-04-15', now);
    expect(factor).toBeGreaterThan(0.4);
    expect(factor).toBeLessThan(0.6);
  });

  it('returns 0.0 for null deadline', () => {
    expect(getDeadlineProximityFactor(null)).toBe(0);
  });

  it('returns 0.0 for invalid date', () => {
    expect(getDeadlineProximityFactor('not-a-date')).toBe(0);
  });

  it('increases as deadline approaches', () => {
    const far = getDeadlineProximityFactor('2026-05-01', now);
    const mid = getDeadlineProximityFactor('2026-04-01', now);
    const near = getDeadlineProximityFactor('2026-03-15', now);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});

describe('ENGINE_VERSION and TRIGGER_TYPES exports', () => {
  it('exports ENGINE_VERSION', () => {
    expect(ENGINE_VERSION).toBe('1.0.0');
  });

  it('exports TRIGGER_TYPES with 8 types', () => {
    expect(TRIGGER_TYPES).toHaveLength(8);
    expect(TRIGGER_TYPES).toContain('vision_score_signal');
  });
});
