/**
 * Unit Tests for Blocked State Detection
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-12
 *
 * Tests the ALL_BLOCKED state detection, aggregation, and decision recording.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  detectAllBlockedState,
  persistAllBlockedState,
  recordUserDecision
} from '../../scripts/modules/sd-next/blocked-state-detector.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Blocked State Detector', () => {
  let testOrchestratorId = null;
  let testChildIds = [];

  beforeEach(async () => {
    const timestamp = Date.now();
    testOrchestratorId = `TEST-ORCH-${timestamp}`;

    // Create test orchestrator SD
    const { error: orchError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: testOrchestratorId,
        sd_key: testOrchestratorId,
        title: 'Test Orchestrator for Blocked State',
        sd_type: 'orchestrator',
        status: 'active',
        is_active: true,
        metadata: {}
      });

    if (orchError) throw new Error(`Failed to create test orchestrator: ${orchError.message}`);

    // Create test children
    const childId1 = `TEST-CHILD-1-${timestamp}`;
    const childId2 = `TEST-CHILD-2-${timestamp}`;
    const childId3 = `TEST-CHILD-3-${timestamp}`;

    testChildIds = [childId1, childId2, childId3];

    const children = [
      {
        id: childId1,
        sd_key: childId1,
        title: 'Test Child 1 - Blocked',
        sd_type: 'feature',
        status: 'active',
        parent_sd_id: testOrchestratorId,
        is_active: true,
        metadata: { blocked: true, blocked_reason: 'Waiting for external API' }
      },
      {
        id: childId2,
        sd_key: childId2,
        title: 'Test Child 2 - Blocked by Dependency',
        sd_type: 'feature',
        status: 'active',
        parent_sd_id: testOrchestratorId,
        is_active: true,
        dependencies: ['non-existent-dep'],
        metadata: {}
      },
      {
        id: childId3,
        sd_key: childId3,
        title: 'Test Child 3 - Completed',
        sd_type: 'feature',
        status: 'completed',
        parent_sd_id: testOrchestratorId,
        is_active: true,
        metadata: {}
      }
    ];

    const { error: childError } = await supabase
      .from('strategic_directives_v2')
      .insert(children);

    if (childError) throw new Error(`Failed to create test children: ${childError.message}`);
  });

  afterEach(async () => {
    // Clean up test data
    if (testChildIds.length > 0) {
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .in('id', testChildIds);
    }

    if (testOrchestratorId) {
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', testOrchestratorId);
    }

    testOrchestratorId = null;
    testChildIds = [];
  });

  describe('detectAllBlockedState', () => {
    it('should detect ALL_BLOCKED when all non-terminal children are blocked', async () => {
      const result = await detectAllBlockedState(testOrchestratorId, supabase);

      expect(result.isAllBlocked).toBe(true);
      expect(result.orchestratorId).toBe(testOrchestratorId);
      expect(result.totalChildren).toBe(3);
      expect(result.terminalChildren).toBe(1); // One completed
      expect(result.blockedChildren).toBe(2); // Two blocked
      expect(result.runnableChildren).toBe(0); // None runnable
      expect(result.blockers).toBeDefined();
      expect(Array.isArray(result.blockers)).toBe(true);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.detectedAt).toBeDefined();
    });

    it('should return blocker information with severity and recommendations', async () => {
      const result = await detectAllBlockedState(testOrchestratorId, supabase);

      expect(result.blockers.length).toBeGreaterThan(0);

      const blocker = result.blockers[0];
      expect(blocker).toHaveProperty('id');
      expect(blocker).toHaveProperty('type');
      expect(blocker).toHaveProperty('title');
      expect(blocker).toHaveProperty('description');
      expect(blocker).toHaveProperty('severity');
      expect(blocker).toHaveProperty('occurrences');
      expect(blocker).toHaveProperty('affectedChildIds');
      expect(blocker).toHaveProperty('recommendedActions');
      expect(Array.isArray(blocker.recommendedActions)).toBe(true);
    });

    it('should aggregate duplicate blockers', async () => {
      const timestamp = Date.now();
      const dupChildId = `TEST-CHILD-DUP-${timestamp}`;

      // Add another child with the same blocker type
      await supabase
        .from('strategic_directives_v2')
        .insert({
          id: dupChildId,
          sd_key: dupChildId,
          title: 'Test Child Duplicate Blocker',
          sd_type: 'feature',
          status: 'active',
          parent_sd_id: testOrchestratorId,
          is_active: true,
          metadata: { blocked: true, blocked_reason: 'Waiting for external API' }
        });

      testChildIds.push(dupChildId);

      const result = await detectAllBlockedState(testOrchestratorId, supabase);

      // Find the explicit_block blocker
      const explicitBlocker = result.blockers.find(b => b.type === 'explicit_block');
      expect(explicitBlocker).toBeDefined();
      expect(explicitBlocker.occurrences).toBeGreaterThan(1);
      expect(explicitBlocker.affectedChildIds.length).toBeGreaterThan(1);
    });

    it('should return error for non-existent orchestrator', async () => {
      const result = await detectAllBlockedState('non-existent-id', supabase);

      expect(result.error).toBeDefined();
      expect(result.isAllBlocked).toBe(false);
    });

    it('should return error for non-orchestrator SD', async () => {
      // Use one of the child SDs (not an orchestrator)
      const result = await detectAllBlockedState(testChildIds[0], supabase);

      expect(result.error).toBeDefined();
      expect(result.error).toContain('not an orchestrator type');
    });
  });

  describe('persistAllBlockedState', () => {
    it('should persist blocked state to orchestrator metadata', async () => {
      const blockedState = await detectAllBlockedState(testOrchestratorId, supabase);
      const success = await persistAllBlockedState(testOrchestratorId, blockedState, supabase);

      expect(success).toBe(true);

      // Verify metadata was updated
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('metadata')
        .eq('id', testOrchestratorId)
        .single();

      expect(sd.metadata).toHaveProperty('all_blocked_state');
      expect(sd.metadata.all_blocked_state.is_blocked).toBe(true);
      expect(sd.metadata.all_blocked_state.awaiting_decision).toBe(true);
      expect(sd.metadata.all_blocked_state.blockers).toBeDefined();
    });
  });

  describe('recordUserDecision', () => {
    beforeEach(async () => {
      // Set up blocked state
      const blockedState = await detectAllBlockedState(testOrchestratorId, supabase);
      await persistAllBlockedState(testOrchestratorId, blockedState, supabase);
    });

    it('should record resume decision', async () => {
      const result = await recordUserDecision(testOrchestratorId, 'resume', {}, supabase);

      expect(result.success).toBe(true);
      expect(result.decision).toBeDefined();
      expect(result.decision.decision).toBe('resume');
      expect(result.decision.timestamp).toBeDefined();

      // Verify metadata update
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('metadata')
        .eq('id', testOrchestratorId)
        .single();

      expect(sd.metadata.all_blocked_state.is_blocked).toBe(false);
      expect(sd.metadata.all_blocked_state.awaiting_decision).toBe(false);
      expect(sd.metadata.decision_history).toBeDefined();
      expect(sd.metadata.decision_history.length).toBeGreaterThan(0);
    });

    it('should record cancel decision and update status', async () => {
      const result = await recordUserDecision(
        testOrchestratorId,
        'cancel',
        { reason: 'Test cancellation reason for unit test' },
        supabase
      );

      expect(result.success).toBe(true);
      expect(result.decision.decision).toBe('cancel');

      // Verify status was changed to cancelled
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('status, metadata')
        .eq('id', testOrchestratorId)
        .single();

      expect(sd.status).toBe('cancelled');
      expect(sd.metadata.all_blocked_state.is_blocked).toBe(false);
    });

    it('should require reason for override decision', async () => {
      const result = await recordUserDecision(
        testOrchestratorId,
        'override',
        { reason: 'short' }, // Too short
        supabase
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 10 characters');
    });

    it('should accept override with valid reason', async () => {
      const result = await recordUserDecision(
        testOrchestratorId,
        'override',
        { reason: 'Valid override reason for testing purposes' },
        supabase
      );

      expect(result.success).toBe(true);
      expect(result.decision.decision).toBe('override');
      expect(result.decision.reason).toBe('Valid override reason for testing purposes');
    });

    it('should reject invalid decisions', async () => {
      const result = await recordUserDecision(
        testOrchestratorId,
        'invalid-decision',
        {},
        supabase
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid decision');
    });
  });
});
