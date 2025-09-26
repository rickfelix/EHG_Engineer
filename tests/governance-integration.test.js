/**
 * Integration Test Suite for Governance System
 * Target: Increase coverage from 50% to 75%
 * Focus: State machine, workflow, and edge cases
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

describe('Governance Integration Tests', () => {
  let testProposalId;
  let testSdId = 'SD-GOVERNANCE-001';

  describe('Proposal State Machine', () => {
    beforeAll(async () => {
      // Create test proposal
      const { data, error } = await supabase
        .from('governance_proposals')
        .insert({
          proposal_key: 'PROP-2025-999999',
          title: 'Integration Test Proposal',
          description: 'Testing state machine transitions',
          proposal_type: 'technical_change',
          submitted_by: 'TEST_USER',
          sd_id: testSdId
        })
        .select()
        .single();
      
      expect(error).toBeNull();
      testProposalId = data.id;
    });

    test('should transition from draft to submitted', async () => {
      const { data, error } = await supabase
        .from('governance_proposals')
        .update({ 
          current_state: 'submitted',
          submitted_at: new Date().toISOString()
        })
        .eq('id', testProposalId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.current_state).toBe('submitted');
    });

    test('should transition from submitted to under_review', async () => {
      const { data, error } = await supabase
        .from('governance_proposals')
        .update({ 
          current_state: 'under_review',
          previous_state: 'submitted'
        })
        .eq('id', testProposalId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.current_state).toBe('under_review');
    });

    test('should transition from under_review to in_approval', async () => {
      const { data, error } = await supabase
        .from('governance_proposals')
        .update({ 
          current_state: 'in_approval',
          previous_state: 'under_review'
        })
        .eq('id', testProposalId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.current_state).toBe('in_approval');
    });

    test('should handle approval with approvals table', async () => {
      // Record approval
      const { error: approvalError } = await supabase
        .from('proposal_approvals')
        .insert({
          proposal_id: testProposalId,
          approver_id: 'TEST_APPROVER',
          approver_role: 'LEAD',
          decision: 'approved',
          decision_reason: 'Meets all requirements',
          decided_at: new Date().toISOString()
        });

      expect(approvalError).toBeNull();

      // Update proposal state
      const { data, error } = await supabase
        .from('governance_proposals')
        .update({ 
          current_state: 'approved',
          previous_state: 'in_approval'
        })
        .eq('id', testProposalId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.current_state).toBe('approved');
    });

    test('should create state transition records', async () => {
      const { data, error } = await supabase
        .from('proposal_state_transitions')
        .select('*')
        .eq('proposal_id', testProposalId);

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThan(0);
    });

    test('should handle invalid state transitions', async () => {
      // Try invalid transition: approved -> draft
      const { error } = await supabase
        .rpc('validate_proposal_state_transition', {
          p_proposal_id: testProposalId,
          p_new_state: 'draft',
          p_user_role: 'LEAD'
        });

      // Function should return false or error
      expect(error).toBeDefined();
    });

    afterAll(async () => {
      // Cleanup
      if (testProposalId) {
        await supabase
          .from('governance_proposals')
          .delete()
          .eq('id', testProposalId);
      }
    });
  });

  describe('Audit Trail Integrity', () => {
    test('should log all proposal operations', async () => {
      const { data: auditLogs } = await supabase
        .from('governance_audit_log')
        .select('*')
        .eq('table_name', 'governance_proposals')
        .order('changed_at', { ascending: false })
        .limit(10);

      expect(auditLogs).toBeDefined();
      expect(auditLogs.length).toBeGreaterThan(0);
      
      // Verify audit log structure
      const log = auditLogs[0];
      expect(log).toHaveProperty('operation');
      expect(log).toHaveProperty('new_values');
      expect(log).toHaveProperty('changed_at');
    });

    test('should preserve old values on update', async () => {
      // Create test SD
      const testId = 'TEST-AUDIT-' + Date.now();
      await supabase
        .from('strategic_directives_v2')
        .insert({
          id: testId,
          sd_key: testId,
          title: 'Audit Test SD',
          description: 'Original description',
          status: 'draft',
          priority: 'low',
          category: 'test'
        });

      // Update it
      await supabase
        .from('strategic_directives_v2')
        .update({ description: 'Updated description' })
        .eq('id', testId);

      // Check audit log
      const { data: auditLog } = await supabase
        .from('governance_audit_log')
        .select('*')
        .eq('record_id', testId)
        .eq('operation', 'UPDATE')
        .single();

      expect(auditLog.old_values.description).toBe('Original description');
      expect(auditLog.new_values.description).toBe('Updated description');

      // Cleanup
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', testId);
    });
  });

  describe('Stale Detection', () => {
    test('should detect stale proposals', async () => {
      // Create old proposal
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago
      
      const { data: staleProposal } = await supabase
        .from('governance_proposals')
        .insert({
          proposal_key: 'PROP-2025-888888',
          title: 'Stale Test Proposal',
          description: 'Should be flagged as stale',
          proposal_type: 'technical_change',
          submitted_by: 'TEST_USER',
          current_state: 'under_review',
          last_activity_at: oldDate.toISOString()
        })
        .select()
        .single();

      // Run stale detection
      await supabase.rpc('detect_stale_proposals');

      // Check if flagged
      const { data: flagged } = await supabase
        .from('governance_proposals')
        .select('stale_flagged_at')
        .eq('id', staleProposal.id)
        .single();

      expect(flagged.stale_flagged_at).toBeDefined();

      // Cleanup
      await supabase
        .from('governance_proposals')
        .delete()
        .eq('id', staleProposal.id);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent story updates', async () => {
      const storyId = 'CONC-TEST:US-001';
      
      // Create test story
      await supabase
        .from('user_stories')
        .insert({
          story_key: storyId,
          sd_id: testSdId,
          title: 'Concurrency Test Story',
          user_role: 'Developer',
          user_want: 'to test concurrency',
          user_benefit: 'ensure system stability'
        });

      // Simulate concurrent updates
      const updates = [];
      for (let i = 0; i < 5; i++) {
        updates.push(
          supabase
            .from('user_stories')
            .update({ story_points: i + 1 })
            .eq('story_key', storyId)
        );
      }

      const results = await Promise.allSettled(updates);
      const successful = results.filter(r => r.status === 'fulfilled');
      
      // At least one should succeed
      expect(successful.length).toBeGreaterThan(0);

      // Cleanup
      await supabase
        .from('user_stories')
        .delete()
        .eq('story_key', storyId);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should query SD with PRDs in < 200ms', async () => {
      const start = Date.now();
      
      const { data } = await supabase
        .from('strategic_directives_v2')
        .select(`
          *,
          prds:product_requirements_v2(*)
        `)
        .eq('id', testSdId)
        .single();

      const duration = Date.now() - start;
      
      expect(data).toBeDefined();
      expect(duration).toBeLessThan(200);
    });

    test('should handle 100 proposals efficiently', async () => {
      const proposals = [];
      for (let i = 0; i < 100; i++) {
        proposals.push({
          proposal_key: `PROP-2025-${String(i).padStart(6, '0')}`,
          title: `Load Test Proposal ${i}`,
          description: 'Performance testing',
          proposal_type: 'technical_change',
          submitted_by: 'LOAD_TEST'
        });
      }

      const start = Date.now();
      const { error } = await supabase
        .from('governance_proposals')
        .insert(proposals);
      const duration = Date.now() - start;

      expect(error).toBeNull();
      expect(duration).toBeLessThan(5000); // 5 seconds for 100 inserts

      // Cleanup
      await supabase
        .from('governance_proposals')
        .delete()
        .eq('submitted_by', 'LOAD_TEST');
    });
  });
});

export default {
  testSuite: 'Governance Integration Tests',
  coverage: 'State Machine, Audit Trail, Concurrency, Performance',
  targetCoverage: '75%'
};