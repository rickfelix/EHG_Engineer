/**
 * Tests for Competitive Intelligence Service (CLI Port)
 * SD-LEO-FEAT-SERVICE-PORTS-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompetitiveIntelligenceService } from '../../../lib/eva/services/competitive-intelligence.js';

function createMockSupabase({ invokeData = null, invokeError = null, queryData = [], queryError = null } = {}) {
  return {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: invokeData, error: invokeError }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: queryData[0] || null, error: queryError }),
        }),
        in: vi.fn().mockResolvedValue({ data: queryData, error: queryError }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: queryError }),
    }),
  };
}

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() };
}

const sampleCompetitors = [
  { id: 'c1', name: 'Leader', marketShareEstimate: 30, strengths: ['Strong'], weaknesses: ['Slow'] },
  { id: 'c2', name: 'Newcomer', marketShareEstimate: 8, strengths: ['Fast'], weaknesses: ['Small'] },
];

const sampleFeatures = [
  { key: 'analytics', label: 'Analytics Dashboard', category: 'core', weight: 1 },
  { key: 'ai', label: 'AI Insights', category: 'moat', weight: 2 },
];

const sampleCoverage = [
  { featureKey: 'analytics', competitorId: 'c1', coverage: 'advanced' },
  { featureKey: 'ai', competitorId: 'c1', coverage: 'none' },
];

describe('CompetitiveIntelligenceService', () => {
  let service;
  let mockSupabase;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
  });

  it('requires supabase client', () => {
    expect(() => new CompetitiveIntelligenceService(null)).toThrow('Supabase client is required');
  });

  describe('generateAnalysis', () => {
    it('calls Edge Function and returns data on success', async () => {
      const aiResult = { competitiveLandscape: {}, strategicInsights: {}, recommendations: {}, confidenceScore: 0.9 };
      mockSupabase = createMockSupabase({ invokeData: aiResult });
      service = new CompetitiveIntelligenceService(mockSupabase, { logger: mockLogger });

      const result = await service.generateAnalysis({}, sampleCompetitors, sampleFeatures, sampleCoverage);

      expect(result).toEqual(aiResult);
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('competitive-intelligence', expect.objectContaining({
        body: expect.objectContaining({ action: 'analyze' }),
      }));
    });

    it('falls back to local analysis on Edge Function error', async () => {
      mockSupabase = createMockSupabase({ invokeError: new Error('Edge Function unavailable') });
      service = new CompetitiveIntelligenceService(mockSupabase, { logger: mockLogger });

      const result = await service.generateAnalysis({}, sampleCompetitors, sampleFeatures, sampleCoverage);

      expect(result.confidenceScore).toBe(0.6);
      expect(result.competitiveLandscape.marketLeaders).toContain('Leader');
      expect(result.competitiveLandscape.emergingThreats).toContain('Newcomer');
    });
  });

  describe('generateFallbackAnalysis', () => {
    it('identifies market leaders (>20% share)', () => {
      mockSupabase = createMockSupabase();
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = service.generateFallbackAnalysis(sampleCompetitors, sampleFeatures, sampleCoverage);
      expect(result.competitiveLandscape.marketLeaders).toEqual(['Leader']);
    });

    it('identifies emerging threats (5-20% share)', () => {
      mockSupabase = createMockSupabase();
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = service.generateFallbackAnalysis(sampleCompetitors, sampleFeatures, sampleCoverage);
      expect(result.competitiveLandscape.emergingThreats).toEqual(['Newcomer']);
    });

    it('identifies market gaps (low average coverage)', () => {
      mockSupabase = createMockSupabase();
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = service.generateFallbackAnalysis(sampleCompetitors, sampleFeatures, sampleCoverage);
      // 'ai' has coverage 'none' for c1 only → avg 0 < 1.5 → gap
      expect(result.competitiveLandscape.marketGaps).toContain('AI Insights');
    });

    it('handles empty inputs gracefully', () => {
      mockSupabase = createMockSupabase();
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = service.generateFallbackAnalysis([], [], []);
      expect(result.competitiveLandscape.marketLeaders).toEqual([]);
      expect(result.confidenceScore).toBe(0.6);
    });
  });

  describe('saveAnalysis', () => {
    it('upserts strategies to market_defense_strategies', async () => {
      mockSupabase = createMockSupabase();
      service = new CompetitiveIntelligenceService(mockSupabase);

      await service.saveAnalysis('idea-1', {
        strategicRecommendations: ['Do X', 'Do Y'],
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('market_defense_strategies');
    });

    it('skips upsert when no recommendations', async () => {
      mockSupabase = createMockSupabase();
      service = new CompetitiveIntelligenceService(mockSupabase);

      await service.saveAnalysis('idea-1', { strategicRecommendations: [] });
      // from() should not have been called since strategies array is empty
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('generateKPIAnalysis', () => {
    it('returns Edge Function data on success', async () => {
      const kpiData = { kpis: [], insights: ['insight1'] };
      mockSupabase = createMockSupabase({ invokeData: kpiData });
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = await service.generateKPIAnalysis('v-1', sampleCompetitors);
      expect(result).toEqual(kpiData);
    });

    it('returns fallback KPI data on error', async () => {
      mockSupabase = createMockSupabase({ invokeError: new Error('fail') });
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = await service.generateKPIAnalysis('v-1', sampleCompetitors);
      expect(result.kpis).toHaveLength(2);
      expect(result.insights).toBeDefined();
    });
  });

  describe('generateOpportunitySignals', () => {
    it('returns Edge Function data on success', async () => {
      const signalData = { signals: [{ type: 'custom' }] };
      mockSupabase = createMockSupabase({ invokeData: signalData });
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = await service.generateOpportunitySignals('v-1', sampleCompetitors);
      expect(result).toEqual(signalData);
    });

    it('returns fallback signals on error', async () => {
      mockSupabase = createMockSupabase({ invokeError: new Error('fail') });
      service = new CompetitiveIntelligenceService(mockSupabase);

      const result = await service.generateOpportunitySignals('v-1', sampleCompetitors);
      expect(result.signals).toHaveLength(2);
      expect(result.signals[0].type).toBe('market_gap');
    });
  });
});
