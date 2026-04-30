import { describe, it, expect } from 'vitest';
import {
  analyzeStage25,
  analyzeExpansionVectors,
  VENTURE_DECISIONS,
  HEALTH_RATINGS,
  REVIEW_CATEGORIES,
  EXPANSION_VECTORS,
  EXPANSION_WEIGHTS,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-26-venture-review.js';

describe('stage-26-venture-review.js — contract', () => {
  it('exports analyzeStage25 as an async function', () => {
    expect(typeof analyzeStage25).toBe('function');
    expect(analyzeStage25.constructor.name).toBe('AsyncFunction');
  });

  it('exports analyzeExpansionVectors as an async function', () => {
    expect(typeof analyzeExpansionVectors).toBe('function');
    expect(analyzeExpansionVectors.constructor.name).toBe('AsyncFunction');
  });

  it('throws when stage24Data is missing', async () => {
    await expect(analyzeStage25({ logger: { log: () => {}, warn: () => {} } }))
      .rejects.toThrow('Stage 26 venture review requires Stage 25');
  });

  it('throws REFUSED when analyzeStage25 called with data (stub implementation)', async () => {
    await expect(analyzeStage25({ stage24Data: { launchOutcome: {} }, logger: { log: () => {} } }))
      .rejects.toThrow('[Stage26] REFUSED');
  });

  it('throws REFUSED when analyzeExpansionVectors called (stub implementation)', async () => {
    await expect(analyzeExpansionVectors({ ventureHealth: {}, ventureDecision: {}, logger: { log: () => {} } }))
      .rejects.toThrow('[Stage26] REFUSED');
  });

  it('exports VENTURE_DECISIONS array', () => {
    expect(Array.isArray(VENTURE_DECISIONS)).toBe(true);
    expect(VENTURE_DECISIONS).toContain('continue');
    expect(VENTURE_DECISIONS).toContain('exit');
  });

  it('exports HEALTH_RATINGS array', () => {
    expect(Array.isArray(HEALTH_RATINGS)).toBe(true);
    expect(HEALTH_RATINGS).toContain('excellent');
    expect(HEALTH_RATINGS).toContain('critical');
  });

  it('exports REVIEW_CATEGORIES array', () => {
    expect(Array.isArray(REVIEW_CATEGORIES)).toBe(true);
    expect(REVIEW_CATEGORIES).toContain('product');
    expect(REVIEW_CATEGORIES).toContain('financial');
  });

  it('exports EXPANSION_VECTORS array', () => {
    expect(Array.isArray(EXPANSION_VECTORS)).toBe(true);
    expect(EXPANSION_VECTORS).toContain('market');
    expect(EXPANSION_VECTORS).toContain('segment');
  });

  it('exports EXPANSION_WEIGHTS object with correct keys', () => {
    expect(typeof EXPANSION_WEIGHTS).toBe('object');
    expect(EXPANSION_WEIGHTS).toHaveProperty('market');
    expect(EXPANSION_WEIGHTS).toHaveProperty('feature');
    expect(EXPANSION_WEIGHTS).toHaveProperty('segment');
  });
});
