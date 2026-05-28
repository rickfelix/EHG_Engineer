/**
 * Tests for validateRubricStrict() in scripts/eva/evidence-rubrics/index.js.
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-4 / TS-11).
 */
import { describe, it, expect } from 'vitest';
import {
  ALLOWED_CHECK_TYPES,
  validateRubric,
  validateRubricStrict,
} from '../../../scripts/eva/evidence-rubrics/index.js';

function valid(dimId = 'V01') {
  return {
    id: dimId,
    name: 'foo',
    checks: [
      { id: `${dimId}-C1`, label: 'a', type: 'file_exists', weight: 34, params: { glob: 'a' } },
      { id: `${dimId}-C2`, label: 'b', type: 'export_exists', weight: 33, params: { module: 'src/main.js', exportName: 'run' } },
      { id: `${dimId}-C3`, label: 'c', type: 'code_pattern', weight: 33, params: { glob: 'src/**.js', pattern: 'foo' } },
    ],
  };
}

describe('validateRubricStrict', () => {
  it('passes a well-formed rubric', () => {
    expect(() => validateRubricStrict(valid(), 'V01')).not.toThrow();
  });

  it('throws on <3 checks', () => {
    const r = valid();
    r.checks.pop();
    expect(() => validateRubricStrict(r, 'V01')).toThrow(/checks\.length=2/);
  });

  it('throws on disallowed check type', () => {
    const r = valid();
    r.checks[0].type = 'http_get';
    expect(() => validateRubricStrict(r, 'V01')).toThrow(/type='http_get'.*ALLOWED_CHECK_TYPES/);
  });

  it('throws on empty params (no concrete-reference field)', () => {
    const r = valid();
    r.checks[0].params = {};
    expect(() => validateRubricStrict(r, 'V01')).toThrow(/no non-empty concrete-reference field/);
  });

  it('accepts params with `table` for db_row_exists', () => {
    const r = valid();
    r.checks[0] = { id: 'V01-C1', label: 'rows exist', type: 'db_row_exists', weight: 34, params: { table: 'foo' } };
    expect(() => validateRubricStrict(r, 'V01')).not.toThrow();
  });

  it('TS-11 boundary: weight sum 102 passes (within ±2 tolerance)', () => {
    const r = valid();
    r.checks[0].weight = 36; // 36+33+33 = 102
    expect(() => validateRubricStrict(r, 'V01')).not.toThrow();
  });

  it('TS-11 boundary: weight sum 98 passes (within ±2 tolerance)', () => {
    const r = valid();
    r.checks[0].weight = 32; // 32+33+33 = 98
    expect(() => validateRubricStrict(r, 'V01')).not.toThrow();
  });

  it('TS-11 boundary: weight sum 90 throws (outside ±2 tolerance)', () => {
    const r = valid();
    r.checks[0].weight = 24; // 24+33+33 = 90
    expect(() => validateRubricStrict(r, 'V01')).toThrow(/weight sum=90/);
  });

  it('ALLOWED_CHECK_TYPES is frozen and contains the 6 deterministic types', () => {
    expect(Object.isFrozen(ALLOWED_CHECK_TYPES)).toBe(true);
    expect(ALLOWED_CHECK_TYPES).toEqual([
      'file_exists', 'code_pattern', 'anti_pattern',
      'export_exists', 'db_row_exists', 'file_count',
    ]);
  });

  it('still requires basic validateRubric fields (delegates to non-strict first)', () => {
    expect(() => validateRubricStrict({ checks: [] }, 'X')).toThrow(/Invalid rubric.*missing id/);
  });
});

describe('validateRubric (exported now per FR-4)', () => {
  it('is exported and callable', () => {
    expect(validateRubric).toBeTypeOf('function');
  });
});
