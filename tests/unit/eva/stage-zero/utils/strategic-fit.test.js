/**
 * Unit tests for computeStrategicFit (FR-3).
 *
 * Covers >=6 cases per AC-7: null context, empty themes, full overlap, no overlap,
 * partial overlap, malformed context.
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001.
 */

import { describe, test, expect, vi } from 'vitest';
import { computeStrategicFit } from '../../../../../lib/eva/stage-zero/utils/strategic-fit.js';

const silentLogger = { warn: vi.fn() };

const baseCandidate = {
  target_market: 'B2B SaaS startups in fintech',
  solution: 'AI-driven automation for invoice reconciliation',
  revenue_model: 'subscription',
  problem_statement: 'manual reconciliation is slow',
  automation_approach: 'fully autonomous agents',
};

describe('computeStrategicFit — null/malformed context fallback (50)', () => {
  test('null context returns 50', () => {
    expect(computeStrategicFit(baseCandidate, null, { logger: silentLogger })).toBe(50);
  });

  test('undefined context returns 50', () => {
    expect(computeStrategicFit(baseCandidate, undefined)).toBe(50);
  });

  test('non-object context returns 50', () => {
    expect(computeStrategicFit(baseCandidate, 'not-an-object', { logger: silentLogger })).toBe(50);
  });

  test('context with no themes returns 50 (empty extraction)', () => {
    expect(computeStrategicFit(baseCandidate, {}, { logger: silentLogger })).toBe(50);
  });

  test('logs WARN when context provided but themes empty', () => {
    const logger = { warn: vi.fn() };
    computeStrategicFit(baseCandidate, { not_themes: 'something' }, { logger });
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('computeStrategicFit — overlap scoring', () => {
  test('full overlap with all themes returns 100', () => {
    const ctx = { themes: ['fintech', 'automation', 'subscription'] };
    expect(computeStrategicFit(baseCandidate, ctx)).toBe(100);
  });

  test('no overlap returns 0', () => {
    const ctx = { themes: ['gaming', 'mobile-first', 'consumer-social'] };
    const candidate = { ...baseCandidate, target_market: 'enterprise law firms', solution: 'document review automation', revenue_model: 'per-seat licensing' };
    expect(computeStrategicFit(candidate, ctx)).toBe(0);
  });

  test('partial overlap (1 of 3 themes) returns 33', () => {
    const ctx = { themes: ['fintech', 'gaming', 'consumer-social'] };
    expect(computeStrategicFit(baseCandidate, ctx)).toBe(33);
  });

  test('partial overlap (2 of 4 themes) returns 50', () => {
    const ctx = { themes: ['fintech', 'automation', 'gaming', 'consumer-social'] };
    expect(computeStrategicFit(baseCandidate, ctx)).toBe(50);
  });
});

describe('computeStrategicFit — context source variants', () => {
  test('formattedPromptBlock string is used as a single theme', () => {
    const ctx = { formattedPromptBlock: 'Strategic priority: fintech automation for SaaS startups' };
    const score = computeStrategicFit(baseCandidate, ctx);
    expect(score).toBe(100); // single theme, the candidate text overlaps it
  });

  test('strategic_objectives array is used as fallback themes', () => {
    const ctx = {
      strategic_objectives: [
        { objective: 'expand into fintech vertical' },
        { objective: 'capture enterprise SaaS market' },
      ],
    };
    const score = computeStrategicFit(baseCandidate, ctx);
    expect(score).toBeGreaterThanOrEqual(50);
  });

  test('vision_statement string is used as fallback theme', () => {
    const ctx = { vision_statement: 'AI-first fintech automation for the next decade' };
    const score = computeStrategicFit(baseCandidate, ctx);
    expect(score).toBe(100);
  });
});

describe('computeStrategicFit — guards', () => {
  test('non-object candidate returns 50', () => {
    expect(computeStrategicFit(null, { themes: ['x'] })).toBe(50);
    expect(computeStrategicFit(undefined, { themes: ['x'] })).toBe(50);
    expect(computeStrategicFit('a string', { themes: ['x'] })).toBe(50);
  });

  test('candidate with all empty fields returns 50 (no token to compare)', () => {
    const empty = { target_market: '', solution: '', revenue_model: '', problem_statement: '', automation_approach: '' };
    expect(computeStrategicFit(empty, { themes: ['fintech'] })).toBe(50);
  });

  test('returns integer in [0, 100]', () => {
    const ctx = { themes: ['fintech', 'automation', 'subscription', 'B2B', 'SaaS'] };
    const score = computeStrategicFit(baseCandidate, ctx);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
