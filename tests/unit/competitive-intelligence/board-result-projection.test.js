/**
 * Unit Tests: Board-result projection (SD-LEO-INFRA-ACTIVATE-COMPETITIVE-INTELLIGENCE-001 / FR-2)
 *
 * Pins the producer->consumer contract mapping between runDifferentiationBoard's return
 * and the ehg ExtendedStageZeroResult shape. This is the "half-fix" guard: every field
 * mapping + the two vocabulary edges (seedable->verdict, flagged->failed) are asserted.
 */

import { describe, test, expect } from 'vitest';
import {
  projectBoardResultToStageZero,
  mapSanitizationStatus,
  mapUniqueAdvantagesToOpportunities,
} from '../../../lib/competitive-intelligence/board-result-projection.js';

describe('projectBoardResultToStageZero', () => {
  test('TS-1: maps a seedable board return to the ExtendedStageZeroResult shape', () => {
    const board = {
      gate: { seedable: true, delta: 0.7, threshold: 0.5, reason: 'defensible, seedable' },
      strategy: { angle: 'Automate the whole workflow', unique_advantages: ['a', 'b'] },
      sanitization_status: 'passed',
    };

    const out = projectBoardResultToStageZero(board);

    expect(out).toEqual({
      differentiation_strategy: 'Automate the whole workflow',
      delta_gate: {
        verdict: 'seedable',
        score: 0.7,
        threshold: 0.5,
        reason: 'defensible, seedable',
      },
      sanitization_status: 'passed',
      // SURFACE-DIFFERENTIATION-BOARD-001: unique_advantages -> opportunity cards
      differentiation_opportunities: [{ opportunity_name: 'a' }, { opportunity_name: 'b' }],
    });
  });

  test('TS-2: maps me_too verdict and flagged->failed sanitization edges', () => {
    const board = {
      gate: { seedable: false, delta: 0.2, threshold: 0.5, reason: 'me-too, blocked' },
      strategy: { angle: 'Cheaper version' },
      sanitization_status: 'flagged',
    };

    const out = projectBoardResultToStageZero(board);

    expect(out.delta_gate.verdict).toBe('me_too');
    expect(out.delta_gate.score).toBe(0.2);
    expect(out.delta_gate.threshold).toBe(0.5);
    expect(out.delta_gate.reason).toBe('me-too, blocked');
    expect(out.differentiation_strategy).toBe('Cheaper version');
    expect(out.sanitization_status).toBe('failed');
  });

  test('score is sourced from gate.delta (not double-sourced from a bare delta column)', () => {
    const board = {
      gate: { seedable: true, delta: 0.61, threshold: 0.5, reason: 'ok' },
      // a stray top-level delta that must be ignored in favor of gate.delta
      delta: 0.99,
      strategy: { angle: 'x' },
      sanitization_status: 'passed',
    };
    expect(projectBoardResultToStageZero(board).delta_gate.score).toBe(0.61);
  });

  test('pending sanitization passes through unchanged', () => {
    const board = {
      gate: { seedable: true, delta: 0.8, threshold: 0.5, reason: 'ok' },
      strategy: { angle: 'x' },
      sanitization_status: 'pending',
    };
    expect(projectBoardResultToStageZero(board).sanitization_status).toBe('pending');
  });

  test('coerces a non-string strategy.angle and a string strategy', () => {
    expect(
      projectBoardResultToStageZero({ gate: { seedable: true }, strategy: { angle: 123 } })
        .differentiation_strategy
    ).toBe('123');
    // strategy provided as a bare string
    expect(
      projectBoardResultToStageZero({ gate: { seedable: false }, strategy: 'just text' })
        .differentiation_strategy
    ).toBe('just text');
  });

  test('missing strategy yields an empty differentiation_strategy string', () => {
    const out = projectBoardResultToStageZero({ gate: { seedable: true, delta: 0.6, threshold: 0.5 } });
    expect(out.differentiation_strategy).toBe('');
  });

  test('returns null for null/undefined/non-object input', () => {
    expect(projectBoardResultToStageZero(null)).toBeNull();
    expect(projectBoardResultToStageZero(undefined)).toBeNull();
    expect(projectBoardResultToStageZero('nope')).toBeNull();
  });
});

describe('mapSanitizationStatus', () => {
  test('flagged -> failed; others pass through', () => {
    expect(mapSanitizationStatus('flagged')).toBe('failed');
    expect(mapSanitizationStatus('passed')).toBe('passed');
    expect(mapSanitizationStatus('pending')).toBe('pending');
    expect(mapSanitizationStatus(undefined)).toBeUndefined();
  });
});

describe('differentiation_opportunities mapping (SD-LEO-INFRA-SURFACE-DIFFERENTIATION-BOARD-001 / FR-1)', () => {
  test('projection maps strategy.unique_advantages -> differentiation_opportunities [{opportunity_name}]', () => {
    const board = {
      gate: { seedable: true, delta: 0.7, threshold: 0.5, reason: 'ok' },
      strategy: { angle: 'x', unique_advantages: ['24/7 automation', 'no headcount'] },
      sanitization_status: 'passed',
    };
    expect(projectBoardResultToStageZero(board).differentiation_opportunities).toEqual([
      { opportunity_name: '24/7 automation' },
      { opportunity_name: 'no headcount' },
    ]);
  });

  test('projection yields an empty opportunities array when the board produced no advantages', () => {
    const board = { gate: { seedable: true, delta: 0.6, threshold: 0.5 }, strategy: { angle: 'x' } };
    expect(projectBoardResultToStageZero(board).differentiation_opportunities).toEqual([]);
  });

  test('mapUniqueAdvantagesToOpportunities: maps, drops empties, tolerates non-array / non-object', () => {
    expect(mapUniqueAdvantagesToOpportunities({ unique_advantages: ['a', '', '  ', 'b'] })).toEqual([
      { opportunity_name: 'a' },
      { opportunity_name: 'b' },
    ]);
    expect(mapUniqueAdvantagesToOpportunities({ unique_advantages: 'not-an-array' })).toEqual([]);
    expect(mapUniqueAdvantagesToOpportunities('bare string')).toEqual([]);
    expect(mapUniqueAdvantagesToOpportunities(undefined)).toEqual([]);
  });
});
