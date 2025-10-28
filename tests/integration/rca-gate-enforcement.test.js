/**
 * RCA Gate Enforcement Integration Test
 * SD-RCA-001
 *
 * Tests that the RCA gate properly blocks EXEC->PLAN handoffs when P0/P1 RCRs exist without verified CAPAs.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { checkRCAGate } from '../../scripts/root-cause-agent.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TEST_SD_ID = 'SD-RCA-GATE-TEST';
let testRCRId = null;
let testCAPAId = null;

describe('RCA Gate Enforcement', () => {
  afterAll(async () => {
    // Cleanup: Delete test data
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

  it('should PASS when no P0/P1 RCRs exist', async () => {
    const result = await checkRCAGate('SD-NONEXISTENT-12345');

    expect(result.blocked).toBe(false);
    expect(result.totalP0P1).toBe(0);
    expect(result.blockingRCRs.length).toBe(0);
    expect(result.message).toContain('0 open P0/P1 RCRs');
  });

  it('should BLOCK when P0 RCR exists without verified CAPA', async () => {
    // Create a test P0 RCR
    const { data: rcr, error: rcrError } = await supabase
      .from('root_cause_reports')
      .insert({
        scope_type: 'SD',
        scope_id: TEST_SD_ID,
        sd_id: TEST_SD_ID,
        trigger_source: 'MANUAL',
        trigger_tier: 4,
        failure_signature: `test-gate-enforcement-${Date.now()}`,
        problem_statement: 'Test P0 defect for gate enforcement',
        observed: { test: 'data' },
        expected: { test: 'expected' },
        confidence: 85,
        impact_level: 'CRITICAL',
        likelihood_level: 'FREQUENT',
        status: 'OPEN'
      })
      .select()
      .single();

    if (rcrError) {
      console.error('Error creating test RCR:', rcrError);
      throw rcrError;
    }

    testRCRId = rcr.id;
    expect(testRCRId).toBeDefined();

    // Check gate - should be BLOCKED
    const result = await checkRCAGate(TEST_SD_ID);

    expect(result.blocked).toBe(true);
    expect(result.totalP0P1).toBeGreaterThan(0);
    expect(result.blockingRCRs.length).toBeGreaterThan(0);
    expect(result.message).toContain('without verified CAPA');
    expect(result.blockingRCRs[0].severity_priority).toBe('P0');
  });

  it('should PASS when P0 RCR has verified CAPA', async () => {
    expect(testRCRId).toBeDefined();

    // Create a CAPA manifest
    const { data: capa, error: capaError } = await supabase
      .from('remediation_manifests')
      .insert({
        rcr_id: testRCRId,
        corrective_actions: [
          {
            action: 'Fix test defect',
            owner: 'test-runner',
            deadline: new Date(Date.now() + 86400000).toISOString(),
            status: 'COMPLETED'
          }
        ],
        preventive_actions: [
          {
            action: 'Add regression test',
            owner: 'qa-team',
            deadline: new Date(Date.now() + 172800000).toISOString(),
            status: 'PLANNED'
          }
        ],
        root_causes_addressed: ['test-root-cause'],
        success_criteria: ['Defect resolved', 'Tests passing'],
        status: 'VERIFIED',
        verified_at: new Date().toISOString()
      })
      .select()
      .single();

    if (capaError) {
      console.error('Error creating test CAPA:', capaError);
      throw capaError;
    }

    testCAPAId = capa.id;
    expect(testCAPAId).toBeDefined();

    // Check gate - should now PASS
    const result = await checkRCAGate(TEST_SD_ID);

    expect(result.blocked).toBe(false);
    expect(result.totalP0P1).toBeGreaterThan(0);
    expect(result.blockingRCRs.length).toBe(0);
    expect(result.message).toContain('verified CAPAs');
  });

  it('should handle database errors gracefully', async () => {
    // Test with invalid SD ID format to trigger potential errors
    const result = await checkRCAGate(null);

    expect(result.blocked).toBe(false);
    expect(result.message).toContain('No SD ID provided');
  });
});
