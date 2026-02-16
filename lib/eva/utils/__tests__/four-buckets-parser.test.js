import { describe, it, expect, vi } from 'vitest';
import { parseFourBuckets } from '../four-buckets-parser.js';

describe('parseFourBuckets', () => {
  describe('missing or invalid input', () => {
    it('returns empty result when parsed is null', () => {
      const result = parseFourBuckets(null);
      expect(result.classifications).toEqual([]);
      expect(result.summary).toEqual({ facts: 0, assumptions: 0, simulations: 0, unknowns: 0 });
    });

    it('returns empty result when epistemicClassification is missing', () => {
      const result = parseFourBuckets({ description: 'test' });
      expect(result.classifications).toEqual([]);
      expect(result.summary.facts).toBe(0);
    });

    it('returns empty result and logs warning when epistemicClassification is a string', () => {
      const logger = { warn: vi.fn() };
      const result = parseFourBuckets({ epistemicClassification: 'not an array' }, { logger });
      expect(result.classifications).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not an array')
      );
    });

    it('returns empty result when epistemicClassification is empty array', () => {
      const result = parseFourBuckets({ epistemicClassification: [] });
      expect(result.classifications).toEqual([]);
      expect(result.summary).toEqual({ facts: 0, assumptions: 0, simulations: 0, unknowns: 0 });
    });
  });

  describe('valid classification parsing', () => {
    it('parses valid classifications correctly', () => {
      const parsed = {
        epistemicClassification: [
          { claim: 'Market size is $10B', bucket: 'fact', evidence: 'From industry report' },
          { claim: 'Users will pay $50/mo', bucket: 'assumption', evidence: 'Based on surveys' },
          { claim: 'Revenue reaches $1M in Y2', bucket: 'simulation', evidence: 'Financial model' },
        ],
      };
      const result = parseFourBuckets(parsed);
      expect(result.classifications).toHaveLength(3);
      expect(result.summary).toEqual({ facts: 1, assumptions: 1, simulations: 1, unknowns: 0 });
    });

    it('normalizes bucket values to lowercase', () => {
      const parsed = {
        epistemicClassification: [
          { claim: 'Test', bucket: 'FACT', evidence: '' },
          { claim: 'Test2', bucket: 'Assumption', evidence: '' },
        ],
      };
      const result = parseFourBuckets(parsed);
      expect(result.classifications[0].bucket).toBe('fact');
      expect(result.classifications[1].bucket).toBe('assumption');
      expect(result.summary.facts).toBe(1);
      expect(result.summary.assumptions).toBe(1);
    });

    it('truncates long claims and evidence', () => {
      const longClaim = 'a'.repeat(600);
      const longEvidence = 'b'.repeat(1200);
      const result = parseFourBuckets({
        epistemicClassification: [
          { claim: longClaim, bucket: 'fact', evidence: longEvidence },
        ],
      });
      expect(result.classifications[0].claim.length).toBe(500);
      expect(result.classifications[0].evidence.length).toBe(1000);
    });
  });

  describe('invalid bucket normalization', () => {
    it('normalizes invalid bucket to unknown with warning', () => {
      const logger = { warn: vi.fn() };
      const result = parseFourBuckets({
        epistemicClassification: [
          { claim: 'Some claim', bucket: 'guess', evidence: 'just guessing' },
        ],
      }, { logger });
      expect(result.classifications[0].bucket).toBe('unknown');
      expect(result.summary.unknowns).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid bucket "guess"')
      );
    });

    it('normalizes empty bucket to unknown', () => {
      const logger = { warn: vi.fn() };
      const result = parseFourBuckets({
        epistemicClassification: [
          { claim: 'Some claim', bucket: '', evidence: '' },
        ],
      }, { logger });
      expect(result.classifications[0].bucket).toBe('unknown');
    });
  });

  describe('malformed entries', () => {
    it('skips entries without claim', () => {
      const result = parseFourBuckets({
        epistemicClassification: [
          { bucket: 'fact', evidence: 'no claim' },
          { claim: 'Valid claim', bucket: 'fact', evidence: 'present' },
        ],
      });
      expect(result.classifications).toHaveLength(1);
      expect(result.classifications[0].claim).toBe('Valid claim');
    });

    it('skips null entries', () => {
      const result = parseFourBuckets({
        epistemicClassification: [null, undefined, { claim: 'Valid', bucket: 'fact', evidence: '' }],
      });
      expect(result.classifications).toHaveLength(1);
    });
  });
});
