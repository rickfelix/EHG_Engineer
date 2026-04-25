/**
 * Tests for gate-reason-codes.js
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-132 (FR-5)
 */

import { describe, it, expect } from 'vitest';
import {
  GATE_REASON_CODES,
  PLACEHOLDER_ACTUAL_VALUES,
  isPlaceholderActual,
  MAX_HEAL_ITERATIONS,
} from './gate-reason-codes.js';

describe('gate-reason-codes', () => {
  describe('GATE_REASON_CODES enum', () => {
    it('contains the four required codes', () => {
      expect(GATE_REASON_CODES.SUCCESS_METRICS_EMPTY_ACTUAL).toBe('SUCCESS_METRICS_EMPTY_ACTUAL');
      expect(GATE_REASON_CODES.SUCCESS_METRICS_PLACEHOLDER_VALUE).toBe('SUCCESS_METRICS_PLACEHOLDER_VALUE');
      expect(GATE_REASON_CODES.HEAL_BELOW_THRESHOLD).toBe('HEAL_BELOW_THRESHOLD');
      expect(GATE_REASON_CODES.HEAL_EXHAUSTED).toBe('HEAL_EXHAUSTED');
    });

    it('is frozen so values cannot drift at runtime', () => {
      expect(Object.isFrozen(GATE_REASON_CODES)).toBe(true);
    });
  });

  describe('PLACEHOLDER_ACTUAL_VALUES', () => {
    it('contains the four canonical placeholders', () => {
      expect(PLACEHOLDER_ACTUAL_VALUES.has('100%')).toBe(true);
      expect(PLACEHOLDER_ACTUAL_VALUES.has('TBD')).toBe(true);
      expect(PLACEHOLDER_ACTUAL_VALUES.has('auto_populated')).toBe(true);
      expect(PLACEHOLDER_ACTUAL_VALUES.has('_auto_populated')).toBe(true);
    });

    it('does not include concrete numeric values', () => {
      expect(PLACEHOLDER_ACTUAL_VALUES.has('92%')).toBe(false);
      expect(PLACEHOLDER_ACTUAL_VALUES.has('0')).toBe(false);
      expect(PLACEHOLDER_ACTUAL_VALUES.has('5/10')).toBe(false);
    });
  });

  describe('isPlaceholderActual', () => {
    it('returns true for the placeholder literals', () => {
      expect(isPlaceholderActual('100%')).toBe(true);
      expect(isPlaceholderActual('TBD')).toBe(true);
      expect(isPlaceholderActual('auto_populated')).toBe(true);
      expect(isPlaceholderActual('_auto_populated')).toBe(true);
    });

    it('returns false for concrete values', () => {
      expect(isPlaceholderActual('92%')).toBe(false);
      expect(isPlaceholderActual('47')).toBe(false);
      expect(isPlaceholderActual('0')).toBe(false);
      expect(isPlaceholderActual('done')).toBe(false);
    });

    it('returns false for null / undefined / empty', () => {
      expect(isPlaceholderActual(null)).toBe(false);
      expect(isPlaceholderActual(undefined)).toBe(false);
      expect(isPlaceholderActual('')).toBe(false);
    });

    it('handles whitespace-padded placeholder literals', () => {
      expect(isPlaceholderActual('  100%  ')).toBe(true);
      expect(isPlaceholderActual('\tTBD\n')).toBe(true);
    });

    it('coerces non-string values via String()', () => {
      expect(isPlaceholderActual(100)).toBe(false); // "100" not in set
      expect(isPlaceholderActual(0)).toBe(false);
    });
  });

  describe('MAX_HEAL_ITERATIONS', () => {
    it('is 3 (per FR-2 spec)', () => {
      expect(MAX_HEAL_ITERATIONS).toBe(3);
    });
  });
});
