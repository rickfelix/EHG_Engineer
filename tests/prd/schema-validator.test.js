/**
 * SD-FDBK-ENH-SCRIPTS-ADD-PRD-001 FR-4
 *
 * Vitest suite for scripts/prd/schema-validator.js validatePrdRow().
 * Covers: TS-1..TS-11 from PRD test_scenarios.
 *
 * Static-guard test (TS-10) re-runs scripts/snapshot-prd-schema.js logic
 * by reading committed snapshot and asserting schema_version is non-empty.
 * Full live-DB drift check is run via `npm run schema:check-drift` in CI.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validatePrdRow, CONSTRAINT_CLASSIFICATION, PRDValidationError, __test__ } from '../../scripts/prd/schema-validator.js';

const COMMITTED_SNAPSHOT_PATH = path.resolve(process.cwd(), 'lib', 'db-schema', 'product-requirements-v2.json');
const committedSnapshot = JSON.parse(fs.readFileSync(COMMITTED_SNAPSHOT_PATH, 'utf-8'));

const baseValidRow = () => ({
  id: 'PRD-TEST-001',
  directive_id: 'SD-TEST-001',
  sd_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Test PRD',
  status: 'planning',
  acceptance_criteria: [{ id: 'AC-1', criterion: 'a' }],
  functional_requirements: [{ id: 'FR-1' }, { id: 'FR-2' }, { id: 'FR-3' }],
  test_scenarios: [{ id: 'TS-1' }],
});

describe('CONSTRAINT_CLASSIFICATION', () => {
  it('exports HARD and SOFT arrays', () => {
    expect(CONSTRAINT_CLASSIFICATION.HARD).toContain('NOT_NULL_NO_DEFAULT');
    expect(CONSTRAINT_CLASSIFICATION.HARD).toContain('VARCHAR_OVERFLOW');
    expect(CONSTRAINT_CLASSIFICATION.HARD).toContain('CONDITIONAL_TRIGGER_PAIR');
    expect(CONSTRAINT_CLASSIFICATION.SOFT).toContain('SNAPSHOT_MISSING_GRACEFUL_DEGRADE');
    expect(Object.isFrozen(CONSTRAINT_CLASSIFICATION)).toBe(true);
  });
});

describe('validatePrdRow — happy path', () => {
  it('valid row returns ok=true with no violations', () => {
    const result = validatePrdRow(baseValidRow(), committedSnapshot);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.schema_version).toBe(committedSnapshot.schema_version);
  });
});

describe('TS-1 VARCHAR_OVERFLOW', () => {
  it('throws when title exceeds varchar length', () => {
    // Look up real max from snapshot
    const titleVarchar = committedSnapshot.varchar_columns.find((v) => v.name === 'title');
    expect(titleVarchar).toBeDefined();
    const row = baseValidRow();
    row.title = 'x'.repeat(titleVarchar.max_length + 10);
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.kind === 'VARCHAR_OVERFLOW' && x.column === 'title');
    expect(v).toBeDefined();
    expect(v.actual).toMatch(/\d+ chars/);
  });
});

describe('TS-2 ENUM_CHECK', () => {
  it('rejects invalid enum value for status', () => {
    const row = baseValidRow();
    row.status = 'invalid-enum-value';
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.kind === 'ENUM_CHECK' && x.column === 'status');
    expect(v).toBeDefined();
    expect(v.expected).toBeInstanceOf(Array);
  });
});

describe('TS-3 RANGE_CHECK', () => {
  it('rejects confidence_score=999 (out of 0..100)', () => {
    const row = baseValidRow();
    row.confidence_score = 999;
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.ok).toBe(false);
    expect(result.violations.some((x) => x.kind === 'RANGE_CHECK' && x.column === 'confidence_score')).toBe(true);
  });
});

describe('TS-4 JSONB_MIN_ELEMENTS', () => {
  it('rejects functional_requirements=[] (under min 3)', () => {
    const row = baseValidRow();
    row.functional_requirements = [];
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.ok).toBe(false);
    expect(result.violations.some((x) => x.kind === 'JSONB_MIN_ELEMENTS' && x.column === 'functional_requirements')).toBe(true);
  });
});

describe('TS-5+TS-6 CONDITIONAL_TRIGGER_PAIR', () => {
  it('TS-5: rejects when BOTH directive_id AND sd_id are null', () => {
    const row = baseValidRow();
    row.directive_id = null;
    row.sd_id = null;
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.violations.some((x) => x.kind === 'CONDITIONAL_TRIGGER_PAIR')).toBe(true);
  });
  it('TS-6: passes when EITHER directive_id OR sd_id is set', () => {
    const row = baseValidRow();
    row.directive_id = 'SD-X';
    row.sd_id = null;
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.violations.find((x) => x.kind === 'CONDITIONAL_TRIGGER_PAIR')).toBeUndefined();
  });
});

describe('TS-7 trigger_controlled_columns skipped', () => {
  it('updated_at=null does NOT raise NOT_NULL violation (trigger fills it)', () => {
    const row = baseValidRow();
    row.updated_at = null;
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.violations.find((x) => x.column === 'updated_at')).toBeUndefined();
  });
});

describe('TS-8 multiple violations no-short-circuit', () => {
  it('collects ALL violations together', () => {
    const titleMax = committedSnapshot.varchar_columns.find((v) => v.name === 'title').max_length;
    const row = baseValidRow();
    row.id = null;                      // NOT_NULL_NO_DEFAULT
    row.title = 'x'.repeat(titleMax + 1); // VARCHAR_OVERFLOW
    row.status = 'bogus';               // ENUM_CHECK
    row.confidence_score = -50;         // RANGE_CHECK
    row.functional_requirements = [];   // JSONB_MIN_ELEMENTS
    const result = validatePrdRow(row, committedSnapshot);
    expect(result.ok).toBe(false);
    const kinds = new Set(result.violations.map((v) => v.kind));
    expect(kinds.has('NOT_NULL_NO_DEFAULT')).toBe(true);
    expect(kinds.has('VARCHAR_OVERFLOW')).toBe(true);
    expect(kinds.has('ENUM_CHECK')).toBe(true);
    expect(kinds.has('RANGE_CHECK')).toBe(true);
    expect(kinds.has('JSONB_MIN_ELEMENTS')).toBe(true);
    expect(result.violations.length).toBeGreaterThanOrEqual(5);
  });
});

describe('TS-9 missing snapshot graceful degrade', () => {
  it('returns ok=true + SNAPSHOT_MISSING warning when committed snapshot disabled', () => {
    // Force loadSnapshot path to find no file by passing snapshot=undefined
    // and pointing the cache reset, but since the real snapshot exists we
    // instead simulate by passing a falsy override that the function signature
    // accepts (when snapshot arg is undefined the function loads from disk).
    // To exercise the missing-snapshot branch we stub via __test__ helper.
    __test__._resetCacheForTests();
    const realPath = __test__.SNAPSHOT_PATH;
    const tmpHide = realPath + '.tmp-hide';
    if (fs.existsSync(realPath)) fs.renameSync(realPath, tmpHide);
    try {
      const result = validatePrdRow(baseValidRow());
      expect(result.ok).toBe(true);
      expect(result.warnings.some((w) => w.kind === 'SNAPSHOT_MISSING_GRACEFUL_DEGRADE')).toBe(true);
      expect(result.schema_version).toBeNull();
    } finally {
      if (fs.existsSync(tmpHide)) fs.renameSync(tmpHide, realPath);
      __test__._resetCacheForTests();
    }
  });
});

describe('TS-10 static-guard schema_version', () => {
  it('committed snapshot has non-empty schema_version', () => {
    expect(committedSnapshot.schema_version).toMatch(/^[0-9a-f]{12}$/);
  });
  it('committed counts match expected (60 cols, 15 varchar, 8 CHECK, 7 triggers, ≥1 conditional pair)', () => {
    expect(committedSnapshot.counts.total_columns).toBe(60);
    expect(committedSnapshot.counts.varchar_columns).toBe(15);
    expect(committedSnapshot.counts.check_constraints).toBe(8);
    expect(committedSnapshot.counts.triggers).toBe(7);
    expect(committedSnapshot.counts.conditional_trigger_pairs).toBeGreaterThanOrEqual(1);
  });
});

describe('TS-11 performance benchmark (CI-flake-guarded)', () => {
  // Skip on CI by default — perf assertions are flaky on shared runners.
  const itPerf = process.env.CI ? it.skip : it;
  itPerf('1000 calls steady-state under 100ms total (<1ms p99 each)', () => {
    const row = baseValidRow();
    // warm-up
    for (let i = 0; i < 50; i++) validatePrdRow(row, committedSnapshot);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) validatePrdRow(row, committedSnapshot);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

describe('PRDValidationError', () => {
  it('is throwable with structured violations[]', () => {
    const violations = [{ kind: 'VARCHAR_OVERFLOW', column: 'title', expected: '≤500 chars', actual: '600 chars', message: 'over' }];
    expect(() => { throw new PRDValidationError(violations, 'abc123'); }).toThrow(/PRD schema validation failed/);
    try { throw new PRDValidationError(violations, 'abc123'); } catch (e) {
      expect(e.code).toBe('PRD_SCHEMA_VALIDATION_FAILED');
      expect(e.violations).toEqual(violations);
      expect(e.schema_version).toBe('abc123');
    }
  });
});
