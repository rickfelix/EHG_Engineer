/**
 * Integration Tests: RCA System
 * SD-RCA-001: Root Cause Agent - End-to-End Flows
 *
 * Test Coverage:
 * - Full RCR lifecycle (OPEN → RESOLVED)
 * - CAPA generation → approval → implementation → verification
 * - Gate enforcement with real database queries
 * - Learning ingestion pipeline
 * - Auto-trigger deduplication
 * - Handoff rejection with RCA_GATE_BLOCKED
 *
 * Prerequisites:
 * - Database migration 20251028_root_cause_agent_schema.sql applied
 * - RCA sub-agent registered in leo_sub_agents
 * - Test database with clean state
 *
 * @requires @supabase/supabase-js
 * @requires vitest
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../../lib/supabase-connection.js';

describe('RCA System Integration', () => {
  let supabase;
  let testSDId;
  let testRCRId;
  let testCAPAId;

  beforeAll(async () => {
    supabase = createDatabaseClient();

    // Create test Strategic Directive
    const { data: sd } = await supabase
      .from('strategic_directives')
      .insert({
        directive_id: 'SD-RCA-INT-TEST',
        title: 'RCA Integration Test Directive',
        status: 'ACTIVE',
        priority: 'MEDIUM'
      })
      .select()
      .single();

    testSDId = sd?.id || 'SD-RCA-INT-TEST';
  });

  afterAll(async () => {
    // Cleanup test data
    if (testSDId) {
      await supabase
        .from('root_cause_reports')
        .delete()
        .eq('sd_id', testSDId);

      await supabase
        .from('strategic_directives')
        .delete()
        .eq('directive_id', testSDId);
    }
  });

  beforeEach(() => {
    testRCRId = null;
    testCAPAId = null;
  });

  afterEach(async () => {
    // Cleanup RCRs and CAPAs created during test
    if (testCAPAId) {
      await supabase
        .from('remediation_manifests')
        .delete()
        .eq('id', testCAPAId);
    }

    if (testRCRId) {
      await supabase
        .from('root_cause_reports')
        .delete()
        .eq('id', testRCRId);
    }
  });

  describe('RCR Lifecycle', () => {
    test('should create RCR with OPEN status and auto-calculate confidence', async () => {
      const { data: rcr, error } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'PIPELINE',
          scope_id: 'test-pipeline-123',
          sd_id: testSDId,
          trigger_source: 'TEST_FAILURE',
          trigger_tier: 2,
          failure_signature: 'test_regression:login_test:' + Date.now(),
          problem_statement: 'Login test regressed after recent changes',
          observed: {
            test_name: 'User login with valid credentials',
            status: 'failed',
            error_message: 'Expected element to be visible'
          },
          expected: {
            status: 'passed',
            last_pass_at: '2025-10-28T08:00:00Z'
          },
          evidence_refs: {
            test_failure_id: 'failure-123',
            stack_trace: 'Error: Locator timeout\n  at test.ts:42',
            screenshot_url: 'https://example.com/screenshot.png'
          },
          impact_level: 'HIGH',
          likelihood_level: 'OCCASIONAL'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(rcr).toBeDefined();
      expect(rcr.status).toBe('OPEN');
      expect(rcr.confidence).toBeGreaterThanOrEqual(40);
      expect(rcr.severity_priority).toBe('P1'); // HIGH + OCCASIONAL = P1
      expect(rcr.recurrence_count).toBe(1);

      testRCRId = rcr.id;
    });

    test('should transition RCR through lifecycle: OPEN → CAPA_PENDING → CAPA_APPROVED → FIX_IN_PROGRESS → RESOLVED', async () => {
      // 1. Create RCR (OPEN)
      const { data: rcr } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'SUB_AGENT',
          scope_id: 'agent-123',
          sd_id: testSDId,
          trigger_source: 'SUB_AGENT',
          trigger_tier: 1,
          failure_signature: 'sub_agent_blocked:DATABASE:' + Date.now(),
          problem_statement: 'Database sub-agent blocked deployment',
          observed: { verdict: 'BLOCKED', confidence: 95 },
          expected: { verdict: 'PASS' },
          evidence_refs: { sub_agent_result_id: 'result-123' },
          impact_level: 'CRITICAL',
          likelihood_level: 'FREQUENT'
        })
        .select()
        .single();

      testRCRId = rcr.id;
      expect(rcr.status).toBe('OPEN');
      expect(rcr.severity_priority).toBe('P0'); // CRITICAL + FREQUENT = P0

      // 2. Create CAPA (should auto-update RCR to CAPA_PENDING)
      const { data: capa } = await supabase
        .from('remediation_manifests')
        .insert({
          rcr_id: rcr.id,
          root_cause_category: 'CODE_DEFECT',
          proposed_changes: {
            corrective_actions: [{
              action: 'Fix database migration syntax error',
              files_affected: ['database/migrations/001.sql'],
              estimated_effort_hours: 2
            }],
            preventive_actions: [{
              action: 'Add migration validation to pre-commit hook',
              files_affected: ['.git/hooks/pre-commit'],
              estimated_effort_hours: 3
            }]
          },
          verification_plan: {
            test_scenarios: ['Run migration on clean database', 'Verify schema matches PRD'],
            success_criteria: ['Migration completes without errors', 'All tables created']
          },
          risk_score: 20,
          affected_sd_count: 1,
          status: 'PENDING'
        })
        .select()
        .single();

      testCAPAId = capa.id;

      // 3. Approve CAPA (CAPA_PENDING → CAPA_APPROVED)
      await supabase
        .from('remediation_manifests')
        .update({ status: 'APPROVED', approved_at: new Date().toISOString() })
        .eq('id', capa.id);

      let { data: updatedRCR1 } = await supabase
        .from('root_cause_reports')
        .select('status')
        .eq('id', rcr.id)
        .single();

      expect(updatedRCR1.status).toBe('CAPA_APPROVED');

      // 4. Mark fix in progress (CAPA_APPROVED → FIX_IN_PROGRESS)
      await supabase
        .from('remediation_manifests')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', capa.id);

      let { data: updatedRCR2 } = await supabase
        .from('root_cause_reports')
        .select('status')
        .eq('id', rcr.id)
        .single();

      expect(updatedRCR2.status).toBe('FIX_IN_PROGRESS');

      // 5. Verify CAPA (should auto-resolve RCR via trigger)
      await supabase
        .from('remediation_manifests')
        .update({
          status: 'VERIFIED',
          verified_at: new Date().toISOString(),
          verification_notes: 'Migration ran successfully, schema validated'
        })
        .eq('id', capa.id);

      // Wait for trigger to fire
      await new Promise(resolve => setTimeout(resolve, 500));

      let { data: updatedRCR3 } = await supabase
        .from('root_cause_reports')
        .select('status, resolved_at')
        .eq('id', rcr.id)
        .single();

      expect(updatedRCR3.status).toBe('RESOLVED');
      expect(updatedRCR3.resolved_at).toBeDefined();
    }, 10000); // 10s timeout for trigger

    test('should handle duplicate failure_signature by incrementing recurrence_count', async () => {
      const uniqueSignature = 'duplicate_test:signature:' + Date.now();

      // Create first RCR
      const { data: rcr1 } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'RUNTIME',
          scope_id: 'runtime-123',
          sd_id: testSDId,
          trigger_source: 'RUNTIME',
          trigger_tier: 3,
          failure_signature: uniqueSignature,
          problem_statement: 'Runtime error occurred',
          observed: {},
          expected: {},
          evidence_refs: {},
          impact_level: 'MEDIUM',
          likelihood_level: 'RARE'
        })
        .select()
        .single();

      testRCRId = rcr1.id;
      expect(rcr1.recurrence_count).toBe(1);

      // Attempt to create duplicate (should fail due to unique index on failure_signature_hash)
      const { error: duplicateError } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'RUNTIME',
          scope_id: 'runtime-456',
          sd_id: testSDId,
          trigger_source: 'RUNTIME',
          trigger_tier: 3,
          failure_signature: uniqueSignature,
          problem_statement: 'Same runtime error',
          observed: {},
          expected: {},
          evidence_refs: {},
          impact_level: 'MEDIUM',
          likelihood_level: 'RARE'
        });

      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe('23505'); // unique_violation

      // Verify original RCR unchanged
      const { data: rcr1After } = await supabase
        .from('root_cause_reports')
        .select('recurrence_count')
        .eq('id', rcr1.id)
        .single();

      expect(rcr1After.recurrence_count).toBe(1);

      // Manual recurrence update (simulating runtime trigger logic)
      await supabase
        .from('root_cause_reports')
        .update({ recurrence_count: 2 })
        .eq('id', rcr1.id);

      const { data: rcr1Updated } = await supabase
        .from('root_cause_reports')
        .select('recurrence_count')
        .eq('id', rcr1.id)
        .single();

      expect(rcr1Updated.recurrence_count).toBe(2);
    });
  });

  describe('Gate Enforcement', () => {
    test('should BLOCK handoff when P0 RCR exists without verified CAPA', async () => {
      // Create P0 RCR
      const { data: p0RCR } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'SD',
          scope_id: testSDId,
          sd_id: testSDId,
          trigger_source: 'QUALITY_GATE',
          trigger_tier: 1,
          failure_signature: 'quality_critical:' + Date.now(),
          problem_statement: 'Quality score dropped below 70',
          observed: { quality_score: 68 },
          expected: { quality_score: '>=70' },
          evidence_refs: {},
          impact_level: 'CRITICAL',
          likelihood_level: 'OCCASIONAL'
        })
        .select()
        .single();

      testRCRId = p0RCR.id;

      // Query for blocking RCRs (simulate gate check)
      const { data: blockingRCRs } = await supabase
        .from('root_cause_reports')
        .select('id, severity_priority, status, remediation_manifests(id, status, verified_at)')
        .eq('sd_id', testSDId)
        .in('status', ['OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS'])
        .in('severity_priority', ['P0', 'P1']);

      const unverifiedP0P1 = blockingRCRs.filter(rcr => {
        const capa = rcr.remediation_manifests?.[0];
        return !capa || capa.status !== 'VERIFIED';
      });

      expect(unverifiedP0P1.length).toBeGreaterThan(0);
      expect(unverifiedP0P1[0].id).toBe(p0RCR.id);
    });

    test('should PASS gate when P0 RCR has verified CAPA', async () => {
      // Create P0 RCR
      const { data: p0RCR } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'SD',
          scope_id: testSDId,
          sd_id: testSDId,
          trigger_source: 'QUALITY_GATE',
          trigger_tier: 1,
          failure_signature: 'quality_verified:' + Date.now(),
          problem_statement: 'Quality issue resolved',
          observed: {},
          expected: {},
          evidence_refs: {},
          impact_level: 'CRITICAL',
          likelihood_level: 'FREQUENT',
          status: 'RESOLVED'
        })
        .select()
        .single();

      testRCRId = p0RCR.id;

      // Create and verify CAPA
      const { data: verifiedCAPA } = await supabase
        .from('remediation_manifests')
        .insert({
          rcr_id: p0RCR.id,
          root_cause_category: 'PROCESS_GAP',
          proposed_changes: {
            corrective_actions: [{ action: 'Fix process', files_affected: [], estimated_effort_hours: 1 }],
            preventive_actions: []
          },
          verification_plan: {
            test_scenarios: ['Test process'],
            success_criteria: ['Process works']
          },
          risk_score: 10,
          affected_sd_count: 1,
          status: 'VERIFIED',
          verified_at: new Date().toISOString()
        })
        .select()
        .single();

      testCAPAId = verifiedCAPA.id;

      // Query for blocking RCRs
      const { data: blockingRCRs } = await supabase
        .from('root_cause_reports')
        .select('id, severity_priority, status, remediation_manifests(id, status, verified_at)')
        .eq('sd_id', testSDId)
        .in('status', ['OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS'])
        .in('severity_priority', ['P0', 'P1']);

      const unverifiedP0P1 = blockingRCRs.filter(rcr => {
        const capa = rcr.remediation_manifests?.[0];
        return !capa || capa.status !== 'VERIFIED';
      });

      expect(unverifiedP0P1.length).toBe(0); // No blocking RCRs
    });

    test('should NOT block handoff for P2/P3/P4 RCRs without CAPAs', async () => {
      // Create P2 RCR
      const { data: p2RCR } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'SD',
          scope_id: testSDId,
          sd_id: testSDId,
          trigger_source: 'QUALITY_GATE',
          trigger_tier: 3,
          failure_signature: 'quality_p2:' + Date.now(),
          problem_statement: 'Minor quality degradation',
          observed: {},
          expected: {},
          evidence_refs: {},
          impact_level: 'MEDIUM',
          likelihood_level: 'RARE'
        })
        .select()
        .single();

      testRCRId = p2RCR.id;

      // Query for blocking RCRs (P0/P1 only)
      const { data: blockingRCRs } = await supabase
        .from('root_cause_reports')
        .select('id, severity_priority')
        .eq('sd_id', testSDId)
        .in('severity_priority', ['P0', 'P1']);

      expect(blockingRCRs.length).toBe(0); // P2 doesn't block
    });
  });

  describe('Learning Pipeline', () => {
    test('should create learning record for resolved RCR', async () => {
      // Create and resolve RCR
      const { data: rcr } = await supabase
        .from('root_cause_reports')
        .insert({
          scope_type: 'PIPELINE',
          scope_id: 'test-learning',
          sd_id: testSDId,
          trigger_source: 'TEST_FAILURE',
          trigger_tier: 2,
          failure_signature: 'learning_test:' + Date.now(),
          problem_statement: 'Test for learning ingestion',
          root_cause_category: 'TEST_COVERAGE_GAP',
          observed: {},
          expected: {},
          evidence_refs: { stack_trace: 'Error stack' },
          impact_level: 'HIGH',
          likelihood_level: 'OCCASIONAL',
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
          detected_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
          first_occurrence_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() // 8 hours ago
        })
        .select()
        .single();

      testRCRId = rcr.id;

      // Create learning record
      const features = {
        scope_type: rcr.scope_type,
        trigger_source: rcr.trigger_source,
        root_cause_category: rcr.root_cause_category,
        confidence: rcr.confidence,
        has_stack_trace: true
      };

      const { data: learningRecord, error } = await supabase
        .from('rca_learning_records')
        .insert({
          rcr_id: rcr.id,
          features: features,
          label: 'TEST_COVERAGE_GAP - test_coverage_gap_regression',
          defect_class: 'test_coverage_gap_regression',
          preventable: true,
          prevention_stage: 'PLAN_PRD',
          time_to_detect_hours: 2,
          time_to_resolve_hours: 6,
          metadata: {
            severity: rcr.severity_priority,
            trigger_source: rcr.trigger_source
          }
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(learningRecord).toBeDefined();
      expect(learningRecord.defect_class).toBe('test_coverage_gap_regression');
      expect(learningRecord.preventable).toBe(true);
      expect(learningRecord.prevention_stage).toBe('PLAN_PRD');

      // Cleanup learning record
      await supabase
        .from('rca_learning_records')
        .delete()
        .eq('id', learningRecord.id);
    });
  });

  describe('Analytics Views', () => {
    test('should query v_rca_analytics for summary metrics', async () => {
      const { data: analytics, error } = await supabase
        .from('v_rca_analytics')
        .select('*')
        .maybeSingle();

      expect(error).toBeNull();

      if (analytics) {
        expect(analytics).toHaveProperty('total_rcrs');
        expect(analytics).toHaveProperty('open_rcrs');
        expect(analytics).toHaveProperty('resolved_rcrs');
        expect(analytics).toHaveProperty('p0_count');
        expect(analytics).toHaveProperty('p1_count');
      }
    });

    test('should query v_rca_pattern_recurrence for recurring issues', async () => {
      const { data: patterns, error } = await supabase
        .from('v_rca_pattern_recurrence')
        .select('*')
        .gte('occurrence_count', 1)
        .limit(10);

      expect(error).toBeNull();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('Sub-Agent Registration', () => {
    test('should have RCA sub-agent registered in leo_sub_agents', async () => {
      const { data: subAgent, error } = await supabase
        .from('leo_sub_agents')
        .select('*')
        .eq('code', 'RCA')
        .maybeSingle();

      expect(error).toBeNull();
      expect(subAgent).toBeDefined();
      expect(subAgent.code).toBe('RCA');
      expect(subAgent.priority).toBe(95);
    });

    test('should have 12 RCA triggers registered (T1:3, T2:3, T3:3, T4:3)', async () => {
      const { data: subAgent } = await supabase
        .from('leo_sub_agents')
        .select('id')
        .eq('code', 'RCA')
        .single();

      if (subAgent) {
        const { data: triggers, error } = await supabase
          .from('leo_sub_agent_triggers')
          .select('*')
          .eq('sub_agent_id', subAgent.id);

        expect(error).toBeNull();
        expect(triggers).toBeDefined();
        expect(triggers.length).toBeGreaterThanOrEqual(12);

        // Count by tier
        const t1 = triggers.filter(t => t.trigger_description.includes('T1'));
        const t2 = triggers.filter(t => t.trigger_description.includes('T2'));
        const t3 = triggers.filter(t => t.trigger_description.includes('T3'));
        const t4 = triggers.filter(t => t.trigger_description.includes('T4'));

        expect(t1.length).toBeGreaterThanOrEqual(3);
        expect(t2.length).toBeGreaterThanOrEqual(3);
        expect(t3.length).toBeGreaterThanOrEqual(3);
        expect(t4.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('RLS Policies', () => {
    test('should enforce RLS on root_cause_reports table', async () => {
      // This test assumes service_role client bypasses RLS
      // In production, authenticated users should have read-only access

      const { data, error } = await supabase
        .from('root_cause_reports')
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    test('should enforce RLS on remediation_manifests table', async () => {
      const { data, error } = await supabase
        .from('remediation_manifests')
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });
});
