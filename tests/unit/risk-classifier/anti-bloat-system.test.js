/**
 * Anti-Bloat System Unit Tests
 * Phase 5: SD-LEO-SELF-IMPROVE-BLOAT-001
 *
 * Tests pipeline health metrics, rejection tracking, and feedback generation
 */

import {
  AntiBloatSystem,
  createAntiBloatSystem,
  REJECTION_CATEGORY,
  HEALTH_THRESHOLDS
} from '../../../scripts/modules/risk-classifier/anti-bloat-system.js';

describe('AntiBloatSystem', () => {
  let system;

  beforeEach(() => {
    system = createAntiBloatSystem();
  });

  describe('trackRejection', () => {
    it('should track a rejection with category', () => {
      const improvement = {
        id: 'imp-001',
        improvement_type: 'CHECKLIST_ITEM',
        target_table: 'leo_protocol_sections',
        target_operation: 'INSERT'
      };

      const decision = {
        decision: 'INELIGIBLE_SCORE',
        scores: { overall: 70, safety: 10 },
        classification: { tier: 'AUTO', rule: 'RULE-007' }
      };

      const rejection = system.trackRejection(
        improvement,
        decision,
        REJECTION_CATEGORY.LOW_SCORE
      );

      expect(rejection.id).toMatch(/^rej-/);
      expect(rejection.improvement_id).toBe('imp-001');
      expect(rejection.category).toBe(REJECTION_CATEGORY.LOW_SCORE);
      expect(rejection.score).toBe(70);
      expect(rejection.safety_score).toBe(10);
      expect(rejection.tier).toBe('AUTO');
    });

    it('should update health metrics on rejection', () => {
      const improvement = { id: 'imp-001' };
      const decision = { scores: { overall: 70 } };

      system.trackRejection(improvement, decision, REJECTION_CATEGORY.LOW_SCORE);
      system.trackRejection(improvement, decision, REJECTION_CATEGORY.LOW_SCORE);
      system.trackRejection(improvement, decision, REJECTION_CATEGORY.TIER_MISMATCH);

      const health = system.getPipelineHealth();

      expect(health.total_checks).toBe(3);
      expect(health.rejections).toBe(3);
      expect(health.rejection_breakdown[REJECTION_CATEGORY.LOW_SCORE]).toBe(2);
      expect(health.rejection_breakdown[REJECTION_CATEGORY.TIER_MISMATCH]).toBe(1);
    });

    it('should include human reason if provided', () => {
      const rejection = system.trackRejection(
        { id: 'imp-001' },
        {},
        REJECTION_CATEGORY.HUMAN_OVERRIDE,
        'Does not align with project goals'
      );

      expect(rejection.human_reason).toBe('Does not align with project goals');
    });

    it('should capture metadata from improvement', () => {
      const improvement = {
        id: 'imp-001',
        improvement_type: 'VALIDATION_RULE',
        target_table: 'leo_validation_rules',
        target_operation: 'UPDATE'
      };

      const rejection = system.trackRejection(improvement, {}, REJECTION_CATEGORY.TIER_MISMATCH);

      expect(rejection.metadata.improvement_type).toBe('VALIDATION_RULE');
      expect(rejection.metadata.target_table).toBe('leo_validation_rules');
      expect(rejection.metadata.target_operation).toBe('UPDATE');
    });
  });

  describe('trackApproval', () => {
    it('should track an approval and update metrics', () => {
      const improvement = { id: 'imp-001' };
      const decision = {
        scores: { overall: 92 },
        classification: { tier: 'AUTO' }
      };

      const approval = system.trackApproval(improvement, decision);

      expect(approval.improvement_id).toBe('imp-001');
      expect(approval.score).toBe(92);
      expect(approval.tier).toBe('AUTO');
      expect(approval.approved_at).toBeDefined();
    });

    it('should update health metrics on approval', () => {
      system.trackApproval({ id: '1' }, { scores: { overall: 90 } });
      system.trackApproval({ id: '2' }, { scores: { overall: 95 } });
      system.trackRejection({ id: '3' }, { scores: { overall: 70 } }, REJECTION_CATEGORY.LOW_SCORE);

      const health = system.getPipelineHealth();

      expect(health.total_checks).toBe(3);
      expect(health.approvals).toBe(2);
      expect(health.rejections).toBe(1);
      expect(health.approval_rate).toBe(67); // 2/3 = 66.67% rounds to 67%
    });
  });

  describe('getPipelineHealth', () => {
    it('should return healthy status when no issues', () => {
      system.trackApproval({ id: '1' }, { scores: { overall: 90 } });
      system.trackApproval({ id: '2' }, { scores: { overall: 90 } });

      const health = system.getPipelineHealth();

      expect(health.status).toBe('HEALTHY');
      expect(health.warnings).toHaveLength(0);
      expect(health.approval_rate).toBe(100);
    });

    it('should return 100% approval rate when no checks', () => {
      const health = system.getPipelineHealth();

      expect(health.approval_rate).toBe(100);
      expect(health.total_checks).toBe(0);
    });

    it('should warn when approval rate below threshold', () => {
      // 2 rejections, 1 approval = 33% approval rate
      system.trackRejection({ id: '1' }, {}, REJECTION_CATEGORY.LOW_SCORE);
      system.trackRejection({ id: '2' }, {}, REJECTION_CATEGORY.LOW_SCORE);
      system.trackApproval({ id: '3' }, { scores: { overall: 90 } });

      const health = system.getPipelineHealth();

      expect(health.status).toBe('WARNING');
      expect(health.approval_rate).toBe(33);
      expect(health.warnings.length).toBeGreaterThan(0);
      expect(health.warnings[0]).toContain('below threshold');
    });

    it('should warn on rejection spike', () => {
      // 3+ rejections of same category triggers spike warning
      for (let i = 0; i < 3; i++) {
        system.trackRejection({ id: `imp-${i}` }, {}, REJECTION_CATEGORY.LOW_SAFETY);
      }

      const health = system.getPipelineHealth();

      expect(health.status).toBe('WARNING');
      expect(health.warnings.some(w => w.includes('spike'))).toBe(true);
    });

    it('should include recommendations when warnings present', () => {
      for (let i = 0; i < 5; i++) {
        system.trackRejection({ id: `imp-${i}` }, {}, REJECTION_CATEGORY.LOW_SCORE);
      }

      const health = system.getPipelineHealth();

      expect(health.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('detectConflicts', () => {
    it('should detect duplicate rule codes', () => {
      const improvement = {
        id: 'imp-001',
        payload: { rule_code: 'CONST-001' }
      };

      const existingRules = [
        { rule_code: 'CONST-001', content: 'Existing rule' }
      ];

      const result = system.detectConflicts(improvement, existingRules);

      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts[0].type).toBe('DUPLICATE_RULE');
      expect(result.conflicts[0].severity).toBe('HIGH');
      expect(result.recommendation).toBe('BLOCK');
    });

    it('should detect concurrent modifications', () => {
      const improvement = {
        target_table: 'leo_protocol_sections',
        target_operation: 'INSERT'
      };

      const existingRules = [
        { target_table: 'leo_protocol_sections', status: 'pending' },
        { target_table: 'leo_protocol_sections', status: 'pending' }
      ];

      const result = system.detectConflicts(improvement, existingRules);

      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts[0].type).toBe('CONCURRENT_MODIFICATION');
      expect(result.conflicts[0].severity).toBe('MEDIUM');
      expect(result.recommendation).toBe('ESCALATE');
    });

    it('should detect semantic overlap', () => {
      const improvement = {
        payload: {
          content: 'Always validate database queries before execution to prevent injection attacks'
        }
      };

      const existingRules = [
        {
          content: 'Ensure database queries are validated before execution for security reasons'
        }
      ];

      const result = system.detectConflicts(improvement, existingRules);

      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts[0].type).toBe('SEMANTIC_OVERLAP');
      expect(result.conflicts[0].severity).toBe('LOW');
      expect(result.recommendation).toBe('PROCEED_WITH_CAUTION');
    });

    it('should return no conflicts when improvement is unique', () => {
      const improvement = {
        id: 'imp-001',
        target_table: 'new_table',
        target_operation: 'INSERT',
        payload: { rule_code: 'NEW-001', content: 'Completely new unique content' }
      };

      const existingRules = [
        { rule_code: 'EXISTING-001', content: 'Different content entirely' }
      ];

      const result = system.detectConflicts(improvement, existingRules);

      expect(result.has_conflicts).toBe(false);
      expect(result.conflict_count).toBe(0);
    });

    it('should handle empty existing rules', () => {
      const improvement = { payload: { rule_code: 'NEW-001' } };

      const result = system.detectConflicts(improvement, []);

      expect(result.has_conflicts).toBe(false);
    });
  });

  describe('generateQualityJudgeFeedback', () => {
    it('should generate feedback from rejection patterns', () => {
      // Add some rejections
      system.trackRejection(
        { id: '1', improvement_type: 'CHECKLIST_ITEM', target_table: 'leo_protocol_sections' },
        { scores: { overall: 75 } },
        REJECTION_CATEGORY.LOW_SCORE
      );
      system.trackRejection(
        { id: '2', improvement_type: 'CHECKLIST_ITEM', target_table: 'issue_patterns' },
        { scores: { overall: 78 } },
        REJECTION_CATEGORY.LOW_SCORE
      );

      const feedback = system.generateQualityJudgeFeedback();

      expect(feedback.total_rejections).toBe(2);
      expect(feedback.patterns.length).toBeGreaterThan(0);
      expect(feedback.generated_at).toBeDefined();
    });

    it('should recommend threshold adjustment for borderline scores', () => {
      // Add rejections with scores close to threshold
      for (let i = 0; i < 3; i++) {
        system.trackRejection(
          { id: `imp-${i}` },
          { scores: { overall: 80 } }, // Above 70, below 85
          REJECTION_CATEGORY.LOW_SCORE
        );
      }

      const feedback = system.generateQualityJudgeFeedback();

      expect(feedback.threshold_recommendations.length).toBeGreaterThan(0);
      expect(feedback.threshold_recommendations[0].type).toBe('SCORE_THRESHOLD');
    });

    it('should suggest safety calibration on safety rejections', () => {
      for (let i = 0; i < 3; i++) {
        system.trackRejection(
          { id: `imp-${i}` },
          { scores: { overall: 90, safety: 7 } },
          REJECTION_CATEGORY.LOW_SAFETY
        );
      }

      const feedback = system.generateQualityJudgeFeedback();

      expect(feedback.calibration_suggestions.some(s => s.type === 'SAFETY_SCORING')).toBe(true);
    });

    it('should suggest calibration for low overall approval rate', () => {
      // Create low approval rate
      for (let i = 0; i < 10; i++) {
        system.trackRejection({ id: `imp-${i}` }, {}, REJECTION_CATEGORY.LOW_SCORE);
      }
      for (let i = 0; i < 2; i++) {
        system.trackApproval({ id: `app-${i}` }, { scores: { overall: 90 } });
      }

      const feedback = system.generateQualityJudgeFeedback();

      expect(feedback.calibration_suggestions.some(s =>
        s.type === 'OVERALL_CALIBRATION' && s.issue.includes('Low approval rate')
      )).toBe(true);
    });

    it('should suggest calibration for very high approval rate', () => {
      // Create very high approval rate (>95%)
      for (let i = 0; i < 100; i++) {
        system.trackApproval({ id: `app-${i}` }, { scores: { overall: 90 } });
      }

      const feedback = system.generateQualityJudgeFeedback();

      expect(feedback.calibration_suggestions.some(s =>
        s.type === 'OVERALL_CALIBRATION' && s.issue.includes('Very high approval rate')
      )).toBe(true);
    });
  });

  describe('getTokenBudgetStatus', () => {
    it('should return unavailable without supabase', async () => {
      const status = await system.getTokenBudgetStatus();

      expect(status.available).toBe(false);
      expect(status.reason).toBe('no_database');
      expect(status.max_tokens).toBe(HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS);
    });

    it('should handle view not existing', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: null,
              error: { code: '42P01', message: 'relation does not exist' }
            })
          })
        })
      };

      const systemWithDb = createAntiBloatSystem({ supabase: mockSupabase });
      const status = await systemWithDb.getTokenBudgetStatus();

      expect(status.available).toBe(false);
      expect(status.reason).toBe('view_not_exists');
    });

    it('should return healthy status when tokens low', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { approx_tokens: 5000, total_sections: 10 },
              error: null
            })
          })
        })
      };

      const systemWithDb = createAntiBloatSystem({ supabase: mockSupabase });
      const status = await systemWithDb.getTokenBudgetStatus();

      expect(status.available).toBe(true);
      expect(status.status).toBe('HEALTHY');
      expect(status.current_tokens).toBe(5000);
      expect(status.usage_percent).toBe(25); // 5000/20000 = 25%
    });

    it('should return warning status at 80% usage', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { approx_tokens: 16500, total_sections: 50 },
              error: null
            })
          })
        })
      };

      const systemWithDb = createAntiBloatSystem({ supabase: mockSupabase });
      const status = await systemWithDb.getTokenBudgetStatus();

      expect(status.status).toBe('WARNING');
      expect(status.usage_percent).toBe(83); // 16500/20000 = 82.5% rounds to 83%
    });

    it('should return critical status at 95% usage', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { approx_tokens: 19500, total_sections: 80 },
              error: null
            })
          })
        })
      };

      const systemWithDb = createAntiBloatSystem({ supabase: mockSupabase });
      const status = await systemWithDb.getTokenBudgetStatus();

      expect(status.status).toBe('CRITICAL');
      expect(status.usage_percent).toBe(98); // 19500/20000 = 97.5% rounds to 98%
    });
  });

  describe('getPipelineAnalytics', () => {
    it('should return local analytics without database', async () => {
      system.trackApproval({ id: '1' }, { scores: { overall: 90 } });
      system.trackRejection({ id: '2' }, {}, REJECTION_CATEGORY.LOW_SCORE);

      const analytics = await system.getPipelineAnalytics();

      expect(analytics.available).toBe(false);
      expect(analytics.analytics.session_total).toBe(2);
      expect(analytics.analytics.session_approvals).toBe(1);
      expect(analytics.analytics.session_rejections).toBe(1);
    });
  });

  describe('runMaintenanceCheck', () => {
    it('should return healthy report with no issues', async () => {
      const report = await system.runMaintenanceCheck();

      expect(report.status).toBe('HEALTHY');
      expect(report.checks.length).toBeGreaterThan(0);
      expect(report.timestamp).toBeDefined();
    });

    it('should include pipeline health check', async () => {
      system.trackApproval({ id: '1' }, { scores: { overall: 90 } });

      const report = await system.runMaintenanceCheck();

      const pipelineCheck = report.checks.find(c => c.name === 'pipeline_health');
      expect(pipelineCheck).toBeDefined();
      expect(pipelineCheck.details.total_checks).toBe(1);
    });

    it('should report issues when found', async () => {
      // Create low approval rate
      for (let i = 0; i < 10; i++) {
        system.trackRejection({ id: `imp-${i}` }, {}, REJECTION_CATEGORY.LOW_SCORE);
      }

      const report = await system.runMaintenanceCheck();

      expect(report.status).toBe('WARNING');
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });

  describe('clearRejectionLog', () => {
    it('should clear all tracked data', () => {
      system.trackRejection({ id: '1' }, {}, REJECTION_CATEGORY.LOW_SCORE);
      system.trackApproval({ id: '2' }, { scores: { overall: 90 } });

      system.clearRejectionLog();

      const health = system.getPipelineHealth();
      expect(health.total_checks).toBe(0);
      expect(system.getRejectionLog()).toHaveLength(0);
    });
  });

  describe('getRejectionLog', () => {
    it('should return copy of rejection log', () => {
      system.trackRejection({ id: '1' }, {}, REJECTION_CATEGORY.LOW_SCORE);
      system.trackRejection({ id: '2' }, {}, REJECTION_CATEGORY.TIER_MISMATCH);

      const log = system.getRejectionLog();

      expect(log).toHaveLength(2);
      // Verify it's a copy
      log.push({ id: 'fake' });
      expect(system.getRejectionLog()).toHaveLength(2);
    });
  });
});

describe('Module exports', () => {
  it('should export REJECTION_CATEGORY constants', () => {
    expect(REJECTION_CATEGORY).toBeDefined();
    expect(REJECTION_CATEGORY.LOW_SCORE).toBe('low_score');
    expect(REJECTION_CATEGORY.TIER_MISMATCH).toBe('tier_mismatch');
    expect(REJECTION_CATEGORY.LOW_SAFETY).toBe('low_safety');
    expect(REJECTION_CATEGORY.OPERATION_NOT_ALLOWED).toBe('operation_not_allowed');
    expect(REJECTION_CATEGORY.DAILY_LIMIT).toBe('daily_limit');
    expect(REJECTION_CATEGORY.HUMAN_OVERRIDE).toBe('human_override');
    expect(REJECTION_CATEGORY.CONFLICT_DETECTED).toBe('conflict_detected');
    expect(REJECTION_CATEGORY.DUPLICATE).toBe('duplicate');
    expect(REJECTION_CATEGORY.MISSING_EVIDENCE).toBe('missing_evidence');
  });

  it('should export HEALTH_THRESHOLDS constants', () => {
    expect(HEALTH_THRESHOLDS).toBeDefined();
    expect(HEALTH_THRESHOLDS.MIN_APPROVAL_RATE).toBe(60);
    expect(HEALTH_THRESHOLDS.TOKEN_BUDGET_WARNING).toBe(80);
    expect(HEALTH_THRESHOLDS.TOKEN_BUDGET_CRITICAL).toBe(95);
    expect(HEALTH_THRESHOLDS.REJECTION_SPIKE_THRESHOLD).toBe(3);
    expect(HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS).toBe(20000);
  });

  it('should export createAntiBloatSystem factory', () => {
    const system = createAntiBloatSystem();
    expect(system).toBeInstanceOf(AntiBloatSystem);
  });

  it('should export AntiBloatSystem class', () => {
    expect(AntiBloatSystem).toBeDefined();
    const system = new AntiBloatSystem();
    expect(system).toBeInstanceOf(AntiBloatSystem);
  });
});
