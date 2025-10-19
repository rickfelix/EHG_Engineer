/**
 * Unit Tests: Automated Knowledge Retrieval
 * SD-KNOWLEDGE-001: US-001, US-002, US-005
 *
 * Test Coverage:
 * - Local retrospective search (<2s target)
 * - Context7 fallback logic (threshold: <3 local results)
 * - Token budget enforcement (5k/query, 15k/PRD)
 * - Cache TTL (24 hours)
 * - Result ranking by confidence
 * - Audit logging
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import KnowledgeRetrieval from '../../scripts/automated-knowledge-retrieval.js';

vi.mock('@supabase/supabase-js');
vi.mock('../../scripts/context7-circuit-breaker.js');

describe('KnowledgeRetrieval', () => {
  let retrieval;
  let mockSupabase;
  let mockCircuitBreaker;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      upsert: vi.fn(),
      insert: vi.fn()
    };

    mockCircuitBreaker = {
      allowRequest: vi.fn(),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStateForLogging: vi.fn().mockResolvedValue('closed')
    };

    createClient.mockReturnValue(mockSupabase);

    // Mock CircuitBreaker import
    vi.doMock('../../scripts/context7-circuit-breaker.js', () => ({
      default: vi.fn(() => mockCircuitBreaker)
    }));

    retrieval = new KnowledgeRetrieval('SD-KNOWLEDGE-001');
    retrieval.circuitBreaker = mockCircuitBreaker;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchRetrospectives', () => {
    test('should return local results in <2 seconds', async () => {
      const mockRetros = [
        {
          sd_id: 'SD-OLD-001',
          lessons_learned: 'OAuth implementation worked well',
          what_went_well: 'Easy integration',
          what_went_wrong: null,
          tech_stack: 'OAuth 2.0'
        }
      ];

      mockSupabase.limit.mockResolvedValue({ data: mockRetros, error: null });

      const startTime = Date.now();
      const results = await retrieval.searchRetrospectives('OAuth');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('local');
      expect(results[0].confidence_score).toBe(0.85);
    });

    test('should handle empty results gracefully', async () => {
      mockSupabase.limit.mockResolvedValue({ data: [], error: null });

      const results = await retrieval.searchRetrospectives('NonexistentTech');

      expect(results).toEqual([]);
    });

    test('should handle database errors', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const results = await retrieval.searchRetrospectives('OAuth');

      expect(results).toEqual([]);
    });

    test('should transform retrospectives to standard format', async () => {
      const mockRetros = [
        {
          sd_id: 'SD-OLD-001',
          lessons_learned: 'Test lesson',
          what_went_well: 'Good things',
          what_went_wrong: 'Bad things',
          tech_stack: 'React'
        }
      ];

      mockSupabase.limit.mockResolvedValue({ data: mockRetros, error: null });

      const results = await retrieval.searchRetrospectives('React');

      expect(results[0]).toMatchObject({
        source: 'local',
        tech_stack: 'React',
        code_snippet: 'Test lesson',
        pros_cons_analysis: {
          pros: ['Good things'],
          cons: ['Bad things']
        },
        confidence_score: 0.85
      });
    });
  });

  describe('Context7 Fallback Logic', () => {
    test('should trigger Context7 when local results < 3', async () => {
      // Mock local results: only 2
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{}, {}], // 2 results
        error: null
      });

      mockCircuitBreaker.allowRequest.mockResolvedValue(true);
      mockCircuitBreaker.recordSuccess.mockResolvedValue();

      // Mock cache check
      mockSupabase.gt.mockResolvedValue({ data: null, error: null });
      // Mock cache write
      mockSupabase.upsert.mockResolvedValue({ error: null });
      // Mock audit log
      mockSupabase.insert.mockResolvedValue({ error: null });

      await retrieval.research('RareTech');

      expect(mockCircuitBreaker.allowRequest).toHaveBeenCalled();
    });

    test('should skip Context7 when local results >= 3', async () => {
      // Mock local results: 5 results
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{}, {}, {}, {}, {}], // 5 results
        error: null
      });

      // Mock cache check
      mockSupabase.gt.mockResolvedValue({ data: null, error: null });
      // Mock cache write
      mockSupabase.upsert.mockResolvedValue({ error: null });
      // Mock audit log
      mockSupabase.insert.mockResolvedValue({ error: null });

      await retrieval.research('PopularTech');

      expect(mockCircuitBreaker.allowRequest).not.toHaveBeenCalled();
    });

    test('should degrade gracefully when circuit breaker blocks Context7', async () => {
      // 2 local results
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{}, {}],
        error: null
      });

      mockCircuitBreaker.allowRequest.mockResolvedValue(false);

      // Mock cache and audit
      mockSupabase.gt.mockResolvedValue({ data: null, error: null });
      mockSupabase.upsert.mockResolvedValue({ error: null });
      mockSupabase.insert.mockResolvedValue({ error: null });

      const results = await retrieval.research('BlockedTech');

      // Should return only local results
      expect(results).toHaveLength(2);
    });
  });

  describe('Caching', () => {
    test('should return cached results when TTL is valid', async () => {
      const mockCached = [
        { tech_stack: 'React', confidence_score: 0.9, source: 'local' }
      ];

      mockSupabase.gt.mockResolvedValue({ data: mockCached, error: null });
      mockSupabase.insert.mockResolvedValue({ error: null });

      const results = await retrieval.research('React');

      expect(results).toEqual(mockCached);
      // Should NOT query retrospectives
      expect(mockSupabase.or).not.toHaveBeenCalled();
    });

    test('should cache new results with 24-hour TTL', async () => {
      const mockRetros = [{ sd_id: 'SD-001', lessons_learned: 'Test', tech_stack: 'Vue' }];

      mockSupabase.limit.mockResolvedValue({ data: mockRetros, error: null });
      mockSupabase.gt.mockResolvedValue({ data: null, error: null }); // No cache
      mockSupabase.upsert.mockResolvedValue({ error: null });
      mockSupabase.insert.mockResolvedValue({ error: null });

      await retrieval.research('Vue');

      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tech_stack: 'Vue',
            expires_at: expect.any(String)
          })
        ]),
        expect.any(Object)
      );
    });

    test('should respect forceRefresh option', async () => {
      mockSupabase.limit.mockResolvedValue({ data: [], error: null });
      mockSupabase.gt.mockResolvedValue({
        data: [{ cached: true }],
        error: null
      });
      mockSupabase.upsert.mockResolvedValue({ error: null });
      mockSupabase.insert.mockResolvedValue({ error: null });

      await retrieval.research('CachedTech', { forceRefresh: true });

      // Should query database even though cache exists
      expect(mockSupabase.or).toHaveBeenCalled();
    });
  });

  describe('Token Budget Enforcement', () => {
    test('should track token consumption', async () => {
      mockSupabase.limit.mockResolvedValue({ data: [{}], error: null });
      mockSupabase.gt.mockResolvedValue({ data: null, error: null });
      mockSupabase.upsert.mockResolvedValue({ error: null });
      mockSupabase.insert.mockResolvedValue({ error: null });

      await retrieval.research('TestTech');

      expect(retrieval.totalTokens).toBeGreaterThan(0);
    });

    test('checkTokenBudget should warn when budget exceeded', () => {
      retrieval.totalTokens = 4900;

      const canContinue = retrieval.checkTokenBudget(200);

      expect(canContinue).toBe(false);
    });
  });

  describe('Audit Logging', () => {
    test('should log all research operations', async () => {
      mockSupabase.limit.mockResolvedValue({ data: [], error: null });
      mockSupabase.gt.mockResolvedValue({ data: null, error: null });
      mockSupabase.upsert.mockResolvedValue({ error: null });
      mockSupabase.insert.mockResolvedValue({ error: null });

      await retrieval.research('LoggedTech');

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          sd_id: 'SD-KNOWLEDGE-001',
          query_type: expect.any(String),
          tokens_consumed: expect.any(Number),
          execution_time_ms: expect.any(Number)
        })
      );
    });
  });

  describe('Result Ranking', () => {
    test('should return top 5 results sorted by confidence', async () => {
      const mockRetros = Array(10).fill(null).map((_, i) => ({
        sd_id: `SD-${i}`,
        lessons_learned: `Lesson ${i}`,
        tech_stack: 'Test'
      }));

      mockSupabase.limit.mockResolvedValue({ data: mockRetros, error: null });
      mockSupabase.gt.mockResolvedValue({ data: null, error: null });
      mockSupabase.upsert.mockResolvedValue({ error: null });
      mockSupabase.insert.mockResolvedValue({ error: null });

      const results = await retrieval.research('Test', { maxResults: 5 });

      expect(results).toHaveLength(5);
    });
  });
});
