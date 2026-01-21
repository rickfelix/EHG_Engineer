/**
 * Unit Tests: ImprovementApplicator
 *
 * Tests application of improvements to database tables including:
 * - Validating improvement targets (rejecting direct markdown edits)
 * - Whitelisted table enforcement
 * - CLAUDE.md regeneration after applying
 * - Batch processing with error handling
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ImprovementApplicator,
  createApplicatorMockSupabase
} from './setup.js';

describe('ImprovementApplicator', () => {
  let applicator;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createApplicatorMockSupabase();
    applicator = new ImprovementApplicator(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateImprovement', () => {
    test('should reject direct markdown file edits', () => {
      const invalidImprovement = {
        target_table: 'CLAUDE.md',
        improvement_text: 'Add new section'
      };

      const result = applicator.validateImprovement(invalidImprovement);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Direct markdown file edits are not allowed');
    });

    test('should only allow whitelisted target tables', () => {
      const invalidTable = {
        target_table: 'random_table',
        improvement_text: 'Update something'
      };

      const result = applicator.validateImprovement(invalidTable);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not whitelisted');
    });

    test('should accept valid whitelisted table', () => {
      const validImprovement = {
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation step'
      };

      const result = applicator.validateImprovement(validImprovement);

      expect(result.valid).toBe(true);
    });

    test('should require improvement_text field', () => {
      const missingText = {
        target_table: 'leo_handoff_templates'
      };

      const result = applicator.validateImprovement(missingText);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Improvement text is required');
    });
  });

  describe('applyImprovement', () => {
    test('should call regenerate after applying improvement', async () => {
      const improvement = {
        id: 'imp-001',
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation',
        target_record_id: 'template-001'
      };

      const regenerateSpy = vi.spyOn(applicator, '_regenerateCLAUDEmd');
      regenerateSpy.mockResolvedValue(true);

      const result = await applicator.applyImprovement(improvement, true);

      expect(result.success).toBe(true);
      expect(result.regenerated).toBe(true);
      expect(regenerateSpy).toHaveBeenCalled();
    });

    test('should not regenerate if regenerate=false', async () => {
      const improvement = {
        id: 'imp-001',
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation',
        target_record_id: 'template-001'
      };

      const regenerateSpy = vi.spyOn(applicator, '_regenerateCLAUDEmd');
      regenerateSpy.mockResolvedValue(true);

      const result = await applicator.applyImprovement(improvement, false);

      expect(result.success).toBe(true);
      expect(regenerateSpy).not.toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      const improvement = {
        id: 'imp-001',
        target_table: 'leo_handoff_templates',
        improvement_text: 'Add validation'
      };

      // Make applyImprovement throw an error (so applyWithErrorHandling catches it)
      vi.spyOn(applicator, 'applyImprovement').mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await applicator.applyWithErrorHandling(improvement);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
      expect(result.handled).toBe(true);
    });
  });

  describe('applyBatch', () => {
    test('should apply multiple improvements and regenerate once', async () => {
      const improvements = [
        {
          id: 'imp-001',
          target_table: 'leo_handoff_templates',
          improvement_text: 'Improvement 1'
        },
        {
          id: 'imp-002',
          target_table: 'leo_protocol_sections',
          improvement_text: 'Improvement 2'
        }
      ];

      const regenerateSpy = vi.spyOn(applicator, '_regenerateCLAUDEmd');
      regenerateSpy.mockResolvedValue(true);

      const result = await applicator.applyBatch(improvements, true);

      expect(result.applied).toBe(2);
      expect(result.failed).toBe(0);
      expect(regenerateSpy).toHaveBeenCalledTimes(1); // Only once at the end
    });

    test('should track failures and continue processing', async () => {
      const improvements = [
        {
          id: 'imp-001',
          target_table: 'INVALID_TABLE', // Will fail validation
          improvement_text: 'Bad improvement'
        },
        {
          id: 'imp-002',
          target_table: 'leo_handoff_templates',
          improvement_text: 'Good improvement'
        }
      ];

      const result = await applicator.applyBatch(improvements, false);

      expect(result.applied).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].improvement_id).toBe('imp-001');
    });
  });
});
