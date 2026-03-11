import { describe, it, expect } from 'vitest';
import { mapRecommendationToSD, MAX_SDS_PER_MEETING } from '../../lib/eva/consultant/action-executor.js';

describe('action-executor', () => {
  describe('mapRecommendationToSD', () => {
    it('maps strategic recommendation to feature SD', () => {
      const rec = {
        id: 'rec-001',
        title: 'Improve gate calibration system',
        description: 'Gate pass rates suggest calibration drift',
        recommendation_type: 'strategic',
        priority_score: 0.85,
        application_domain: 'gate_calibration',
        trend_id: 'trend-001',
        confidence_tier: 'high'
      };

      const result = mapRecommendationToSD(rec);
      expect(result.type).toBe('feature');
      expect(result.title).toBe('Improve gate calibration system');
      expect(result.priority).toBe('high');
      expect(result.metadata.source).toBe('eva_recommendation');
      expect(result.metadata.source_id).toBe('rec-001');
      expect(result.metadata.application_domain).toBe('gate_calibration');
    });

    it('maps tactical recommendation to fix SD', () => {
      const rec = {
        id: 'rec-002',
        title: 'Fix recurring test failure pattern',
        recommendation_type: 'tactical',
        priority_score: 0.5,
        application_domain: 'retrospective_mining'
      };

      const result = mapRecommendationToSD(rec);
      expect(result.type).toBe('fix');
      expect(result.priority).toBe('medium');
    });

    it('maps operational recommendation to infrastructure SD', () => {
      const rec = {
        id: 'rec-003',
        title: 'Optimize pipeline scheduling',
        recommendation_type: 'operational',
        priority_score: 0.6
      };

      const result = mapRecommendationToSD(rec);
      expect(result.type).toBe('infrastructure');
    });

    it('maps research recommendation to enhancement SD', () => {
      const rec = {
        id: 'rec-004',
        title: 'Investigate cross-venture patterns',
        recommendation_type: 'research',
        priority_score: 0.4
      };

      const result = mapRecommendationToSD(rec);
      expect(result.type).toBe('enhancement');
      expect(result.priority).toBe('medium');
    });

    it('includes meeting date in metadata', () => {
      const rec = {
        id: 'rec-005',
        title: 'Test',
        recommendation_type: 'tactical',
        priority_score: 0.5
      };

      const result = mapRecommendationToSD(rec);
      expect(result.metadata.meeting_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('rate limiting', () => {
    it('MAX_SDS_PER_MEETING is 5', () => {
      expect(MAX_SDS_PER_MEETING).toBe(5);
    });
  });
});
