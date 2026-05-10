/**
 * Unit tests for lib/sd-type-enum.js (FR-1).
 *
 * SD: SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001
 *
 * Pins the public API surface of the canonical sd_type module:
 *   - CANONICAL_SD_TYPES (frozen Set)
 *   - isValidSdType(value): boolean
 *   - assertValidSdType(value, contextLabel?): throws with full enum list
 */

import { describe, it, expect } from 'vitest';
import { CANONICAL_SD_TYPES, isValidSdType, assertValidSdType } from '../../lib/sd-type-enum.js';

describe('CANONICAL_SD_TYPES', () => {
  it('is a Set with 15 canonical values matching the DB CHECK constraint', () => {
    expect(CANONICAL_SD_TYPES).toBeInstanceOf(Set);
    expect(CANONICAL_SD_TYPES.size).toBe(15);
  });

  it('is frozen (cannot be mutated by accident)', () => {
    expect(Object.isFrozen(CANONICAL_SD_TYPES)).toBe(true);
  });

  it('includes the 5 most-used canonical values', () => {
    for (const v of ['feature', 'bugfix', 'infrastructure', 'security', 'documentation']) {
      expect(CANONICAL_SD_TYPES.has(v)).toBe(true);
    }
  });

  it('does NOT include the phantom `fix` value (root cause of witnessed incident)', () => {
    expect(CANONICAL_SD_TYPES.has('fix')).toBe(false);
  });
});

describe('isValidSdType', () => {
  it('returns true for every canonical value', () => {
    for (const v of CANONICAL_SD_TYPES) {
      expect(isValidSdType(v)).toBe(true);
    }
  });

  it('returns false for the phantom `fix` value', () => {
    expect(isValidSdType('fix')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(isValidSdType(null)).toBe(false);
    expect(isValidSdType(undefined)).toBe(false);
    expect(isValidSdType(42)).toBe(false);
    expect(isValidSdType({})).toBe(false);
    expect(isValidSdType([])).toBe(false);
  });

  it('is case-sensitive (DB CHECK is case-sensitive)', () => {
    expect(isValidSdType('Feature')).toBe(false);
    expect(isValidSdType('FEATURE')).toBe(false);
    expect(isValidSdType('feature')).toBe(true);
  });
});

describe('assertValidSdType', () => {
  it('does not throw for canonical values', () => {
    expect(() => assertValidSdType('feature')).not.toThrow();
    expect(() => assertValidSdType('bugfix')).not.toThrow();
    expect(() => assertValidSdType('infrastructure')).not.toThrow();
  });

  it('throws for the phantom `fix` value', () => {
    expect(() => assertValidSdType('fix')).toThrow(/Invalid sd_type/);
  });

  it('error message includes the full canonical enum list (per FR-1 AC-1.3)', () => {
    let err;
    try {
      assertValidSdType('garbage');
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).toMatch(/feature/);
    expect(err.message).toMatch(/bugfix/);
    expect(err.message).toMatch(/infrastructure/);
    expect(err.message).toMatch(/uat/);
    expect(err.message).toMatch(/Must be one of/);
  });

  it('error message includes contextLabel when provided', () => {
    let err;
    try {
      assertValidSdType('garbage', 'leo-create-sd --type');
    } catch (e) {
      err = e;
    }
    expect(err.message).toMatch(/leo-create-sd --type/);
  });

  it('throws for non-string inputs', () => {
    expect(() => assertValidSdType(null)).toThrow(/Invalid sd_type/);
    expect(() => assertValidSdType(undefined)).toThrow(/Invalid sd_type/);
    expect(() => assertValidSdType(42)).toThrow(/Invalid sd_type/);
  });
});
