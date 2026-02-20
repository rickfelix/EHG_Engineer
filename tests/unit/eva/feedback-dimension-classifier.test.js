/**
 * Tests for feedback-dimension-classifier.js
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { classifyFeedback, _resetClassifierCache, _extractKeywords } from '../../../lib/eva/feedback-dimension-classifier.js';

// Mock supabase
function createMockSupabase(visionDims = [], archDims = []) {
  return {
    from: vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => {
            if (table === 'eva_vision_documents') {
              return Promise.resolve({ data: { extracted_dimensions: visionDims }, error: null });
            }
            if (table === 'eva_architecture_plans') {
              return Promise.resolve({ data: { extracted_dimensions: archDims }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        })),
      })),
    })),
  };
}

describe('feedback-dimension-classifier', () => {
  beforeEach(() => {
    _resetClassifierCache();
  });

  describe('_extractKeywords', () => {
    it('should extract meaningful keywords from text', () => {
      const keywords = _extractKeywords('Portfolio Governance', 'The system for managing investment decisions');
      expect(keywords).toContain('portfolio');
      expect(keywords).toContain('governance');
      expect(keywords).toContain('investment');
      expect(keywords).toContain('decisions');
      // Stop words should be filtered
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('for');
    });

    it('should deduplicate keywords', () => {
      const keywords = _extractKeywords('test test', 'test value');
      const testCount = keywords.filter(w => w === 'test').length;
      expect(testCount).toBe(1);
    });

    it('should filter short tokens', () => {
      const keywords = _extractKeywords('A is OK', 'It can do it');
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('is');
    });
  });

  describe('classifyFeedback', () => {
    it('should return empty array when supabase is null', async () => {
      const result = await classifyFeedback('test', 'description', null);
      expect(result).toEqual([]);
    });

    it('should return empty array when no dimensions loaded', async () => {
      const supabase = createMockSupabase([], []);
      const result = await classifyFeedback('test error', 'something broke', supabase);
      expect(result).toEqual([]);
    });

    it('should match feedback to vision dimensions by keyword', async () => {
      const supabase = createMockSupabase(
        [
          { name: 'Portfolio Governance', description: 'Managing portfolio investment decisions and risk' },
          { name: 'Technology Infrastructure', description: 'Cloud computing platform reliability' },
        ],
        []
      );

      const result = await classifyFeedback(
        'Portfolio risk assessment failed',
        'The portfolio governance check encountered an error during risk evaluation',
        supabase
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].dimensionId).toBe('V01'); // Portfolio Governance should match
      expect(result[0].confidence).toBeGreaterThan(0);
      expect(result[0].matchedKeywords.length).toBeGreaterThan(0);
    });

    it('should match feedback to architecture dimensions', async () => {
      const supabase = createMockSupabase(
        [],
        [
          { name: 'Database Schema', description: 'Relational data model and migrations' },
          { name: 'API Security', description: 'Authentication and authorization endpoints' },
        ]
      );

      const result = await classifyFeedback(
        'Database migration failed',
        'Schema migration encountered error during data model update',
        supabase
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].dimensionId).toBe('A01'); // Database Schema
    });

    it('should sort results by confidence descending', async () => {
      const supabase = createMockSupabase(
        [
          { name: 'Risk Management', description: 'risk assessment evaluation' },
          { name: 'Portfolio Governance Risk', description: 'portfolio risk governance assessment evaluation scoring' },
        ],
        []
      );

      const result = await classifyFeedback(
        'Risk assessment evaluation failure',
        'The risk scoring evaluation encountered portfolio governance issues',
        supabase
      );

      if (result.length >= 2) {
        expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
      }
    });

    it('should return empty when no keywords match', async () => {
      const supabase = createMockSupabase(
        [{ name: 'Quantum Computing', description: 'Quantum entanglement processor' }],
        []
      );

      const result = await classifyFeedback(
        'Database connection timeout',
        'PostgreSQL connection pool exhausted',
        supabase
      );

      expect(result).toEqual([]);
    });

    it('should use cached dimensions on second call', async () => {
      const supabase = createMockSupabase(
        [{ name: 'Test Dimension', description: 'test keyword matching' }],
        []
      );

      await classifyFeedback('test keyword', 'matching test', supabase);
      await classifyFeedback('test keyword', 'matching test', supabase);

      // from() should only be called during the first load (2 tables)
      expect(supabase.from).toHaveBeenCalledTimes(2);
    });
  });
});
