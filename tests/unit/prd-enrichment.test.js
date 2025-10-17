/**
 * Unit Tests: PRD Auto-Enrichment
 * SD-KNOWLEDGE-001: US-003 PRD Auto-Enrichment
 *
 * Test Coverage:
 * - Tech stack extraction from requirements
 * - Confidence-based gating (>0.85 auto, 0.7-0.85 review, <0.7 reject)
 * - User story enrichment with implementation context
 * - Overall PRD confidence score calculation
 * - Audit logging
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import PRDEnrichment from '../../scripts/enrich-prd-with-research.js';

vi.mock('@supabase/supabase-js');
vi.mock('../../scripts/automated-knowledge-retrieval.js');

describe('PRDEnrichment', () => {
  let enrichment;
  let mockSupabase;
  let mockKnowledgeRetrieval;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn(),
      single: vi.fn()
    };

    mockKnowledgeRetrieval = {
      research: vi.fn()
    };

    createClient.mockReturnValue(mockSupabase);

    enrichment = new PRDEnrichment('PRD-TEST-001');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadPRD', () => {
    test('should load PRD from database', async () => {
      const mockPRD = {
        id: 'PRD-TEST-001',
        sd_id: 'SD-TEST-001',
        title: 'Test PRD',
        functional_requirements: ['Req 1', 'Req 2'],
        technical_requirements: ['Tech 1']
      };

      mockSupabase.single.mockResolvedValue({ data: mockPRD, error: null });

      const prd = await enrichment.loadPRD();

      expect(prd).toEqual(mockPRD);
      expect(enrichment.sdId).toBe('SD-TEST-001');
    });

    test('should throw error if PRD not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(enrichment.loadPRD()).rejects.toThrow('PRD PRD-TEST-001 not found');
    });
  });

  describe('extractTechStacks', () => {
    test('should extract tech stacks from functional requirements', () => {
      const prd = {
        functional_requirements: [
          'Build React dashboard',
          'Use PostgreSQL database',
          'Implement OAuth authentication'
        ],
        technical_requirements: []
      };

      const techStacks = enrichment.extractTechStacks(prd);

      expect(techStacks).toContain('React');
      expect(techStacks).toContain('PostgreSQL');
      expect(techStacks).toContain('OAuth');
    });

    test('should extract tech stacks from technical requirements', () => {
      const prd = {
        functional_requirements: [],
        technical_requirements: [
          'Deploy on AWS with Docker',
          'Use TypeScript for type safety'
        ]
      };

      const techStacks = enrichment.extractTechStacks(prd);

      expect(techStacks).toContain('AWS');
      expect(techStacks).toContain('Docker');
      expect(techStacks).toContain('TypeScript');
    });

    test('should handle empty requirements', () => {
      const prd = {
        functional_requirements: [],
        technical_requirements: []
      };

      const techStacks = enrichment.extractTechStacks(prd);

      expect(techStacks).toEqual([]);
    });

    test('should deduplicate tech stacks', () => {
      const prd = {
        functional_requirements: ['Use React', 'Build React components'],
        technical_requirements: ['React with TypeScript']
      };

      const techStacks = enrichment.extractTechStacks(prd);

      // Should have React only once
      const reactCount = techStacks.filter(t => t === 'React').length;
      expect(reactCount).toBe(1);
    });
  });

  describe('Confidence-Based Gating', () => {
    beforeEach(() => {
      enrichment.sdId = 'SD-TEST-001';
    });

    test('should auto-apply when confidence >= 0.85', async () => {
      const mockUserStory = {
        story_key: 'SD-TEST-001:US-001',
        title: 'React Dashboard',
        user_want: 'build dashboard with React'
      };

      const mockResearchResults = {
        React: {
          results: [{ code_snippet: 'Example code', confidence_score: 0.9 }],
          confidence: 0.9
        }
      };

      mockSupabase.update.mockResolvedValue({ error: null });

      await enrichment.enrichUserStories([mockUserStory], mockResearchResults);

      expect(enrichment.enrichmentResults.userStoriesEnriched).toBe(1);
      expect(enrichment.enrichmentResults.userStoriesFlagged).toBe(0);
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          implementation_context: expect.objectContaining({
            auto_applied: true,
            requires_review: false
          })
        })
      );
    });

    test('should flag for review when confidence 0.7-0.85', async () => {
      const mockUserStory = {
        story_key: 'SD-TEST-001:US-002',
        title: 'Vue Component',
        user_want: 'create component with Vue'
      };

      const mockResearchResults = {
        Vue: {
          results: [{ code_snippet: 'Example', confidence_score: 0.75 }],
          confidence: 0.75
        }
      };

      mockSupabase.update.mockResolvedValue({ error: null });

      await enrichment.enrichUserStories([mockUserStory], mockResearchResults);

      expect(enrichment.enrichmentResults.userStoriesFlagged).toBe(1);
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          implementation_context: expect.objectContaining({
            auto_applied: false,
            requires_review: true
          })
        })
      );
    });

    test('should reject when confidence < 0.7', async () => {
      const mockUserStory = {
        story_key: 'SD-TEST-001:US-003',
        title: 'Unknown Tech',
        user_want: 'use unknown technology'
      };

      const mockResearchResults = {
        Unknown: {
          results: [{ code_snippet: 'Low quality', confidence_score: 0.5 }],
          confidence: 0.5
        }
      };

      mockSupabase.update.mockResolvedValue({ error: null });

      await enrichment.enrichUserStories([mockUserStory], mockResearchResults);

      expect(enrichment.enrichmentResults.userStoriesRejected).toBe(1);
      // Should NOT call update for rejected stories
      expect(mockSupabase.update).not.toHaveBeenCalled();
    });
  });

  describe('Implementation Context Enrichment', () => {
    test('should populate implementation_context with research results', async () => {
      const mockUserStory = {
        story_key: 'SD-TEST-001:US-004',
        title: 'GraphQL API',
        user_want: 'implement GraphQL endpoint'
      };

      const mockResearchResults = {
        GraphQL: {
          results: [
            {
              code_snippet: 'Example GraphQL schema definition',
              confidence_score: 0.95
            }
          ],
          confidence: 0.95
        }
      };

      mockSupabase.update.mockResolvedValue({ error: null });

      await enrichment.enrichUserStories([mockUserStory], mockResearchResults);

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          implementation_context: expect.objectContaining({
            patterns: expect.arrayContaining([
              expect.stringContaining('GraphQL schema')
            ]),
            confidence_score: 0.95,
            enriched_at: expect.any(String)
          })
        })
      );
    });
  });

  describe('Overall Confidence Calculation', () => {
    test('should calculate average confidence across all tech stacks', () => {
      const researchResults = {
        React: { results: [], confidence: 0.9 },
        TypeScript: { results: [], confidence: 0.85 },
        PostgreSQL: { results: [], confidence: 0.95 }
      };

      const overall = enrichment.calculateOverallConfidence(researchResults);

      expect(overall).toBeCloseTo(0.9, 2); // (0.9 + 0.85 + 0.95) / 3
    });

    test('should return 0 for empty research results', () => {
      const overall = enrichment.calculateOverallConfidence({});

      expect(overall).toBe(0);
    });
  });

  describe('PRD Confidence Score Update', () => {
    test('should update PRD with research confidence score', async () => {
      mockSupabase.update.mockResolvedValue({ error: null });

      await enrichment.updatePRDConfidence(0.88);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        research_confidence_score: 0.88
      });
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'PRD-TEST-001');
    });

    test('should handle database errors gracefully', async () => {
      mockSupabase.update.mockResolvedValue({
        error: { message: 'Update failed' }
      });

      // Should not throw
      await expect(enrichment.updatePRDConfidence(0.75)).resolves.not.toThrow();
    });
  });

  describe('Keyword Extraction', () => {
    test('should extract React keywords', () => {
      const keywords = enrichment.extractKeywords('Build dashboard with React and Vue');

      expect(keywords).toContain('React');
      expect(keywords).toContain('Vue');
    });

    test('should extract database keywords', () => {
      const keywords = enrichment.extractKeywords('Use PostgreSQL and MongoDB');

      expect(keywords).toContain('PostgreSQL');
      expect(keywords).toContain('MongoDB');
    });

    test('should extract auth keywords', () => {
      const keywords = enrichment.extractKeywords('Implement OAuth and JWT authentication');

      expect(keywords).toContain('OAuth');
      expect(keywords).toContain('JWT');
    });

    test('should be case-insensitive', () => {
      const keywords = enrichment.extractKeywords('use REACT and react');

      expect(keywords.filter(k => k.toLowerCase() === 'react').length).toBeGreaterThan(0);
    });

    test('should return empty array for no matches', () => {
      const keywords = enrichment.extractKeywords('Some random text without tech');

      expect(keywords).toEqual([]);
    });
  });

  describe('End-to-End Enrichment', () => {
    test('should complete full enrichment workflow', async () => {
      // Mock PRD load
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'PRD-TEST-001',
          sd_id: 'SD-TEST-001',
          title: 'Test',
          functional_requirements: ['Use React'],
          technical_requirements: []
        },
        error: null
      });

      // Mock user stories load
      mockSupabase.eq.mockResolvedValueOnce({
        data: [
          {
            story_key: 'SD-TEST-001:US-001',
            title: 'React Component',
            user_want: 'create React component'
          }
        ],
        error: null
      });

      // Mock research (via KnowledgeRetrieval)
      vi.doMock('../../scripts/automated-knowledge-retrieval.js', () => ({
        default: vi.fn().mockImplementation(() => ({
          research: vi.fn().mockResolvedValue([
            {
              source: 'local',
              code_snippet: 'Example React code',
              confidence_score: 0.9
            }
          ])
        }))
      }));

      // Mock updates
      mockSupabase.update.mockResolvedValue({ error: null });

      const results = await enrichment.enrich();

      expect(results.userStoriesEnriched).toBeGreaterThan(0);
      expect(results.overallConfidence).toBeGreaterThan(0);
    });
  });
});
