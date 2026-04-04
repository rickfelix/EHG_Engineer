import { describe, it, expect } from 'vitest';
import {
  scoreFinding,
  scoreFindings,
  scoreFromContext,
  RUBRIC_THRESHOLDS,
  RISK_KEYWORDS,
} from '../../scripts/modules/evaluation/gap-assessment-rubric.js';

describe('gap-assessment-rubric', () => {
  describe('scoreFinding', () => {
    it('returns correct structure with all fields', () => {
      const result = scoreFinding({ ambiguity: 2, scope: 1, riskKeywords: 0, novelty: 1 });
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('composite');
      expect(result).toHaveProperty('dimensions');
      expect(result).toHaveProperty('thresholds');
      expect(result.dimensions).toHaveProperty('ambiguity');
      expect(result.dimensions).toHaveProperty('scope');
      expect(result.dimensions).toHaveProperty('riskKeywords');
      expect(result.dimensions).toHaveProperty('novelty');
    });

    it('routes low-score findings to auto_create tier', () => {
      const result = scoreFinding({ ambiguity: 1, scope: 1, riskKeywords: 0, novelty: 1 });
      expect(result.composite).toBeLessThanOrEqual(RUBRIC_THRESHOLDS.AUTO_CREATE_MAX);
      expect(result.tier).toBe('auto_create');
    });

    it('routes medium-score findings to inbox tier', () => {
      const result = scoreFinding({ ambiguity: 5, scope: 4, riskKeywords: 3, novelty: 3 });
      expect(result.composite).toBeGreaterThan(RUBRIC_THRESHOLDS.AUTO_CREATE_MAX);
      expect(result.composite).toBeLessThan(RUBRIC_THRESHOLDS.BRAINSTORM_MIN);
      expect(result.tier).toBe('inbox');
    });

    it('routes high-score findings to brainstorm tier', () => {
      const result = scoreFinding({ ambiguity: 8, scope: 7, riskKeywords: 5, novelty: 8 });
      expect(result.composite).toBeGreaterThanOrEqual(RUBRIC_THRESHOLDS.BRAINSTORM_MIN);
      expect(result.tier).toBe('brainstorm');
    });

    it('clamps dimension values to 0-10 range', () => {
      const result = scoreFinding({ ambiguity: -5, scope: 15, riskKeywords: 0, novelty: 0 });
      expect(result.dimensions.ambiguity).toBe(0);
      expect(result.dimensions.scope).toBe(10);
    });

    it('defaults missing dimensions to 0', () => {
      const result = scoreFinding({});
      expect(result.composite).toBe(0);
      expect(result.tier).toBe('auto_create');
    });
  });

  describe('scoreFindings', () => {
    it('returns empty summary for empty array', () => {
      const result = scoreFindings([]);
      expect(result.results).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });

    it('scores multiple findings with tier counts', () => {
      const result = scoreFindings([
        { ambiguity: 1, scope: 1, riskKeywords: 0, novelty: 0 },
        { ambiguity: 8, scope: 8, riskKeywords: 8, novelty: 8 },
      ]);
      expect(result.results).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.auto_create).toBe(1);
      expect(result.summary.brainstorm).toBe(1);
    });
  });

  describe('scoreFromContext', () => {
    it('scores a specific file-path finding with no risk keywords', () => {
      const result = scoreFromContext({
        fileCount: 1,
        matchedKeywords: [],
        changeType: 'string_literal',
        seenBefore: true,
      });
      expect(result.tier).toBe('auto_create');
      expect(result.composite).toBeLessThanOrEqual(RUBRIC_THRESHOLDS.AUTO_CREATE_MAX);
    });

    it('scores a vague cross-module finding with auth keyword as brainstorm', () => {
      const result = scoreFromContext({
        fileCount: 25,
        matchedKeywords: ['auth', 'migration', 'schema'],
        changeType: 'architectural',
        seenBefore: false,
      });
      expect(result.tier).toBe('brainstorm');
      expect(result.composite).toBeGreaterThanOrEqual(RUBRIC_THRESHOLDS.BRAINSTORM_MIN);
    });

    it('scores a known pattern with low novelty', () => {
      const result = scoreFromContext({
        fileCount: 2,
        matchedKeywords: [],
        changeType: 'config_key',
        seenBefore: true,
      });
      expect(result.dimensions.novelty).toBeLessThanOrEqual(3);
    });
  });

  describe('RUBRIC_THRESHOLDS', () => {
    it('has expected default values', () => {
      expect(RUBRIC_THRESHOLDS.AUTO_CREATE_MAX).toBe(12);
      expect(RUBRIC_THRESHOLDS.BRAINSTORM_MIN).toBe(23);
    });

    it('AUTO_CREATE_MAX is less than BRAINSTORM_MIN', () => {
      expect(RUBRIC_THRESHOLDS.AUTO_CREATE_MAX).toBeLessThan(RUBRIC_THRESHOLDS.BRAINSTORM_MIN);
    });
  });

  describe('RISK_KEYWORDS', () => {
    it('has high, medium, and low tiers', () => {
      expect(RISK_KEYWORDS.high).toBeInstanceOf(Array);
      expect(RISK_KEYWORDS.medium).toBeInstanceOf(Array);
      expect(RISK_KEYWORDS.low).toBeInstanceOf(Array);
      expect(RISK_KEYWORDS.high.length).toBeGreaterThan(0);
    });
  });
});
