/**
 * Tests for NEVER_AUTONOMOUS Registry
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-02
 */
import { describe, test, expect } from 'vitest';
import {
  checkAutonomousAllowed,
  getDenyList,
  enforceAutonomousCheck,
  NEVER_AUTONOMOUS_OPERATIONS
} from '../never-autonomous-registry.js';

describe('NEVER_AUTONOMOUS Registry', () => {
  describe('checkAutonomousAllowed', () => {
    test('blocks schema_migration', () => {
      const result = checkAutonomousAllowed('schema_migration');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('NEVER_AUTONOMOUS');
    });

    test('blocks user_deletion', () => {
      const result = checkAutonomousAllowed('user_deletion');
      expect(result.allowed).toBe(false);
    });

    test('blocks financial_transaction', () => {
      const result = checkAutonomousAllowed('financial_transaction');
      expect(result.allowed).toBe(false);
    });

    test('blocks chairman_impersonation', () => {
      const result = checkAutonomousAllowed('chairman_impersonation');
      expect(result.allowed).toBe(false);
    });

    test('allows read_data', () => {
      const result = checkAutonomousAllowed('read_data');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeNull();
    });

    test('allows query_ventures', () => {
      const result = checkAutonomousAllowed('query_ventures');
      expect(result.allowed).toBe(true);
    });

    test('is case-insensitive', () => {
      const result = checkAutonomousAllowed('SCHEMA_MIGRATION');
      expect(result.allowed).toBe(false);
    });

    test('rejects null operationType', () => {
      const result = checkAutonomousAllowed(null);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('required');
    });

    test('rejects empty string', () => {
      const result = checkAutonomousAllowed('');
      expect(result.allowed).toBe(false);
    });
  });

  describe('getDenyList', () => {
    test('returns a copy of the deny list', () => {
      const list = getDenyList();
      expect(list.length).toBeGreaterThan(0);
      expect(list).toContain('schema_migration');
      // Verify it is a copy
      list.push('test_operation');
      expect(NEVER_AUTONOMOUS_OPERATIONS).not.toContain('test_operation');
    });
  });

  describe('enforceAutonomousCheck', () => {
    test('throws for blocked operations', () => {
      expect(() => enforceAutonomousCheck('schema_migration')).toThrow('NEVER_AUTONOMOUS');
    });

    test('does not throw for allowed operations', () => {
      expect(() => enforceAutonomousCheck('read_data')).not.toThrow();
    });

    test('thrown error has correct code', () => {
      try {
        enforceAutonomousCheck('user_deletion');
      } catch (err) {
        expect(err.code).toBe('NEVER_AUTONOMOUS_BLOCKED');
        expect(err.operationType).toBe('user_deletion');
        return;
      }
      throw new Error('Should have thrown');
    });
  });
});
