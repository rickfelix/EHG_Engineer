/**
 * Unit tests for Chairman Pipeline Governance Controls
 * SD-LEO-FEAT-PER-STAGE-AUTO-PROCEED-001
 */

import { describe, it, expect } from 'vitest';
import { evaluateDecision } from '../../../lib/eva/decision-filter-engine.js';

describe('DFE Chairman Governance Override', () => {
  it('returns PRESENT_TO_CHAIRMAN when governance override is active', () => {
    const result = evaluateDecision(
      { score: 9, cost: 10, stage: 'stage_7' },
      {
        governanceOverride: { auto_proceed: false, reason: 'Manual review required' },
      }
    );

    expect(result.auto_proceed).toBe(false);
    expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN');
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0].type).toBe('chairman_governance_override');
  });

  it('proceeds normally when no governance override', () => {
    const result = evaluateDecision(
      { score: 9, cost: 10 },
      { preferences: { 'filter.cost_threshold': 100 } }
    );

    // Without governance override, DFE evaluates normally
    expect(result.recommendation).not.toBe('PRESENT_TO_CHAIRMAN');
  });

  it('proceeds normally when governance override allows auto-proceed', () => {
    const result = evaluateDecision(
      { score: 9, cost: 10 },
      {
        governanceOverride: { auto_proceed: true },
        preferences: { 'filter.cost_threshold': 100 },
      }
    );

    // auto_proceed=true means no override, DFE evaluates normally
    expect(result.triggers.every(t => t.type !== 'chairman_governance_override')).toBe(true);
  });

  it('governance override takes precedence over high DFE score', () => {
    const result = evaluateDecision(
      { score: 10, cost: 0 }, // Perfect score, no cost
      {
        governanceOverride: { auto_proceed: false, reason: 'Chairman review' },
        preferences: { 'filter.cost_threshold': 1000 },
      }
    );

    // Even with perfect inputs, governance override blocks
    expect(result.auto_proceed).toBe(false);
    expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN');
  });
});
