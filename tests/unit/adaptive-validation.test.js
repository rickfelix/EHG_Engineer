/**
 * Unit Tests: Adaptive Validation System
 * SD-LEO-PROTOCOL-V4-4-0: US-002 (Sub-Agent Updates)
 *
 * Test Coverage:
 * - Validation mode detection (prospective vs retrospective)
 * - Manual override functionality
 * - CONDITIONAL_PASS validation rules
 * - Helper function validation (createConditionalPassResult, createPassResult, createBlockedResult)
 * - Error handling and edge cases
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectValidationMode,
  validateConditionalPass,
  createConditionalPassResult,
  createPassResult,
  createBlockedResult,
  logValidationMode
} from '../../lib/utils/adaptive-validation.js';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn()
};

// Mock the supabase-connection module
vi.mock('../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(() => Promise.resolve(mockSupabase))
}));

describe('Adaptive Validation System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectValidationMode', () => {
    test('should return prospective for active SD status', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'active' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');
    });

    test('should return prospective for in_progress SD status', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'in_progress' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');
    });

    test('should return prospective for pending SD status', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'pending' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');
    });

    test('should return prospective for blocked SD status', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'blocked' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');
    });

    test('should return retrospective for completed SD status', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'completed' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('retrospective');
    });

    test('should return retrospective for done SD status', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'done' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('retrospective');
    });

    test('should handle case-insensitive status matching', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'COMPLETED' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('retrospective');
    });

    test('should use manual override when provided (prospective)', async () => {
      const mode = await detectValidationMode('SD-TEST-001', {
        validation_mode: 'prospective'
      });

      expect(mode).toBe('prospective');
      expect(mockSupabase.from).not.toHaveBeenCalled(); // Should not query DB
    });

    test('should use manual override when provided (retrospective)', async () => {
      const mode = await detectValidationMode('SD-TEST-001', {
        validation_mode: 'retrospective'
      });

      expect(mode).toBe('retrospective');
      expect(mockSupabase.from).not.toHaveBeenCalled(); // Should not query DB
    });

    test('should throw error for invalid manual override', async () => {
      await expect(
        detectValidationMode('SD-TEST-001', { validation_mode: 'invalid' })
      ).rejects.toThrow('Invalid validation_mode: invalid');
    });

    test('should default to prospective on database error', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');
    });

    test('should default to prospective when SD not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: null
      });

      const mode = await detectValidationMode('SD-NONEXISTENT-001');
      expect(mode).toBe('prospective');
    });

    test('should default to prospective on exception', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Network error'));

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');
    });
  });

  describe('validateConditionalPass', () => {
    test('should validate non-CONDITIONAL_PASS verdicts (always valid)', () => {
      const result = { verdict: 'PASS' };
      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should require retrospective mode for CONDITIONAL_PASS', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'prospective',
        justification: 'This is a long enough justification with more than 50 characters total',
        conditions: ['Follow-up SD needed']
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'CONDITIONAL_PASS can only be used in retrospective validation mode'
      );
    });

    test('should require justification for CONDITIONAL_PASS', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        conditions: ['Follow-up SD needed']
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'CONDITIONAL_PASS requires a justification (minimum 50 characters)'
      );
    });

    test('should require justification >= 50 characters', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        justification: 'Too short',
        conditions: ['Follow-up SD needed']
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'CONDITIONAL_PASS justification too short (9/50 characters)'
      );
    });

    test('should require conditions array', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        justification: 'This is a long enough justification with more than 50 characters total'
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'CONDITIONAL_PASS requires a conditions array (list of follow-up actions)'
      );
    });

    test('should require conditions to be an array', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        justification: 'This is a long enough justification with more than 50 characters total',
        conditions: 'Not an array'
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('conditions must be an array of strings');
    });

    test('should require at least 1 condition', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        justification: 'This is a long enough justification with more than 50 characters total',
        conditions: []
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'CONDITIONAL_PASS requires at least 1 follow-up condition'
      );
    });

    test('should validate proper CONDITIONAL_PASS result', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        justification: 'E2E tests exist and pass (32 tests, 95% pass rate). Infrastructure gap documented in follow-up SD.',
        conditions: ['Follow-up SD: SD-TESTING-INFRASTRUCTURE-FIX-001']
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should accumulate multiple validation errors', () => {
      const result = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'prospective',
        justification: 'Short',
        conditions: []
      };

      const validation = validateConditionalPass(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(3); // Mode, justification length, conditions
    });
  });

  describe('createConditionalPassResult', () => {
    test('should create valid CONDITIONAL_PASS result with minimum params', () => {
      const result = createConditionalPassResult({
        justification: 'This is a valid justification with more than 50 characters needed for validation',
        conditions: ['Follow-up SD: SD-TEST-001']
      });

      expect(result.verdict).toBe('CONDITIONAL_PASS');
      expect(result.validation_mode).toBe('retrospective');
      expect(result.justification).toBeDefined();
      expect(result.conditions).toHaveLength(1);
      expect(result.confidence).toBe(75); // Default
      expect(result.metadata.conditional_pass_created_at).toBeDefined();
    });

    test('should create CONDITIONAL_PASS result with all params', () => {
      const result = createConditionalPassResult({
        justification: 'E2E tests exist and pass (32 tests, 95% pass rate). Infrastructure gap documented.',
        conditions: ['Follow-up SD: SD-TESTING-001', 'Add --full-e2e flag'],
        confidence: 85,
        warnings: ['Missing test infrastructure'],
        recommendations: ['Update CI/CD pipeline'],
        metadata: { test_count: 32, pass_rate: 0.95 }
      });

      expect(result.verdict).toBe('CONDITIONAL_PASS');
      expect(result.validation_mode).toBe('retrospective');
      expect(result.confidence).toBe(85);
      expect(result.warnings).toHaveLength(1);
      expect(result.recommendations).toHaveLength(1);
      expect(result.metadata.test_count).toBe(32);
      expect(result.metadata.conditional_pass_created_at).toBeDefined();
    });

    test('should throw error for invalid justification length', () => {
      expect(() => {
        createConditionalPassResult({
          justification: 'Too short',
          conditions: ['Follow-up SD needed']
        });
      }).toThrow('Invalid CONDITIONAL_PASS result');
    });

    test('should throw error for missing conditions', () => {
      expect(() => {
        createConditionalPassResult({
          justification: 'This is a valid justification with more than 50 characters needed for validation',
          conditions: []
        });
      }).toThrow('Invalid CONDITIONAL_PASS result');
    });
  });

  describe('createPassResult', () => {
    test('should create PASS result with default params', () => {
      const result = createPassResult({});

      expect(result.verdict).toBe('PASS');
      expect(result.validation_mode).toBe('prospective');
      expect(result.confidence).toBe(100);
      expect(result.message).toBe('All validation criteria passed');
      expect(result.recommendations).toHaveLength(0);
    });

    test('should create PASS result with custom params', () => {
      const result = createPassResult({
        validation_mode: 'retrospective',
        confidence: 95,
        message: 'All checks passed successfully',
        recommendations: ['Consider optimizing'],
        metadata: { test_duration: '5s' }
      });

      expect(result.verdict).toBe('PASS');
      expect(result.validation_mode).toBe('retrospective');
      expect(result.confidence).toBe(95);
      expect(result.message).toBe('All checks passed successfully');
      expect(result.recommendations).toHaveLength(1);
      expect(result.metadata.test_duration).toBe('5s');
    });
  });

  describe('createBlockedResult', () => {
    test('should create BLOCKED result with minimum params', () => {
      const result = createBlockedResult({
        reason: 'Critical validation failure'
      });

      expect(result.verdict).toBe('BLOCKED');
      expect(result.validation_mode).toBe('prospective');
      expect(result.confidence).toBe(100);
      expect(result.message).toBe('Critical validation failure');
      expect(result.critical_issues).toHaveLength(0);
      expect(result.recommendations).toHaveLength(0);
    });

    test('should create BLOCKED result with all params', () => {
      const result = createBlockedResult({
        validation_mode: 'prospective',
        reason: 'Uncommitted changes detected',
        critical_issues: ['Uncommitted files present', 'Unstaged changes detected'],
        recommendations: ['Commit or stash changes', 'Run git status'],
        metadata: { modified_files: 5, untracked_files: 3 }
      });

      expect(result.verdict).toBe('BLOCKED');
      expect(result.validation_mode).toBe('prospective');
      expect(result.confidence).toBe(100);
      expect(result.message).toBe('Uncommitted changes detected');
      expect(result.critical_issues).toHaveLength(2);
      expect(result.recommendations).toHaveLength(2);
      expect(result.metadata.modified_files).toBe(5);
    });
  });

  describe('logValidationMode', () => {
    test('should log validation mode information', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logValidationMode('TESTING', 'prospective', {
        'E2E Tests': 'BLOCKED if missing',
        'Unit Tests': 'WARNING if low coverage'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TESTING Validation Mode: PROSPECTIVE')
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Criteria Applied:'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('E2E Tests: BLOCKED if missing')
      );

      consoleSpy.mockRestore();
    });

    test('should handle empty criteria object', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logValidationMode('DESIGN', 'retrospective', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DESIGN Validation Mode: RETROSPECTIVE')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle prospective mode workflow (active SD, strict validation)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'active' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');

      const passResult = createPassResult({
        validation_mode: mode,
        message: 'All prospective checks passed'
      });

      expect(passResult.verdict).toBe('PASS');
      expect(passResult.validation_mode).toBe('prospective');
    });

    test('should handle retrospective mode workflow (completed SD, pragmatic validation)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'completed' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('retrospective');

      const conditionalResult = createConditionalPassResult({
        justification: 'Work delivered successfully with minor infrastructure gaps documented for follow-up',
        conditions: ['Follow-up SD: SD-INFRA-FIX-001'],
        confidence: 85
      });

      expect(conditionalResult.verdict).toBe('CONDITIONAL_PASS');
      expect(conditionalResult.validation_mode).toBe('retrospective');
    });

    test('should enforce CONDITIONAL_PASS only in retrospective mode', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { status: 'active' },
        error: null
      });

      const mode = await detectValidationMode('SD-TEST-001');
      expect(mode).toBe('prospective');

      // Attempting CONDITIONAL_PASS in prospective mode should fail validation
      const invalidResult = {
        verdict: 'CONDITIONAL_PASS',
        validation_mode: mode,
        justification: 'This should fail because mode is prospective, not retrospective mode',
        conditions: ['Follow-up SD needed']
      };

      const validation = validateConditionalPass(invalidResult);
      expect(validation.valid).toBe(false);
    });
  });
});
