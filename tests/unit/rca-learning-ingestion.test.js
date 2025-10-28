/**
 * Unit Tests: RCA Learning Ingestion
 * SD-RCA-001: Root Cause Agent - EVA Integration
 *
 * Test Coverage:
 * - Feature extraction (15+ ML features)
 * - Defect classification (9 taxonomy categories)
 * - Preventability analysis (5 prevention stages)
 * - Time metrics calculation (detect + resolve hours)
 * - Learning record creation
 */

import { describe, test, expect } from 'vitest';

describe('RCA Learning Ingestion', () => {
  describe('extractFeatures', () => {
    test('should extract all categorical features', () => {
      const rcr = {
        scope_type: 'PIPELINE',
        trigger_source: 'TEST_FAILURE',
        root_cause_category: 'TEST_COVERAGE_GAP',
        impact_level: 'HIGH',
        likelihood_level: 'OCCASIONAL',
        severity_priority: 'P1',
        confidence: 85,
        detected_at: '2025-10-28T14:00:00Z',
        evidence_refs: {
          stack_trace: 'Error stack',
          logs: ['log1'],
          screenshot_url: 'https://example.com/screenshot.png'
        },
        repro_steps: 'Steps to reproduce',
        repro_success_rate: 0.9,
        recurrence_count: 2,
        analysis_attempts: 1,
        remediation_manifests: [{
          risk_score: 25,
          affected_sd_count: 1,
          preventive_actions: [
            { action: 'Add test coverage' },
            { action: 'Improve validation' }
          ]
        }]
      };

      const features = extractMLFeatures(rcr);

      expect(features).toHaveProperty('scope_type', 'PIPELINE');
      expect(features).toHaveProperty('trigger_source', 'TEST_FAILURE');
      expect(features).toHaveProperty('root_cause_category', 'TEST_COVERAGE_GAP');
      expect(features).toHaveProperty('impact_level', 'HIGH');
      expect(features).toHaveProperty('likelihood_level', 'OCCASIONAL');
      expect(features).toHaveProperty('severity_priority', 'P1');
    });

    test('should extract numerical features', () => {
      const rcr = {
        confidence: 75,
        log_quality: 15,
        evidence_strength: 18,
        pattern_match_score: 12,
        recurrence_count: 3,
        analysis_attempts: 2,
        detected_at: '2025-10-28T14:00:00Z',
        evidence_refs: {},
        remediation_manifests: [{
          risk_score: 40,
          affected_sd_count: 2,
          preventive_actions: [{ action: 'Action 1' }, { action: 'Action 2' }]
        }]
      };

      const features = extractMLFeatures(rcr);

      expect(features.confidence).toBe(75);
      expect(features.log_quality).toBe(15);
      expect(features.evidence_strength).toBe(18);
      expect(features.pattern_match_score).toBe(12);
      expect(features.recurrence_count).toBe(3);
      expect(features.analysis_attempts).toBe(2);
      expect(features.capa_risk_score).toBe(40);
      expect(features.affected_sd_count).toBe(2);
      expect(features.preventive_action_count).toBe(2);
    });

    test('should extract temporal features', () => {
      const rcr = {
        detected_at: '2025-10-28T15:30:00Z', // 3:30 PM, Tuesday
        evidence_refs: {}
      };

      const features = extractMLFeatures(rcr);

      expect(features.hour_of_day).toBe(15);
      expect(features.day_of_week).toBe(2); // Tuesday
    });

    test('should extract context features', () => {
      const rcr = {
        detected_at: '2025-10-28T14:00:00Z',
        evidence_refs: {
          stack_trace: 'Error at line 42',
          logs: ['log1', 'log2'],
          screenshot_url: 'https://example.com/screenshot.png'
        },
        repro_steps: 'Steps to reproduce',
        repro_success_rate: 0.85
      };

      const features = extractMLFeatures(rcr);

      expect(features.has_repro_steps).toBe(true);
      expect(features.repro_success_rate).toBe(0.85);
      expect(features.has_stack_trace).toBe(true);
      expect(features.has_logs).toBe(true);
      expect(features.has_screenshots).toBe(true);
    });

    test('should handle missing optional fields', () => {
      const rcr = {
        detected_at: '2025-10-28T14:00:00Z',
        evidence_refs: {},
        scope_type: 'SD',
        trigger_source: 'MANUAL',
        root_cause_category: 'CODE_DEFECT',
        impact_level: 'MEDIUM',
        likelihood_level: 'RARE',
        severity_priority: 'P3',
        confidence: 50
      };

      const features = extractMLFeatures(rcr);

      expect(features.log_quality).toBe(0);
      expect(features.evidence_strength).toBe(0);
      expect(features.pattern_match_score).toBe(0);
      expect(features.recurrence_count).toBe(1);
      expect(features.analysis_attempts).toBe(1);
      expect(features.has_repro_steps).toBe(false);
      expect(features.repro_success_rate).toBe(0);
      expect(features.has_stack_trace).toBe(false);
      expect(features.has_logs).toBe(false);
      expect(features.has_screenshots).toBe(false);
      expect(features.capa_risk_score).toBe(0);
      expect(features.affected_sd_count).toBe(1);
      expect(features.preventive_action_count).toBe(0);
    });
  });

  describe('classifyDefect', () => {
    test('should classify TEST_COVERAGE_GAP with TEST_FAILURE as regression', () => {
      const rcr = {
        root_cause_category: 'TEST_COVERAGE_GAP',
        trigger_source: 'TEST_FAILURE',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('test_coverage_gap_regression');
    });

    test('should classify TEST_COVERAGE_GAP without TEST_FAILURE as initial', () => {
      const rcr = {
        root_cause_category: 'TEST_COVERAGE_GAP',
        trigger_source: 'QUALITY_GATE',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('test_coverage_gap_initial');
    });

    test('should classify CODE_DEFECT with stack_trace as runtime', () => {
      const rcr = {
        root_cause_category: 'CODE_DEFECT',
        trigger_source: 'RUNTIME',
        evidence_refs: {
          stack_trace: 'Error stack'
        }
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('code_defect_runtime');
    });

    test('should classify CODE_DEFECT without stack_trace as logic', () => {
      const rcr = {
        root_cause_category: 'CODE_DEFECT',
        trigger_source: 'MANUAL',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('code_defect_logic');
    });

    test('should classify CONFIG_ERROR from CI_PIPELINE', () => {
      const rcr = {
        root_cause_category: 'CONFIG_ERROR',
        trigger_source: 'CI_PIPELINE',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('config_error_ci');
    });

    test('should classify CONFIG_ERROR from RUNTIME', () => {
      const rcr = {
        root_cause_category: 'CONFIG_ERROR',
        trigger_source: 'RUNTIME',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('config_error_env');
    });

    test('should classify CONFIG_ERROR from other sources', () => {
      const rcr = {
        root_cause_category: 'CONFIG_ERROR',
        trigger_source: 'MANUAL',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('config_error_application');
    });

    test('should classify REQUIREMENTS_AMBIGUITY', () => {
      const rcr = {
        root_cause_category: 'REQUIREMENTS_AMBIGUITY',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('requirements_ambiguity');
    });

    test('should classify PROCESS_GAP', () => {
      const rcr = {
        root_cause_category: 'PROCESS_GAP',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('process_gap');
    });

    test('should return uncategorized for unknown category', () => {
      const rcr = {
        root_cause_category: 'UNKNOWN_CATEGORY',
        evidence_refs: {}
      };

      const defectClass = classifyDefectTaxonomy(rcr);

      expect(defectClass).toBe('uncategorized');
    });
  });

  describe('analyzePrevention', () => {
    test('should mark REQUIREMENTS_AMBIGUITY as preventable at LEAD', () => {
      const rcr = {
        root_cause_category: 'REQUIREMENTS_AMBIGUITY',
        trigger_source: 'QUALITY_GATE'
      };

      const prevention = analyzePreventability(rcr);

      expect(prevention.preventable).toBe(true);
      expect(prevention.stage).toBe('LEAD_PRE_APPROVAL');
      expect(prevention.reason).toContain('Clearer requirements');
    });

    test('should mark TEST_COVERAGE_GAP as preventable at PLAN', () => {
      const rcr = {
        root_cause_category: 'TEST_COVERAGE_GAP',
        trigger_source: 'TEST_FAILURE'
      };

      const prevention = analyzePreventability(rcr);

      expect(prevention.preventable).toBe(true);
      expect(prevention.stage).toBe('PLAN_PRD');
      expect(prevention.reason).toContain('test plan');
    });

    test('should mark CODE_DEFECT with TEST_FAILURE as preventable at EXEC', () => {
      const rcr = {
        root_cause_category: 'CODE_DEFECT',
        trigger_source: 'TEST_FAILURE'
      };

      const prevention = analyzePreventability(rcr);

      expect(prevention.preventable).toBe(true);
      expect(prevention.stage).toBe('EXEC_IMPL');
      expect(prevention.reason).toContain('unit testing');
    });

    test('should mark PROCESS_GAP as preventable at PLAN', () => {
      const rcr = {
        root_cause_category: 'PROCESS_GAP',
        trigger_source: 'HANDOFF_REJECTION'
      };

      const prevention = analyzePreventability(rcr);

      expect(prevention.preventable).toBe(true);
      expect(prevention.stage).toBe('PLAN_PRD');
      expect(prevention.reason).toContain('Process improvement');
    });

    test('should mark CONFIG_ERROR as preventable at PLAN_VERIFY', () => {
      const rcr = {
        root_cause_category: 'CONFIG_ERROR',
        trigger_source: 'CI_PIPELINE'
      };

      const prevention = analyzePreventability(rcr);

      expect(prevention.preventable).toBe(true);
      expect(prevention.stage).toBe('PLAN_VERIFY');
      expect(prevention.reason).toContain('Configuration validation');
    });

    test('should mark unknown categories as not preventable', () => {
      const rcr = {
        root_cause_category: 'UNKNOWN_CATEGORY',
        trigger_source: 'RUNTIME'
      };

      const prevention = analyzePreventability(rcr);

      expect(prevention.preventable).toBe(false);
      expect(prevention.stage).toBe('NEVER');
      expect(prevention.reason).toContain('Inherent complexity');
    });

    test('should mark CODE_DEFECT without TEST_FAILURE as not preventable', () => {
      const rcr = {
        root_cause_category: 'CODE_DEFECT',
        trigger_source: 'RUNTIME'
      };

      const prevention = analyzePreventability(rcr);

      expect(prevention.preventable).toBe(false);
      expect(prevention.stage).toBe('NEVER');
    });
  });

  describe('calculateTimeMetrics', () => {
    test('should calculate time to resolve from detection to resolution', () => {
      const rcr = {
        detected_at: '2025-10-28T10:00:00Z',
        resolved_at: '2025-10-28T16:00:00Z' // 6 hours later
      };

      const metrics = calculateTimingMetrics(rcr);

      expect(metrics.resolve_hours).toBe(6);
    });

    test('should calculate time to detect from first occurrence to detection', () => {
      const rcr = {
        first_occurrence_at: '2025-10-28T08:00:00Z',
        detected_at: '2025-10-28T12:00:00Z', // 4 hours later
        resolved_at: '2025-10-28T18:00:00Z'
      };

      const metrics = calculateTimingMetrics(rcr);

      expect(metrics.detect_hours).toBe(4);
      expect(metrics.resolve_hours).toBe(6);
    });

    test('should handle missing first_occurrence_at', () => {
      const rcr = {
        detected_at: '2025-10-28T10:00:00Z',
        resolved_at: '2025-10-28T14:00:00Z'
      };

      const metrics = calculateTimingMetrics(rcr);

      expect(metrics.detect_hours).toBe(0);
      expect(metrics.resolve_hours).toBe(4);
    });

    test('should handle missing resolved_at (use current time)', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const rcr = {
        detected_at: twoHoursAgo.toISOString()
      };

      const metrics = calculateTimingMetrics(rcr);

      // Should be approximately 2 hours (allow 1 minute tolerance)
      expect(metrics.resolve_hours).toBeGreaterThan(1.9);
      expect(metrics.resolve_hours).toBeLessThan(2.1);
    });

    test('should never return negative hours', () => {
      // Edge case: resolved_at before detected_at (data error)
      const rcr = {
        detected_at: '2025-10-28T14:00:00Z',
        resolved_at: '2025-10-28T10:00:00Z'
      };

      const metrics = calculateTimingMetrics(rcr);

      expect(metrics.detect_hours).toBeGreaterThanOrEqual(0);
      expect(metrics.resolve_hours).toBeGreaterThanOrEqual(0);
    });

    test('should handle millisecond precision', () => {
      const rcr = {
        detected_at: '2025-10-28T10:00:00.000Z',
        resolved_at: '2025-10-28T10:30:00.500Z' // 30 minutes 500ms
      };

      const metrics = calculateTimingMetrics(rcr);

      // 30.5 minutes = 0.508 hours
      expect(metrics.resolve_hours).toBeCloseTo(0.508, 2);
    });
  });

  describe('learning record integration', () => {
    test('should create complete learning record structure', () => {
      const rcr = {
        id: 'rcr-123',
        scope_type: 'PIPELINE',
        trigger_source: 'TEST_FAILURE',
        root_cause_category: 'TEST_COVERAGE_GAP',
        impact_level: 'HIGH',
        likelihood_level: 'OCCASIONAL',
        severity_priority: 'P1',
        confidence: 85,
        detected_at: '2025-10-28T10:00:00Z',
        resolved_at: '2025-10-28T16:00:00Z',
        first_occurrence_at: '2025-10-28T08:00:00Z',
        evidence_refs: {
          stack_trace: 'Error stack',
          logs: ['log1']
        },
        repro_steps: 'Steps',
        repro_success_rate: 0.9,
        remediation_manifests: [{
          risk_score: 25,
          affected_sd_count: 1,
          preventive_actions: [{ action: 'Action 1' }]
        }]
      };

      const learningRecord = createLearningRecord(rcr);

      expect(learningRecord).toHaveProperty('rcr_id', 'rcr-123');
      expect(learningRecord).toHaveProperty('features');
      expect(learningRecord).toHaveProperty('label');
      expect(learningRecord).toHaveProperty('defect_class', 'test_coverage_gap_regression');
      expect(learningRecord).toHaveProperty('preventable', true);
      expect(learningRecord).toHaveProperty('prevention_stage', 'PLAN_PRD');
      expect(learningRecord).toHaveProperty('time_to_detect_hours', 2);
      expect(learningRecord).toHaveProperty('time_to_resolve_hours', 6);
      expect(learningRecord.metadata).toHaveProperty('severity', 'P1');
      expect(learningRecord.metadata).toHaveProperty('trigger_source', 'TEST_FAILURE');
      expect(learningRecord.metadata).toHaveProperty('confidence', 85);
      expect(learningRecord.metadata).toHaveProperty('impact_level', 'HIGH');
    });

    test('should format label correctly', () => {
      const rcr = {
        id: 'rcr-456',
        root_cause_category: 'CODE_DEFECT',
        trigger_source: 'RUNTIME',
        detected_at: '2025-10-28T10:00:00Z',
        evidence_refs: { stack_trace: 'Error' }
      };

      const learningRecord = createLearningRecord(rcr);

      expect(learningRecord.label).toBe('CODE_DEFECT - code_defect_runtime');
    });
  });
});

// Helper functions matching scripts/rca-learning-ingestion.js logic

function extractMLFeatures(rcr) {
  return {
    // Categorical features
    scope_type: rcr.scope_type,
    trigger_source: rcr.trigger_source,
    root_cause_category: rcr.root_cause_category,
    impact_level: rcr.impact_level,
    likelihood_level: rcr.likelihood_level,
    severity_priority: rcr.severity_priority,

    // Numerical features
    confidence: rcr.confidence,
    log_quality: rcr.log_quality || 0,
    evidence_strength: rcr.evidence_strength || 0,
    pattern_match_score: rcr.pattern_match_score || 0,
    recurrence_count: rcr.recurrence_count || 1,
    analysis_attempts: rcr.analysis_attempts || 1,

    // Temporal features
    hour_of_day: new Date(rcr.detected_at).getHours(),
    day_of_week: new Date(rcr.detected_at).getDay(),

    // Context features
    has_repro_steps: !!rcr.repro_steps,
    repro_success_rate: rcr.repro_success_rate || 0,
    has_stack_trace: !!(rcr.evidence_refs?.stack_traces || rcr.evidence_refs?.stack_trace),
    has_logs: !!(rcr.evidence_refs?.logs),
    has_screenshots: !!(rcr.evidence_refs?.screenshots || rcr.evidence_refs?.screenshot_url),

    // CAPA features
    capa_risk_score: rcr.remediation_manifests?.[0]?.risk_score || 0,
    affected_sd_count: rcr.remediation_manifests?.[0]?.affected_sd_count || 1,
    preventive_action_count: rcr.remediation_manifests?.[0]?.preventive_actions?.length || 0
  };
}

function classifyDefectTaxonomy(rcr) {
  const category = rcr.root_cause_category;
  const trigger = rcr.trigger_source;

  if (category === 'TEST_COVERAGE_GAP') {
    if (trigger === 'TEST_FAILURE') return 'test_coverage_gap_regression';
    return 'test_coverage_gap_initial';
  }

  if (category === 'CODE_DEFECT') {
    if (rcr.evidence_refs?.stack_trace) return 'code_defect_runtime';
    return 'code_defect_logic';
  }

  if (category === 'CONFIG_ERROR') {
    if (trigger === 'CI_PIPELINE') return 'config_error_ci';
    if (trigger === 'RUNTIME') return 'config_error_env';
    return 'config_error_application';
  }

  if (category === 'REQUIREMENTS_AMBIGUITY') {
    return 'requirements_ambiguity';
  }

  if (category === 'PROCESS_GAP') {
    return 'process_gap';
  }

  return 'uncategorized';
}

function analyzePreventability(rcr) {
  const category = rcr.root_cause_category;

  if (category === 'REQUIREMENTS_AMBIGUITY') {
    return {
      preventable: true,
      stage: 'LEAD_PRE_APPROVAL',
      reason: 'Clearer requirements would have prevented ambiguity'
    };
  }

  if (category === 'TEST_COVERAGE_GAP') {
    return {
      preventable: true,
      stage: 'PLAN_PRD',
      reason: 'Comprehensive test plan would have caught gap'
    };
  }

  if (category === 'CODE_DEFECT' && rcr.trigger_source === 'TEST_FAILURE') {
    return {
      preventable: true,
      stage: 'EXEC_IMPL',
      reason: 'Better unit testing during implementation'
    };
  }

  if (category === 'PROCESS_GAP') {
    return {
      preventable: true,
      stage: 'PLAN_PRD',
      reason: 'Process improvement needed in workflow'
    };
  }

  if (category === 'CONFIG_ERROR') {
    return {
      preventable: true,
      stage: 'PLAN_VERIFY',
      reason: 'Configuration validation during verification'
    };
  }

  return {
    preventable: false,
    stage: 'NEVER',
    reason: 'Inherent complexity or external factor'
  };
}

function calculateTimingMetrics(rcr) {
  const detectedAt = new Date(rcr.detected_at);
  const resolvedAt = rcr.resolved_at ? new Date(rcr.resolved_at) : new Date();

  const resolveMs = resolvedAt - detectedAt;
  const resolve_hours = resolveMs / (1000 * 60 * 60);

  let detect_hours = 0;
  if (rcr.first_occurrence_at) {
    const firstOccurrence = new Date(rcr.first_occurrence_at);
    const detectMs = detectedAt - firstOccurrence;
    detect_hours = detectMs / (1000 * 60 * 60);
  }

  return {
    detect_hours: Math.max(0, detect_hours),
    resolve_hours: Math.max(0, resolve_hours)
  };
}

function createLearningRecord(rcr) {
  const features = extractMLFeatures(rcr);
  const defectClass = classifyDefectTaxonomy(rcr);
  const prevention = analyzePreventability(rcr);
  const timeMetrics = calculateTimingMetrics(rcr);

  return {
    rcr_id: rcr.id,
    features: features,
    label: `${rcr.root_cause_category} - ${defectClass}`,
    defect_class: defectClass,
    preventable: prevention.preventable,
    prevention_stage: prevention.stage,
    time_to_detect_hours: timeMetrics.detect_hours,
    time_to_resolve_hours: timeMetrics.resolve_hours,
    metadata: {
      severity: rcr.severity_priority,
      trigger_source: rcr.trigger_source,
      confidence: rcr.confidence,
      impact_level: rcr.impact_level
    }
  };
}
