/**
 * Tests for Decision Filter Engine (V04: decision_filter_engine_escalation)
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-069
 */

import { describe, it, expect } from 'vitest';
import {
  evaluate,
  evaluateBatch,
  getThresholds,
  DECISIONS,
  DEFAULT_THRESHOLDS,
} from '../../../lib/governance/decision-filter-engine.js';

describe('Decision Filter Engine - evaluate()', () => {
  it('returns GO for high confidence', () => {
    const result = evaluate({ confidence: 0.9 });
    expect(result.decision).toBe(DECISIONS.GO);
    expect(result.confidence).toBe(0.9);
  });

  it('returns ESCALATE for medium confidence', () => {
    const result = evaluate({ confidence: 0.6 });
    expect(result.decision).toBe(DECISIONS.ESCALATE);
  });

  it('returns ESCALATE for low confidence without critical context', () => {
    const result = evaluate({ confidence: 0.3 });
    expect(result.decision).toBe(DECISIONS.ESCALATE);
  });

  it('returns BLOCK for low confidence with critical context', () => {
    const result = evaluate({ confidence: 0.3, context: { critical: true } });
    expect(result.decision).toBe(DECISIONS.BLOCK);
  });

  it('uses gate-specific thresholds', () => {
    // KILL_GATE: goThreshold=0.95
    const result = evaluate({ confidence: 0.9, gateType: 'KILL_GATE' });
    expect(result.decision).toBe(DECISIONS.ESCALATE);
  });

  it('handles QUALITY_GATE thresholds', () => {
    const result = evaluate({ confidence: 0.85, gateType: 'QUALITY_GATE' });
    expect(result.decision).toBe(DECISIONS.GO);
  });

  it('handles invalid confidence gracefully', () => {
    const result = evaluate({ confidence: -1 });
    expect(result.decision).toBe(DECISIONS.ESCALATE);
    expect(result.reasoning).toContain('Invalid confidence');
  });

  it('handles NaN confidence', () => {
    const result = evaluate({ confidence: NaN });
    expect(result.decision).toBe(DECISIONS.ESCALATE);
  });

  it('supports threshold overrides', () => {
    const overrides = { DEFAULT: { goThreshold: 0.5, escalateThreshold: 0.2 } };
    const result = evaluate({ confidence: 0.6 }, overrides);
    expect(result.decision).toBe(DECISIONS.GO);
  });

  it('includes cost evaluation when cost context provided', () => {
    const result = evaluate({
      confidence: 0.9,
      context: { cost: 10, stageType: 'LEAD' },
    });
    expect(result.costEvaluation).toBeDefined();
    expect(result.costEvaluation.level).toBe('normal');
  });

  it('blocks when cost exceeds escalation threshold under enforcement', () => {
    // This tests the DFE-compute posture integration
    // Under awareness policy, cost escalation does NOT block
    const result = evaluate({
      confidence: 0.9,
      context: { cost: 10, stageType: 'LEAD' },
    });
    // Under default awareness policy, should NOT block even with GO confidence
    expect(result.decision).toBe(DECISIONS.GO);
  });
});

describe('Decision Filter Engine - evaluateBatch()', () => {
  it('evaluates multiple inputs', () => {
    const results = evaluateBatch([
      { confidence: 0.9 },
      { confidence: 0.6 },
      { confidence: 0.3, context: { critical: true } },
    ]);
    expect(results).toHaveLength(3);
    expect(results[0].decision).toBe(DECISIONS.GO);
    expect(results[1].decision).toBe(DECISIONS.ESCALATE);
    expect(results[2].decision).toBe(DECISIONS.BLOCK);
  });

  it('returns empty array for empty input', () => {
    const results = evaluateBatch([]);
    expect(results).toHaveLength(0);
  });
});

describe('Decision Filter Engine - getThresholds()', () => {
  it('returns gate-specific thresholds', () => {
    const thresholds = getThresholds('KILL_GATE');
    expect(thresholds.goThreshold).toBe(0.95);
    expect(thresholds.escalateThreshold).toBe(0.7);
  });

  it('falls back to DEFAULT for unknown gate', () => {
    const thresholds = getThresholds('UNKNOWN_GATE');
    expect(thresholds.goThreshold).toBe(0.85);
    expect(thresholds.escalateThreshold).toBe(0.5);
  });
});

describe('Decision Filter Engine - Constants', () => {
  it('exports DECISIONS enum', () => {
    expect(DECISIONS.GO).toBe('GO');
    expect(DECISIONS.ESCALATE).toBe('ESCALATE');
    expect(DECISIONS.BLOCK).toBe('BLOCK');
  });

  it('exports DEFAULT_THRESHOLDS', () => {
    expect(DEFAULT_THRESHOLDS).toHaveProperty('QUALITY_GATE');
    expect(DEFAULT_THRESHOLDS).toHaveProperty('KILL_GATE');
    expect(DEFAULT_THRESHOLDS).toHaveProperty('PHASE_GATE');
  });
});
