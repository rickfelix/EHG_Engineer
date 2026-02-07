/**
 * Tests for Feedback Resolution Validator
 * SD-FDBK-ENH-ADD-INTELLIGENT-RESOLUTION-001
 */

import { describe, it, expect } from 'vitest';
import {
  validateStatusTransition,
  ERROR_CODES
} from '../../../lib/quality/feedback-resolution-validator.js';

describe('feedback-resolution-validator', () => {
  const feedbackId = 'abc-123';

  describe('non-terminal statuses', () => {
    it.each(['new', 'in_progress', 'backlog', 'triaged', 'snoozed'])(
      'allows "%s" without any resolution fields',
      (status) => {
        const result = validateStatusTransition({
          feedbackId,
          newStatus: status,
          updateData: {},
          existingFeedback: {}
        });
        expect(result.valid).toBe(true);
      }
    );
  });

  describe('resolved status', () => {
    it('passes with resolution_sd_id', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: { resolution_sd_id: 'SD-TEST-001' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(true);
    });

    it('passes with quick_fix_id', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: { quick_fix_id: 'QF-20260207-001' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(true);
    });

    it('passes with strategic_directive_id', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: { strategic_directive_id: 'some-uuid' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(true);
    });

    it('passes with resolution_notes only', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: { resolution_notes: 'Fixed manually' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(true);
    });

    it('passes when existing feedback already has resolution link', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: {},
        existingFeedback: { resolution_sd_id: 'SD-OLD-001' }
      });
      expect(result.valid).toBe(true);
    });

    it('fails without any resolution metadata', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: {},
        existingFeedback: {}
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(ERROR_CODES.FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION);
    });

    it('fails with empty resolution_notes', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: { resolution_notes: '   ' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('wont_fix status', () => {
    it('passes with non-empty resolution_notes', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'wont_fix',
        updateData: { resolution_notes: 'Not worth the effort' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(true);
    });

    it('fails without resolution_notes', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'wont_fix',
        updateData: {},
        existingFeedback: {}
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(ERROR_CODES.FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION);
    });

    it('fails with whitespace-only resolution_notes', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'wont_fix',
        updateData: { resolution_notes: '   ' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('duplicate status', () => {
    it('passes with valid duplicate_of_id', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'duplicate',
        updateData: { duplicate_of_id: 'other-feedback-id' },
        existingFeedback: {}
      });
      expect(result.valid).toBe(true);
    });

    it('fails without duplicate_of_id', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'duplicate',
        updateData: {},
        existingFeedback: {}
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(ERROR_CODES.FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION);
    });

    it('fails with self-referencing duplicate_of_id', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'duplicate',
        updateData: { duplicate_of_id: feedbackId },
        existingFeedback: {}
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(ERROR_CODES.FEEDBACK_SELF_DUPLICATE);
    });
  });

  describe('invalid status', () => {
    it('passes without any fields', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'invalid',
        updateData: {},
        existingFeedback: {}
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('error structure', () => {
    it('returns stable error code', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: {},
        existingFeedback: {}
      });
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
      expect(result.error).toHaveProperty('details');
    });

    it('includes provided field values in details', () => {
      const result = validateStatusTransition({
        feedbackId,
        newStatus: 'resolved',
        updateData: {},
        existingFeedback: {}
      });
      expect(result.error.details).toHaveProperty('provided');
      expect(result.error.details.provided.resolution_sd_id).toBeNull();
    });
  });
});
