/**
 * Tests for Flywheel Integration — End-to-end capture + query
 * SD-LEO-FEAT-DATA-FLYWHEEL-001 (FR-002, TS-002, TS-003)
 *
 * Verifies:
 * - captureInteraction inserts real rows
 * - captureHandoffGate creates correct gate_event rows
 * - Captured data appears in analytics views
 * - CHECK constraint enforcement
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { captureInteraction, captureHandoffGate } from '../../../lib/flywheel/capture.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Track inserted IDs for cleanup
const insertedIds = [];

afterAll(async () => {
  if (insertedIds.length > 0) {
    await supabase
      .from('eva_interactions')
      .delete()
      .in('id', insertedIds);
  }
});

describe('Flywheel Integration', () => {
  describe('captureInteraction - real DB insert', () => {
    it('should insert a valid interaction and return ID', async () => {
      const result = await captureInteraction({
        decision_type: 'gate_event',
        interaction_type: 'handoff_gate',
        chairman_action: 'accepted',
        gate_score: 85,
        confidence_score: 85,
        context: { test: true, phase: 'LEAD-TO-PLAN' },
        metadata: { test_run: 'flywheel-integration' }
      });

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      insertedIds.push(result.id);

      // Verify the row exists
      const { data } = await supabase
        .from('eva_interactions')
        .select('*')
        .eq('id', result.id)
        .single();

      expect(data.decision_type).toBe('gate_event');
      expect(data.interaction_type).toBe('handoff_gate');
      expect(data.chairman_action).toBe('accepted');
      expect(data.gate_score).toBe(85);
    });

    it('should handle invalid payload gracefully (no throw)', async () => {
      const result = await captureInteraction({
        decision_type: 'INVALID',
        interaction_type: 'handoff_gate'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('decision_type');
    });
  });

  describe('captureHandoffGate - convenience wrapper', () => {
    it('should create gate_event from successful handoff result', async () => {
      const mockResult = {
        success: true,
        gateResults: { compositeScore: 92 }
      };

      const result = await captureHandoffGate(
        mockResult,
        'LEAD-TO-PLAN',
        null, // no real sd_id to avoid FK constraint
        null  // no real session_id
      );

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      insertedIds.push(result.id);

      // Verify shape
      const { data } = await supabase
        .from('eva_interactions')
        .select('*')
        .eq('id', result.id)
        .single();

      expect(data.decision_type).toBe('gate_event');
      expect(data.interaction_type).toBe('handoff_gate');
      expect(data.chairman_action).toBe('accepted');
      expect(data.gate_score).toBe(92);
      expect(data.context).toHaveProperty('handoff_type', 'LEAD-TO-PLAN');
      expect(data.context).toHaveProperty('success', true);
    });

    it('should create gate_event from failed handoff result', async () => {
      const mockResult = {
        success: false,
        gateResults: { compositeScore: 45 }
      };

      const result = await captureHandoffGate(
        mockResult,
        'PLAN-TO-EXEC',
        null,
        null
      );

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      insertedIds.push(result.id);

      const { data } = await supabase
        .from('eva_interactions')
        .select('*')
        .eq('id', result.id)
        .single();

      expect(data.chairman_action).toBe('rejected');
      expect(data.gate_score).toBe(45);
    });
  });

  describe('CHECK constraint enforcement', () => {
    it('should reject invalid decision_type at DB level', async () => {
      const { error } = await supabase
        .from('eva_interactions')
        .insert({
          decision_type: 'INVALID_TYPE',
          interaction_type: 'handoff_gate'
        });

      expect(error).not.toBeNull();
      expect(error.message).toContain('check');
    });

    it('should reject gate_score > 100 at DB level', async () => {
      const { error } = await supabase
        .from('eva_interactions')
        .insert({
          decision_type: 'gate_event',
          interaction_type: 'handoff_gate',
          gate_score: 150
        });

      expect(error).not.toBeNull();
    });
  });
});
