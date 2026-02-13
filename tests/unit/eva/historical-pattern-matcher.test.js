/**
 * Tests for Historical Pattern Matcher
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-004)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  findSimilar,
  MAX_RESULTS,
  TRIGGER_CATEGORY_MAP,
  buildSearchTerms,
  calculateRelevance,
} from '../../../lib/eva/historical-pattern-matcher.js';

/**
 * Creates a mock Supabase client for issue_patterns queries.
 */
function createMockSupabase({ data = null, error = null } = {}) {
  const limit = vi.fn().mockResolvedValue({ data, error });
  const order = vi.fn().mockReturnValue({ limit });
  const or = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ or });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

describe('HistoricalPatternMatcher', () => {
  describe('buildSearchTerms', () => {
    it('should always include eva and dfe base terms', () => {
      const terms = buildSearchTerms([]);
      expect(terms).toContain('eva');
      expect(terms).toContain('dfe');
    });

    it('should add mapped terms for known trigger types', () => {
      const terms = buildSearchTerms(['cost_threshold']);
      expect(terms).toContain('cost');
      expect(terms).toContain('budget');
      expect(terms).toContain('financial');
    });

    it('should handle multiple trigger types', () => {
      const terms = buildSearchTerms(['cost_threshold', 'strategic_pivot']);
      expect(terms).toContain('cost');
      expect(terms).toContain('strategy');
      expect(terms).toContain('pivot');
    });

    it('should handle unknown trigger types gracefully', () => {
      const terms = buildSearchTerms(['unknown_type']);
      // Should still have base terms
      expect(terms).toContain('eva');
      expect(terms).toContain('dfe');
      expect(terms.length).toBe(2);
    });

    it('should deduplicate terms', () => {
      const terms = buildSearchTerms(['cost_threshold', 'new_tech_vendor']);
      // Both maps include 'eva' and 'dfe' - should not duplicate
      const evaCount = terms.filter(t => t === 'eva').length;
      expect(evaCount).toBe(1);
    });
  });

  describe('calculateRelevance', () => {
    it('should return higher score for high frequency', () => {
      const now = new Date().toISOString();
      const highFreq = calculateRelevance({ frequency: 10, last_seen: now });
      const lowFreq = calculateRelevance({ frequency: 1, last_seen: now });
      expect(highFreq).toBeGreaterThan(lowFreq);
    });

    it('should return higher score for recent patterns', () => {
      const recent = calculateRelevance({ frequency: 5, last_seen: new Date().toISOString() });
      const old = calculateRelevance({ frequency: 5, last_seen: '2020-01-01T00:00:00Z' });
      expect(recent).toBeGreaterThan(old);
    });

    it('should handle missing frequency', () => {
      const result = calculateRelevance({ last_seen: new Date().toISOString() });
      expect(result).toBeGreaterThan(0);
    });

    it('should handle missing last_seen', () => {
      const result = calculateRelevance({ frequency: 5 });
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('findSimilar', () => {
    it('should return empty array when supabase is not provided', async () => {
      const result = await findSimilar({ triggerTypes: ['cost_threshold'] });
      expect(result).toEqual([]);
    });

    it('should return empty array when triggerTypes is empty', async () => {
      const supabase = createMockSupabase({ data: [] });
      const result = await findSimilar({ triggerTypes: [], supabase });
      expect(result).toEqual([]);
    });

    it('should query issue_patterns table', async () => {
      const supabase = createMockSupabase({ data: [] });
      await findSimilar({ triggerTypes: ['cost_threshold'], supabase });
      expect(supabase.from).toHaveBeenCalledWith('issue_patterns');
    });

    it('should return matched patterns with relevance scores', async () => {
      const mockData = [
        { id: '1', pattern_name: 'Budget Overrun', category: 'financial', frequency: 5, last_seen: new Date().toISOString(), severity: 'high', description: 'Repeated budget overruns' },
        { id: '2', pattern_name: 'Cost Escalation', category: 'cost', frequency: 3, last_seen: new Date().toISOString(), severity: 'medium', description: 'Gradual cost increase' },
      ];
      const supabase = createMockSupabase({ data: mockData });

      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase });
      expect(result.length).toBe(2);
      expect(result[0].pattern_name).toBeDefined();
      expect(result[0].relevance).toBeGreaterThan(0);
    });

    it('should limit results to MAX_RESULTS', async () => {
      const mockData = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        pattern_name: `Pattern ${i}`,
        category: 'eva',
        frequency: 10 - i,
        last_seen: new Date().toISOString(),
        severity: 'medium',
        description: `Pattern ${i} description`,
      }));
      const supabase = createMockSupabase({ data: mockData });

      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase });
      expect(result.length).toBeLessThanOrEqual(MAX_RESULTS);
    });

    it('should deduplicate by pattern_name', async () => {
      const mockData = [
        { id: '1', pattern_name: 'Duplicate Pattern', category: 'eva', frequency: 5, last_seen: new Date().toISOString(), severity: 'high', description: 'First' },
        { id: '2', pattern_name: 'Duplicate Pattern', category: 'dfe', frequency: 3, last_seen: new Date().toISOString(), severity: 'medium', description: 'Second' },
      ];
      const supabase = createMockSupabase({ data: mockData });

      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase });
      expect(result.length).toBe(1);
      expect(result[0].pattern_name).toBe('Duplicate Pattern');
    });

    it('should sort by relevance descending', async () => {
      const mockData = [
        { id: '1', pattern_name: 'Old Pattern', category: 'eva', frequency: 2, last_seen: '2020-01-01T00:00:00Z', severity: 'low', description: 'Old' },
        { id: '2', pattern_name: 'Recent Pattern', category: 'eva', frequency: 8, last_seen: new Date().toISOString(), severity: 'high', description: 'Recent' },
      ];
      const supabase = createMockSupabase({ data: mockData });

      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase });
      expect(result[0].pattern_name).toBe('Recent Pattern');
      expect(result[0].relevance).toBeGreaterThan(result[result.length - 1].relevance);
    });

    it('should return empty array on query error', async () => {
      const supabase = createMockSupabase({ error: { message: 'Connection failed' } });
      const logger = { warn: vi.fn(), debug: vi.fn() };

      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase, logger });
      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return empty array when data is null', async () => {
      const supabase = createMockSupabase({ data: null });
      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase });
      expect(result).toEqual([]);
    });

    it('should return empty array when data is empty', async () => {
      const supabase = createMockSupabase({ data: [] });
      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase });
      expect(result).toEqual([]);
    });

    it('should handle thrown exceptions gracefully', async () => {
      const supabase = {
        from: () => { throw new Error('Unexpected crash'); },
      };
      const logger = { warn: vi.fn(), debug: vi.fn() };

      const result = await findSimilar({ triggerTypes: ['cost_threshold'], supabase, logger });
      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected crash'));
    });
  });

  describe('TRIGGER_CATEGORY_MAP', () => {
    it('should have entries for all 6 trigger types', () => {
      const types = ['cost_threshold', 'new_tech_vendor', 'strategic_pivot', 'low_score', 'novel_pattern', 'constraint_drift'];
      for (const type of types) {
        expect(TRIGGER_CATEGORY_MAP[type]).toBeDefined();
        expect(TRIGGER_CATEGORY_MAP[type].length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('MAX_RESULTS', () => {
    it('should be 5', () => {
      expect(MAX_RESULTS).toBe(5);
    });
  });
});
