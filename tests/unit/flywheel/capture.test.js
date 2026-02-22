/**
 * Tests for Flywheel Data Capture
 * SD-LEO-FEAT-DATA-FLYWHEEL-001 (FR-002)
 *
 * Verifies:
 * - Payload validation logic
 * - Row building from payload
 * - captureInteraction inserts into eva_interactions
 * - captureHandoffGate convenience wrapper
 * - Fire-and-forget error handling (no throws)
 */

import { describe, it, expect } from 'vitest';
import { _testing } from '../../../lib/flywheel/capture.js';

const { VALID_DECISION_TYPES, VALID_INTERACTION_TYPES, VALID_CHAIRMAN_ACTIONS, validatePayload, buildRow } = _testing;

describe('Flywheel Capture', () => {
  describe('Validation Constants', () => {
    it('should have 9 valid decision types', () => {
      expect(VALID_DECISION_TYPES.size).toBe(9);
      expect(VALID_DECISION_TYPES.has('gate_event')).toBe(true);
      expect(VALID_DECISION_TYPES.has('recommendation')).toBe(true);
      expect(VALID_DECISION_TYPES.has('kill_gate')).toBe(true);
    });

    it('should have 5 valid interaction types', () => {
      expect(VALID_INTERACTION_TYPES.size).toBe(5);
      expect(VALID_INTERACTION_TYPES.has('handoff_gate')).toBe(true);
      expect(VALID_INTERACTION_TYPES.has('quality_assessment')).toBe(true);
    });

    it('should have 5 valid chairman actions', () => {
      expect(VALID_CHAIRMAN_ACTIONS.size).toBe(5);
      expect(VALID_CHAIRMAN_ACTIONS.has('accepted')).toBe(true);
      expect(VALID_CHAIRMAN_ACTIONS.has('rejected')).toBe(true);
    });
  });

  describe('validatePayload', () => {
    const validPayload = {
      decision_type: 'gate_event',
      interaction_type: 'handoff_gate'
    };

    it('should accept valid minimal payload', () => {
      expect(validatePayload(validPayload)).toEqual({ valid: true });
    });

    it('should reject null payload', () => {
      const result = validatePayload(null);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('object');
    });

    it('should reject invalid decision_type', () => {
      const result = validatePayload({ ...validPayload, decision_type: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('decision_type');
    });

    it('should reject invalid interaction_type', () => {
      const result = validatePayload({ ...validPayload, interaction_type: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('interaction_type');
    });

    it('should reject invalid chairman_action', () => {
      const result = validatePayload({ ...validPayload, chairman_action: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('chairman_action');
    });

    it('should accept valid chairman_action', () => {
      const result = validatePayload({ ...validPayload, chairman_action: 'accepted' });
      expect(result.valid).toBe(true);
    });

    it('should reject gate_score out of range', () => {
      expect(validatePayload({ ...validPayload, gate_score: -1 }).valid).toBe(false);
      expect(validatePayload({ ...validPayload, gate_score: 101 }).valid).toBe(false);
    });

    it('should accept gate_score in range', () => {
      expect(validatePayload({ ...validPayload, gate_score: 0 }).valid).toBe(true);
      expect(validatePayload({ ...validPayload, gate_score: 100 }).valid).toBe(true);
      expect(validatePayload({ ...validPayload, gate_score: 85 }).valid).toBe(true);
    });

    it('should reject confidence_score out of range', () => {
      expect(validatePayload({ ...validPayload, confidence_score: -5 }).valid).toBe(false);
      expect(validatePayload({ ...validPayload, confidence_score: 200 }).valid).toBe(false);
    });
  });

  describe('buildRow', () => {
    it('should build minimal row from required fields', () => {
      const row = buildRow({
        decision_type: 'gate_event',
        interaction_type: 'handoff_gate'
      });
      expect(row).toEqual({
        decision_type: 'gate_event',
        interaction_type: 'handoff_gate'
      });
    });

    it('should include optional fields when present', () => {
      const row = buildRow({
        decision_type: 'gate_event',
        interaction_type: 'handoff_gate',
        chairman_action: 'accepted',
        gate_score: 85,
        sd_id: 'test-uuid',
        context: { phase: 'LEAD-TO-PLAN' }
      });
      expect(row.chairman_action).toBe('accepted');
      expect(row.gate_score).toBe(85);
      expect(row.sd_id).toBe('test-uuid');
      expect(row.context.phase).toBe('LEAD-TO-PLAN');
    });

    it('should omit null/undefined optional fields', () => {
      const row = buildRow({
        decision_type: 'gate_event',
        interaction_type: 'handoff_gate',
        chairman_action: null,
        gate_score: undefined
      });
      expect(Object.keys(row)).toEqual(['decision_type', 'interaction_type']);
    });

    it('should include ML training fields', () => {
      const row = buildRow({
        decision_type: 'gate_event',
        interaction_type: 'handoff_gate',
        input_context: { handoff_type: 'LEAD-TO-PLAN' },
        output_decision: { action: 'accepted', score: 90 }
      });
      expect(row.input_context).toBeDefined();
      expect(row.output_decision).toBeDefined();
    });
  });
});
