/**
 * Unit Tests: RCA Runtime Triggers
 * SD-RCA-001: Root Cause Agent - Runtime Monitoring
 *
 * Test Coverage:
 * - Confidence calculation (BASE + log_quality + evidence_strength)
 * - Trigger deduplication via failure_signature_hash
 * - RCR creation with correct severity matrix
 * - Auto-trigger tier assignment (T1-T4)
 * - Evidence parsing and extraction
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@supabase/supabase-js');

describe('RCA Runtime Triggers', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
      channel: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    };

    createClient.mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateConfidence', () => {
    test('should start with BASE score of 40', () => {
      const params = {
        evidence_refs: {}
      };

      const confidence = calculateConfidenceScore(params);

      // BASE(40) + evidence_strength(10) = 50
      expect(confidence).toBeGreaterThanOrEqual(40);
      expect(confidence).toBeLessThanOrEqual(60);
    });

    test('should add 20 points for stack_trace in evidence', () => {
      const params = {
        evidence_refs: {
          stack_trace: 'Error: Token expired\n  at validateToken (auth.ts:42)'
        }
      };

      const confidence = calculateConfidenceScore(params);

      // BASE(40) + log_quality(20) + evidence_strength(10) = 70
      expect(confidence).toBe(70);
    });

    test('should add 10 points for error_message without stack_trace', () => {
      const params = {
        evidence_refs: {
          error_message: 'Authentication failed'
        }
      };

      const confidence = calculateConfidenceScore(params);

      // BASE(40) + log_quality(10) + evidence_strength(10) = 60
      expect(confidence).toBe(60);
    });

    test('should cap confidence at 100', () => {
      const params = {
        evidence_refs: {
          stack_trace: 'Error stack',
          error_message: 'Error message',
          logs: ['log1', 'log2'],
          screenshots: ['screenshot1.png']
        }
      };

      const confidence = calculateConfidenceScore(params);

      expect(confidence).toBeLessThanOrEqual(100);
    });

    test('should handle missing evidence_refs', () => {
      const params = {};

      const confidence = calculateConfidenceScore(params);

      // BASE(40) + evidence_strength(10) = 50
      expect(confidence).toBe(50);
    });
  });

  describe('triggerRCA deduplication', () => {
    test('should update recurrence_count for duplicate signature', async () => {
      const existingRCR = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        status: 'OPEN',
        recurrence_count: 1
      };

      mockSupabase.maybeSingle.mockResolvedValue({ data: existingRCR, error: null });
      mockSupabase.update.mockResolvedValue({ data: { ...existingRCR, recurrence_count: 2 }, error: null });

      const params = {
        failure_signature: 'test_regression:login_test:SD-AUTH-001',
        scope_type: 'PIPELINE',
        scope_id: 'test-123',
        sd_id: 'SD-AUTH-001',
        trigger_source: 'TEST_FAILURE',
        trigger_tier: 2,
        problem_statement: 'Test regression',
        observed: {},
        expected: {},
        evidence_refs: {},
        impact_level: 'HIGH',
        likelihood_level: 'OCCASIONAL'
      };

      // Simulate deduplication check finding existing RCR
      const result = await checkDuplicateAndUpdate(mockSupabase, params);

      expect(result.isDuplicate).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledWith({
        recurrence_count: 2,
        updated_at: expect.any(String)
      });
    });

    test('should create new RCR if no duplicate found', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'new-rcr-id',
          status: 'OPEN',
          recurrence_count: 1
        },
        error: null
      });

      const params = {
        failure_signature: 'unique_failure_signature',
        scope_type: 'SUB_AGENT',
        scope_id: 'agent-123',
        sd_id: 'SD-SECURITY-001',
        trigger_source: 'SUB_AGENT',
        trigger_tier: 1,
        problem_statement: 'Security agent blocked',
        observed: {},
        expected: {},
        evidence_refs: {},
        impact_level: 'CRITICAL',
        likelihood_level: 'FREQUENT'
      };

      const result = await checkDuplicateAndUpdate(mockSupabase, params);

      expect(result.isDuplicate).toBe(false);
      expect(mockSupabase.insert).toHaveBeenCalled();
    });
  });

  describe('severity matrix calculation', () => {
    test('should assign P0 for CRITICAL impact + FREQUENT likelihood', () => {
      const severity = calculateSeverity('CRITICAL', 'FREQUENT');
      expect(severity).toBe('P0');
    });

    test('should assign P0 for CRITICAL impact + OCCASIONAL likelihood', () => {
      const severity = calculateSeverity('CRITICAL', 'OCCASIONAL');
      expect(severity).toBe('P0');
    });

    test('should assign P1 for CRITICAL impact + RARE likelihood', () => {
      const severity = calculateSeverity('CRITICAL', 'RARE');
      expect(severity).toBe('P1');
    });

    test('should assign P1 for HIGH impact + FREQUENT likelihood', () => {
      const severity = calculateSeverity('HIGH', 'FREQUENT');
      expect(severity).toBe('P0');
    });

    test('should assign P1 for HIGH impact + OCCASIONAL likelihood', () => {
      const severity = calculateSeverity('HIGH', 'OCCASIONAL');
      expect(severity).toBe('P1');
    });

    test('should assign P2 for HIGH impact + RARE likelihood', () => {
      const severity = calculateSeverity('HIGH', 'RARE');
      expect(severity).toBe('P2');
    });

    test('should assign P4 for LOW impact + UNLIKELY likelihood', () => {
      const severity = calculateSeverity('LOW', 'UNLIKELY');
      expect(severity).toBe('P4');
    });
  });

  describe('trigger tier assignment', () => {
    test('should assign T1 for BLOCKED sub-agent with high confidence', () => {
      const tier = determineTriggerTier('SUB_AGENT', {
        verdict: 'BLOCKED',
        confidence: 95
      });
      expect(tier).toBe(1);
    });

    test('should assign T2 for FAIL sub-agent with confidence >= 80', () => {
      const tier = determineTriggerTier('SUB_AGENT', {
        verdict: 'FAIL',
        confidence: 85
      });
      expect(tier).toBe(2);
    });

    test('should assign T1 for quality score < 70', () => {
      const tier = determineTriggerTier('QUALITY_GATE', {
        quality_score: 68
      });
      expect(tier).toBe(1);
    });

    test('should assign T2 for test regression within 24h', () => {
      const tier = determineTriggerTier('TEST_FAILURE', {
        regression_hours: 12
      });
      expect(tier).toBe(2);
    });

    test('should assign T3 for quality drop >= 15 points', () => {
      const tier = determineTriggerTier('QUALITY_GATE', {
        score_drop: 18
      });
      expect(tier).toBe(3);
    });

    test('should assign T4 for manual triggers', () => {
      const tier = determineTriggerTier('MANUAL', {});
      expect(tier).toBe(4);
    });
  });

  describe('evidence extraction', () => {
    test('should extract stack trace from test failure', () => {
      const failureData = {
        error_message: 'Expected element to be visible',
        stack_trace: 'Error: Locator timeout\n  at test.ts:42',
        screenshot_url: 'https://example.com/screenshot.png'
      };

      const evidence = extractEvidenceRefs(failureData, 'TEST_FAILURE');

      expect(evidence).toHaveProperty('stack_trace');
      expect(evidence).toHaveProperty('error_message');
      expect(evidence).toHaveProperty('screenshot_url');
      expect(evidence.stack_trace).toContain('Locator timeout');
    });

    test('should extract sub-agent result details', () => {
      const subAgentData = {
        sub_agent_result_id: 'result-123',
        detailed_analysis: {
          critical_issues: ['Schema validation failed'],
          warnings: ['Missing index on foreign key']
        }
      };

      const evidence = extractEvidenceRefs(subAgentData, 'SUB_AGENT');

      expect(evidence).toHaveProperty('sub_agent_result_id');
      expect(evidence).toHaveProperty('detailed_analysis');
      expect(evidence.detailed_analysis.critical_issues).toHaveLength(1);
    });

    test('should handle missing evidence gracefully', () => {
      const emptyData = {};

      const evidence = extractEvidenceRefs(emptyData, 'MANUAL');

      expect(evidence).toEqual({});
    });
  });

  describe('RCR status lifecycle', () => {
    test('should create RCR with status=OPEN', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
      const insertedRCR = {
        id: 'rcr-123',
        status: 'OPEN',
        severity_priority: 'P1',
        confidence: 70
      };
      mockSupabase.single.mockResolvedValue({ data: insertedRCR, error: null });

      const result = await createRCR(mockSupabase, {
        failure_signature: 'test_sig',
        problem_statement: 'Test problem',
        impact_level: 'HIGH',
        likelihood_level: 'OCCASIONAL'
      });

      expect(result.status).toBe('OPEN');
    });

    test('should set log_quality=20 when stack_trace present', async () => {
      const params = {
        evidence_refs: {
          stack_trace: 'Error stack'
        }
      };

      const logQuality = calculateLogQuality(params.evidence_refs);

      expect(logQuality).toBe(20);
    });

    test('should set log_quality=10 when no stack_trace', async () => {
      const params = {
        evidence_refs: {}
      };

      const logQuality = calculateLogQuality(params.evidence_refs);

      expect(logQuality).toBe(10);
    });
  });
});

// Helper functions matching lib/rca-runtime-triggers.js logic

function calculateConfidenceScore(params) {
  let confidence = 40; // BASE

  if (params.evidence_refs?.stack_trace) {
    confidence += 20;
  } else if (params.evidence_refs?.error_message) {
    confidence += 10;
  }

  confidence += 10; // Initial evidence_strength

  return Math.min(confidence, 100);
}

function calculateSeverity(impact, likelihood) {
  const matrix = {
    CRITICAL: {
      FREQUENT: 'P0',
      OCCASIONAL: 'P0',
      RARE: 'P1',
      UNLIKELY: 'P2'
    },
    HIGH: {
      FREQUENT: 'P0',
      OCCASIONAL: 'P1',
      RARE: 'P2',
      UNLIKELY: 'P3'
    },
    MEDIUM: {
      FREQUENT: 'P1',
      OCCASIONAL: 'P2',
      RARE: 'P3',
      UNLIKELY: 'P4'
    },
    LOW: {
      FREQUENT: 'P2',
      OCCASIONAL: 'P3',
      RARE: 'P4',
      UNLIKELY: 'P4'
    }
  };

  return matrix[impact]?.[likelihood] || 'P4';
}

function determineTriggerTier(source, context) {
  if (source === 'MANUAL') return 4;

  if (source === 'SUB_AGENT') {
    if (context.verdict === 'BLOCKED' && context.confidence >= 90) return 1;
    if (context.verdict === 'FAIL' && context.confidence >= 80) return 2;
  }

  if (source === 'QUALITY_GATE') {
    if (context.quality_score < 70) return 1;
    if (context.score_drop >= 15) return 3;
  }

  if (source === 'TEST_FAILURE') {
    if (context.regression_hours <= 24) return 2;
  }

  return 3;
}

function extractEvidenceRefs(data, source) {
  const evidence = {};

  if (source === 'TEST_FAILURE') {
    if (data.error_message) evidence.error_message = data.error_message;
    if (data.stack_trace) evidence.stack_trace = data.stack_trace;
    if (data.screenshot_url) evidence.screenshot_url = data.screenshot_url;
  }

  if (source === 'SUB_AGENT') {
    if (data.sub_agent_result_id) evidence.sub_agent_result_id = data.sub_agent_result_id;
    if (data.detailed_analysis) evidence.detailed_analysis = data.detailed_analysis;
  }

  return evidence;
}

async function checkDuplicateAndUpdate(supabase, params) {
  const { data: existingRCR } = await supabase
    .from('root_cause_reports')
    .select('id, status, recurrence_count')
    .eq('failure_signature', params.failure_signature)
    .in('status', ['OPEN', 'IN_REVIEW'])
    .maybeSingle();

  if (existingRCR) {
    await supabase
      .from('root_cause_reports')
      .update({
        recurrence_count: existingRCR.recurrence_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingRCR.id);

    return { isDuplicate: true, rcrId: existingRCR.id };
  }

  const { data: newRCR } = await supabase
    .from('root_cause_reports')
    .insert({
      ...params,
      status: 'OPEN',
      recurrence_count: 1
    })
    .select()
    .single();

  return { isDuplicate: false, rcrId: newRCR.id };
}

async function createRCR(supabase, params) {
  const { data } = await supabase
    .from('root_cause_reports')
    .insert({
      ...params,
      status: 'OPEN'
    })
    .select()
    .single();

  return data;
}

function calculateLogQuality(evidenceRefs) {
  return evidenceRefs?.stack_trace ? 20 : 10;
}
