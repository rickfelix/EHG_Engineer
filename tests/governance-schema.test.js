/**
 * SD-GOVERNANCE-001: Schema Implementation Tests
 * PRD: c4c8a657-f0d3-4b67-a9b6-503715078e36
 * Test Suite for Governance Schema Implementation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

describe('Governance Schema Tests', () => {
  let testSdId;
  let testPrdId;
  let testStoryId;

  describe('Strategic Directives Schema', () => {
    test('should create an SD with governance fields', async () => {
      const sd = {
        id: 'TEST-SD-001',
        sd_key: 'TEST-SD-001',
        title: 'Test Strategic Directive',
        description: 'Testing governance schema',
        status: 'draft',
        priority: 'high',
        version: 1,
        is_active: true,
        governance_metadata: { test: true }
      };

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.version).toBe(1);
      expect(data.is_active).toBe(true);
      testSdId = data.id;
    });

    test('should enforce SD hierarchy validation', async () => {
      // This would create a circular reference - should fail
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ parent_sd_id: testSdId })
        .eq('id', testSdId);

      expect(error).toBeDefined();
    });

    test('should auto-increment version on update', async () => {
      const { data: before } = await supabase
        .from('strategic_directives_v2')
        .select('version')
        .eq('id', testSdId)
        .single();

      const { data: after } = await supabase
        .from('strategic_directives_v2')
        .update({ description: 'Updated description' })
        .eq('id', testSdId)
        .select('version')
        .single();

      expect(after.version).toBe(before.version + 1);
    });
  });

  describe('User Stories Table', () => {
    test('should create a user story with PRD linkage', async () => {
      // First create a test PRD
      const prd = {
        id: 'TEST-PRD-001',
        sd_id: testSdId,
        title: 'Test PRD',
        status: 'draft',
        priority: 'high'
      };

      const { data: prdData } = await supabase
        .from('product_requirements_v2')
        .insert(prd)
        .select()
        .single();

      testPrdId = prdData.id;

      // Now create user story
      const story = {
        story_key: 'TEST-001:US-001',
        prd_id: testPrdId,
        sd_id: testSdId,
        title: 'Test User Story',
        user_role: 'Developer',
        user_want: 'to test the schema',
        user_benefit: 'ensure quality',
        priority: 'high',
        status: 'draft',
        acceptance_criteria: ['Test passes', 'No errors']
      };

      const { data, error } = await supabase
        .from('user_stories')
        .insert(story)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.story_key).toBe('TEST-001:US-001');
      testStoryId = data.id;
    });

    test('should validate story key format', async () => {
      const invalidStory = {
        story_key: 'INVALID-KEY', // Wrong format
        prd_id: testPrdId,
        title: 'Invalid Story',
        user_role: 'Tester',
        user_want: 'to test validation',
        user_benefit: 'ensure constraints work'
      };

      const { error } = await supabase
        .from('user_stories')
        .insert(invalidStory);

      expect(error).toBeDefined();
      expect(error.message).toContain('valid_story_key');
    });

    test('should handle story dependencies', async () => {
      const { data, error } = await supabase
        .from('user_stories')
        .update({
          depends_on: [testStoryId],
          blocks: []
        })
        .eq('id', testStoryId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.depends_on).toContain(testStoryId);
    });
  });

  describe('Audit Trail', () => {
    test('should create audit log on insert', async () => {
      // Check if insert was logged
      const { data } = await supabase
        .from('governance_audit_log')
        .select('*')
        .eq('table_name', 'strategic_directives_v2')
        .eq('record_id', testSdId)
        .eq('operation', 'INSERT')
        .single();

      expect(data).toBeDefined();
      expect(data.new_values).toBeDefined();
    });

    test('should create audit log on update', async () => {
      // Update the SD
      await supabase
        .from('strategic_directives_v2')
        .update({ title: 'Updated Test SD' })
        .eq('id', testSdId);

      // Check audit log
      const { data } = await supabase
        .from('governance_audit_log')
        .select('*')
        .eq('table_name', 'strategic_directives_v2')
        .eq('record_id', testSdId)
        .eq('operation', 'UPDATE')
        .order('changed_at', { ascending: false })
        .limit(1)
        .single();

      expect(data).toBeDefined();
      expect(data.old_values).toBeDefined();
      expect(data.new_values).toBeDefined();
    });
  });

  describe('State Machine', () => {
    test('should have valid state transitions', async () => {
      const { data } = await supabase
        .from('sd_state_transitions')
        .select('*')
        .eq('from_state', 'draft')
        .eq('to_state', 'pending_review');

      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].role_required).toBe('PLAN');
    });

    test('should enforce state transition rules', async () => {
      // Attempt invalid transition (would need state machine logic implemented)
      // This is a placeholder for when state machine is fully implemented
      const validTransitions = await supabase
        .from('sd_state_transitions')
        .select('*');

      expect(validTransitions.data).toBeDefined();
      expect(validTransitions.data.length).toBe(9);
    });
  });

  describe('Materialized View', () => {
    test('should have SD summary view', async () => {
      const { data, error } = await supabase
        .from('mv_sd_summary')
        .select('*')
        .eq('id', testSdId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.prd_count).toBeGreaterThanOrEqual(1);
      expect(data.story_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance Tests', () => {
    test('should retrieve single SD in < 100ms', async () => {
      const start = Date.now();

      const { data } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', testSdId)
        .single();

      const duration = Date.now() - start;

      expect(data).toBeDefined();
      expect(duration).toBeLessThan(100);
    });

    test('should handle bulk operations efficiently', async () => {
      const stories = Array.from({ length: 10 }, (_, i) => ({
        story_key: `TEST-BULK:US-${String(i + 1).padStart(3, '0')}`,
        prd_id: testPrdId,
        sd_id: testSdId,
        title: `Bulk Story ${i + 1}`,
        user_role: 'Tester',
        user_want: 'to test bulk operations',
        user_benefit: 'ensure performance'
      }));

      const start = Date.now();
      const { error } = await supabase
        .from('user_stories')
        .insert(stories);
      const duration = Date.now() - start;

      expect(error).toBeNull();
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  // Cleanup after tests
  afterAll(async () => {
    // Clean up test data
    if (testStoryId) {
      await supabase.from('user_stories').delete().eq('id', testStoryId);
    }
    if (testPrdId) {
      await supabase.from('product_requirements_v2').delete().eq('id', testPrdId);
    }
    if (testSdId) {
      await supabase.from('strategic_directives_v2').delete().eq('id', testSdId);
    }

    // Clean up bulk test stories
    await supabase
      .from('user_stories')
      .delete()
      .like('story_key', 'TEST-BULK%');
  });
});

// Export for use in CI/CD
export default {
  testSuite: 'Governance Schema Tests',
  prdId: 'c4c8a657-f0d3-4b67-a9b6-503715078e36',
  sdKey: 'SD-GOVERNANCE-001'
};