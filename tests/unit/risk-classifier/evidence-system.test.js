/**
 * Evidence System Unit Tests
 * Phase 4: SD-LEO-SELF-IMPROVE-EVIDENCE-001
 *
 * Tests evidence accumulation, persistence, and recurrence detection
 */

import { vi } from 'vitest';
import {
  EvidenceSystem,
  createEvidenceSystem,
  EVIDENCE_SOURCE,
  EVIDENCE_QUALITY
} from '../../../scripts/modules/risk-classifier/evidence-system.js';

describe('EvidenceSystem', () => {
  let system;

  beforeEach(() => {
    system = createEvidenceSystem();
  });

  describe('accumulateEvidence', () => {
    it('should create evidence record with unique ID', () => {
      const source = {
        type: EVIDENCE_SOURCE.RETROSPECTIVE,
        id: 'retro-001',
        metadata: { session_id: 'sess-001' }
      };
      const improvement = { id: 'imp-001' };

      const evidence = system.accumulateEvidence(source, improvement);

      expect(evidence.id).toMatch(/^ev-\d+-[a-z0-9]+$/);
      expect(evidence.improvement_id).toBe('imp-001');
      expect(evidence.source_type).toBe(EVIDENCE_SOURCE.RETROSPECTIVE);
      expect(evidence.source_id).toBe('retro-001');
    });

    it('should calculate quality score based on source type', () => {
      const retroSource = { type: EVIDENCE_SOURCE.RETROSPECTIVE, id: 'r1' };
      const patternSource = { type: EVIDENCE_SOURCE.ISSUE_PATTERN, id: 'p1' };
      const manualSource = { type: EVIDENCE_SOURCE.MANUAL, id: 'm1' };

      const retroEvidence = system.accumulateEvidence(retroSource, { id: '1' });
      const patternEvidence = system.accumulateEvidence(patternSource, { id: '2' });
      const manualEvidence = system.accumulateEvidence(manualSource, { id: '3' });

      // Retrospective should have highest base score
      expect(retroEvidence.quality_score).toBeGreaterThan(patternEvidence.quality_score);
      expect(patternEvidence.quality_score).toBeGreaterThan(manualEvidence.quality_score);
    });

    it('should check recurrence for issue pattern sources', () => {
      const source = { type: EVIDENCE_SOURCE.ISSUE_PATTERN, id: 'pattern-001' };

      // Accumulate same pattern multiple times
      system.accumulateEvidence(source, { id: '1' });
      system.accumulateEvidence(source, { id: '2' });
      const third = system.accumulateEvidence(source, { id: '3' });

      expect(third.recurrence_count).toBe(2); // Cache has 2 previous
    });

    it('should mark as recurring when threshold met', () => {
      const source = { type: EVIDENCE_SOURCE.ISSUE_PATTERN, id: 'recurring-pattern' };

      // Accumulate up to threshold (default 3)
      system.accumulateEvidence(source, { id: '1' });
      system.accumulateEvidence(source, { id: '2' });
      system.accumulateEvidence(source, { id: '3' });
      const fourth = system.accumulateEvidence(source, { id: '4' });

      expect(fourth.is_recurring).toBe(true);
    });

    it('should cache evidence records', () => {
      system.accumulateEvidence(
        { type: EVIDENCE_SOURCE.MANUAL, id: 'test' },
        { id: 'imp-001' }
      );

      const stats = system.getCacheStats();
      expect(stats.total_cached).toBe(1);
      expect(stats.by_source[EVIDENCE_SOURCE.MANUAL]).toBe(1);
    });

    it('should handle null source gracefully', () => {
      const evidence = system.accumulateEvidence(null, { id: 'imp-001' });

      expect(evidence.source_type).toBe(EVIDENCE_SOURCE.MANUAL);
      expect(evidence.quality_score).toBe(30); // Minimum score for null
    });

    it('should handle null improvement gracefully', () => {
      const evidence = system.accumulateEvidence(
        { type: EVIDENCE_SOURCE.RETROSPECTIVE, id: 'r1' },
        null
      );

      expect(evidence.improvement_id).toBeUndefined();
    });

    it('should boost quality score for rich metadata', () => {
      const leanSource = { type: EVIDENCE_SOURCE.MANUAL, id: 'm1' };
      const richSource = {
        type: EVIDENCE_SOURCE.MANUAL,
        id: 'm2',
        metadata: { key1: 'v1', key2: 'v2', key3: 'v3', key4: 'v4', key5: 'v5' }
      };

      const leanEvidence = system.accumulateEvidence(leanSource, { id: '1' });
      const richEvidence = system.accumulateEvidence(richSource, { id: '2' });

      expect(richEvidence.quality_score).toBeGreaterThan(leanEvidence.quality_score);
    });
  });

  describe('persistEligibilityDecision', () => {
    it('should return not persisted when no supabase client', async () => {
      const decision = { decision: 'ELIGIBLE', recommendation: { action: 'APPROVE' } };
      const improvement = { id: 'imp-001' };
      const scores = { overall: 90, safety: 10 };

      const result = await system.persistEligibilityDecision(decision, improvement, scores);

      expect(result.persisted).toBe(false);
      expect(result.reason).toBe('no_database');
    });

    it('should persist to database when supabase client provided', async () => {
      const mockData = { id: 'record-001' };
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockData, error: null })
      };

      const systemWithDb = createEvidenceSystem({ supabase: mockSupabase });

      const decision = {
        decision: 'ELIGIBLE',
        recommendation: { action: 'APPROVE', confidence: 'HIGH', human_review: false },
        classification: { tier: 'AUTO', rule: 'RULE-007' },
        checks: [{ check: 'tier', passed: true }]
      };
      const improvement = { id: 'imp-001' };
      const scores = { overall: 90, safety: 10, criteria: { safety: 10 } };

      const result = await systemWithDb.persistEligibilityDecision(decision, improvement, scores);

      expect(result.persisted).toBe(true);
      expect(result.id).toBe('record-001');
      expect(mockSupabase.from).toHaveBeenCalledWith('improvement_quality_assessments');
    });

    it('should handle database errors gracefully', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } })
      };

      const systemWithDb = createEvidenceSystem({ supabase: mockSupabase });
      const result = await systemWithDb.persistEligibilityDecision({}, {}, {});

      expect(result.persisted).toBe(false);
      expect(result.reason).toBe('Insert failed');
    });
  });

  describe('getEvidenceForImprovement', () => {
    it('should return cached evidence when no database', async () => {
      // Add some evidence to cache
      system.accumulateEvidence(
        { type: EVIDENCE_SOURCE.RETROSPECTIVE, id: 'r1' },
        { id: 'imp-001' }
      );
      system.accumulateEvidence(
        { type: EVIDENCE_SOURCE.ISSUE_PATTERN, id: 'p1' },
        { id: 'imp-001' }
      );
      system.accumulateEvidence(
        { type: EVIDENCE_SOURCE.MANUAL, id: 'm1' },
        { id: 'imp-002' } // Different improvement
      );

      const evidence = await system.getEvidenceForImprovement('imp-001');

      expect(evidence).toHaveLength(2);
      expect(evidence.every(e => e.improvement_id === 'imp-001')).toBe(true);
    });

    it('should combine cached and database evidence', async () => {
      const dbEvidence = [{ id: 'db-ev-001', improvement_id: 'imp-001' }];
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: dbEvidence, error: null })
      };

      const systemWithDb = createEvidenceSystem({ supabase: mockSupabase });

      // Add cached evidence
      systemWithDb.accumulateEvidence(
        { type: EVIDENCE_SOURCE.MANUAL, id: 'm1' },
        { id: 'imp-001' }
      );

      const evidence = await systemWithDb.getEvidenceForImprovement('imp-001');

      expect(evidence.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('detectRecurrence', () => {
    it('should return no recurrence when no database', async () => {
      const result = await system.detectRecurrence('pattern-001');

      expect(result.is_recurring).toBe(false);
      expect(result.count).toBe(0);
      expect(result.reason).toBe('no_database');
    });

    it('should detect recurrence from retrospectives', async () => {
      const retros = [
        { id: 'r1', created_at: '2026-01-20', quality_score: 80 },
        { id: 'r2', created_at: '2026-01-19', quality_score: 75 },
        { id: 'r3', created_at: '2026-01-18', quality_score: 70 }
      ];

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: retros, error: null })
      };

      const systemWithDb = createEvidenceSystem({ supabase: mockSupabase });
      const result = await systemWithDb.detectRecurrence('pattern-001');

      expect(result.is_recurring).toBe(true);
      expect(result.count).toBe(3);
      expect(result.recommendation).toContain('higher priority');
    });

    it('should not flag as recurring below threshold', async () => {
      const retros = [
        { id: 'r1', created_at: '2026-01-20', quality_score: 80 }
      ];

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: retros, error: null })
      };

      const systemWithDb = createEvidenceSystem({ supabase: mockSupabase });
      const result = await systemWithDb.detectRecurrence('pattern-001');

      expect(result.is_recurring).toBe(false);
      expect(result.count).toBe(1);
      expect(result.recommendation).toContain('monitor');
    });
  });

  describe('calculateEvidenceScore', () => {
    it('should calculate composite score based on multiple factors', () => {
      const evidence = {
        source_type: EVIDENCE_SOURCE.RETROSPECTIVE,
        source_id: 'retro-001',
        source_metadata: { key: 'value' },
        accumulated_at: new Date().toISOString(),
        recurrence_count: 2,
        citations: ['cite-1', 'cite-2']
      };

      const score = system.calculateEvidenceScore(evidence);

      expect(score).toBeGreaterThan(50);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should give higher score to retrospective sources', () => {
      const retroEvidence = {
        source_type: EVIDENCE_SOURCE.RETROSPECTIVE,
        source_id: 'r1',
        source_metadata: {},
        accumulated_at: new Date().toISOString()
      };

      const manualEvidence = {
        source_type: EVIDENCE_SOURCE.MANUAL,
        source_id: 'm1',
        source_metadata: {},
        accumulated_at: new Date().toISOString()
      };

      expect(system.calculateEvidenceScore(retroEvidence))
        .toBeGreaterThan(system.calculateEvidenceScore(manualEvidence));
    });

    it('should boost score for recurrence', () => {
      const baseEvidence = {
        source_type: EVIDENCE_SOURCE.ISSUE_PATTERN,
        source_id: 'p1',
        source_metadata: {},
        accumulated_at: new Date().toISOString(),
        recurrence_count: 0
      };

      const recurringEvidence = {
        ...baseEvidence,
        recurrence_count: 5
      };

      expect(system.calculateEvidenceScore(recurringEvidence))
        .toBeGreaterThan(system.calculateEvidenceScore(baseEvidence));
    });

    it('should apply freshness decay for old evidence', () => {
      const freshEvidence = {
        source_type: EVIDENCE_SOURCE.MANUAL,
        source_id: 'm1',
        source_metadata: {},
        accumulated_at: new Date().toISOString()
      };

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30); // 30 days old

      const staleEvidence = {
        ...freshEvidence,
        accumulated_at: oldDate.toISOString()
      };

      expect(system.calculateEvidenceScore(freshEvidence))
        .toBeGreaterThan(system.calculateEvidenceScore(staleEvidence));
    });

    it('should boost score for citations', () => {
      const baseEvidence = {
        source_type: EVIDENCE_SOURCE.MANUAL,
        source_id: 'm1',
        source_metadata: {},
        accumulated_at: new Date().toISOString(),
        citations: []
      };

      const citedEvidence = {
        ...baseEvidence,
        citations: ['cite-1', 'cite-2', 'cite-3']
      };

      expect(system.calculateEvidenceScore(citedEvidence))
        .toBeGreaterThan(system.calculateEvidenceScore(baseEvidence));
    });
  });

  describe('getQualityLevel', () => {
    it('should return HIGH for scores >= 80', () => {
      expect(system.getQualityLevel(80)).toEqual(EVIDENCE_QUALITY.HIGH);
      expect(system.getQualityLevel(100)).toEqual(EVIDENCE_QUALITY.HIGH);
    });

    it('should return MEDIUM for scores 50-79', () => {
      expect(system.getQualityLevel(50)).toEqual(EVIDENCE_QUALITY.MEDIUM);
      expect(system.getQualityLevel(79)).toEqual(EVIDENCE_QUALITY.MEDIUM);
    });

    it('should return LOW for scores < 50', () => {
      expect(system.getQualityLevel(0)).toEqual(EVIDENCE_QUALITY.LOW);
      expect(system.getQualityLevel(49)).toEqual(EVIDENCE_QUALITY.LOW);
    });
  });

  describe('buildEvidenceSummary', () => {
    it('should return empty summary for no evidence', () => {
      const summary = system.buildEvidenceSummary({ id: 'imp-001' }, []);

      expect(summary.total_evidence).toBe(0);
      expect(summary.quality_score).toBe(0);
      expect(summary.quality_level).toEqual(EVIDENCE_QUALITY.LOW);
      expect(summary.recommendation).toContain('manual review');
    });

    it('should calculate aggregate statistics', () => {
      const evidence = [
        {
          source_type: EVIDENCE_SOURCE.RETROSPECTIVE,
          source_id: 'r1',
          source_metadata: {},
          accumulated_at: new Date().toISOString(),
          recurrence_count: 2,
          is_recurring: true
        },
        {
          source_type: EVIDENCE_SOURCE.ISSUE_PATTERN,
          source_id: 'p1',
          source_metadata: {},
          accumulated_at: new Date().toISOString(),
          recurrence_count: 0
        }
      ];

      const summary = system.buildEvidenceSummary({ id: 'imp-001' }, evidence);

      expect(summary.total_evidence).toBe(2);
      expect(summary.is_recurring).toBe(true);
      expect(summary.max_recurrence).toBe(2);
      expect(summary.sources[EVIDENCE_SOURCE.RETROSPECTIVE]).toBe(1);
      expect(summary.sources[EVIDENCE_SOURCE.ISSUE_PATTERN]).toBe(1);
    });

    it('should provide appropriate recommendations', () => {
      // Create high-quality recurring evidence
      const highQualityEvidence = [
        {
          source_type: EVIDENCE_SOURCE.RETROSPECTIVE,
          source_id: 'r1',
          source_metadata: { a: 1, b: 2, c: 3 },
          accumulated_at: new Date().toISOString(),
          recurrence_count: 5,
          is_recurring: true,
          citations: ['c1', 'c2', 'c3', 'c4']
        }
      ];

      const summary = system.buildEvidenceSummary({ id: 'imp-001' }, highQualityEvidence);

      // High quality + recurring = prioritize this improvement
      expect(summary.recommendation).toContain('prioritize');
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      system.accumulateEvidence(
        { type: EVIDENCE_SOURCE.MANUAL, id: 'm1' },
        { id: 'imp-001' }
      );

      expect(system.getCacheStats().total_cached).toBe(1);

      system.clearCache();

      expect(system.getCacheStats().total_cached).toBe(0);
    });

    it('should track cache stats by source type', () => {
      system.accumulateEvidence({ type: EVIDENCE_SOURCE.RETROSPECTIVE, id: 'r1' }, { id: '1' });
      system.accumulateEvidence({ type: EVIDENCE_SOURCE.RETROSPECTIVE, id: 'r2' }, { id: '2' });
      system.accumulateEvidence({ type: EVIDENCE_SOURCE.ISSUE_PATTERN, id: 'p1' }, { id: '3' });

      const stats = system.getCacheStats();

      expect(stats.total_cached).toBe(3);
      expect(stats.by_source[EVIDENCE_SOURCE.RETROSPECTIVE]).toBe(2);
      expect(stats.by_source[EVIDENCE_SOURCE.ISSUE_PATTERN]).toBe(1);
    });
  });

  describe('custom configuration', () => {
    it('should allow custom recurrence threshold', () => {
      const customSystem = createEvidenceSystem({ recurrenceThreshold: 5 });
      const source = { type: EVIDENCE_SOURCE.ISSUE_PATTERN, id: 'pattern-001' };

      // Accumulate 5 times (below threshold of 5 - need 5+ to be recurring)
      customSystem.accumulateEvidence(source, { id: '1' });
      customSystem.accumulateEvidence(source, { id: '2' });
      customSystem.accumulateEvidence(source, { id: '3' });
      customSystem.accumulateEvidence(source, { id: '4' });
      const fifth = customSystem.accumulateEvidence(source, { id: '5' });

      expect(fifth.is_recurring).toBeFalsy(); // Recurrence count is 4 (previous items), threshold is 5

      const sixth = customSystem.accumulateEvidence(source, { id: '6' });
      expect(sixth.is_recurring).toBe(true); // Recurrence count is 5, at threshold
    });

    it('should accept custom logger', async () => {
      const customLogger = {
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      };

      const customSystem = createEvidenceSystem({ logger: customLogger });

      // Trigger a warn (no database)
      await customSystem.persistEligibilityDecision({}, {}, {});

      expect(customLogger.warn).toHaveBeenCalled();
    });
  });
});

describe('Module exports', () => {
  it('should export EVIDENCE_SOURCE constants', () => {
    expect(EVIDENCE_SOURCE.RETROSPECTIVE).toBe('retrospective');
    expect(EVIDENCE_SOURCE.ISSUE_PATTERN).toBe('issue_pattern');
    expect(EVIDENCE_SOURCE.MANUAL).toBe('manual');
    expect(EVIDENCE_SOURCE.AI_GENERATED).toBe('ai_generated');
  });

  it('should export EVIDENCE_QUALITY levels', () => {
    expect(EVIDENCE_QUALITY.HIGH.min).toBe(80);
    expect(EVIDENCE_QUALITY.MEDIUM.min).toBe(50);
    expect(EVIDENCE_QUALITY.LOW.min).toBe(0);
  });

  it('should export createEvidenceSystem factory', () => {
    const system = createEvidenceSystem();
    expect(system).toBeInstanceOf(EvidenceSystem);
  });
});
