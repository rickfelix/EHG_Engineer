/**
 * SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-2 — TS-6.
 *
 * The census script is a reporting tool only. "No mutations" must be proven structurally (a
 * source-grep for insert|update|delete|upsert), not merely observed on one run -- an observed
 * run can pass by accident (e.g. an early throw before the mutating call would ever execute).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { censusExecutionKeys } from '../../scripts/census-testing-execution-keys.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('../../scripts/census-testing-execution-keys.mjs', import.meta.url));

describe('census-testing-execution-keys.mjs is structurally read-only (TS-6)', () => {
  it('the script source never calls .insert(/.update(/.delete(/.upsert(', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf8');
    expect(source).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
  });

  it('CI count-truncation-diff-lint finding: the DB read is paginated, not a bare unbounded .select()', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf8');
    expect(source).toMatch(/fetchAllPaginated/);
  });
});

describe('censusExecutionKeys — key-detection heuristic (TS-6)', () => {
  it('counts execution-related keys across rows, case-insensitively', () => {
    const rows = [
      { metadata: { test_execution: {}, tests_passed: 5, unrelated_field: 1 } },
      { metadata: { test_execution: {}, Coverage_Pct: 90 } },
      { metadata: null },
      { metadata: {} },
    ];
    const counts = censusExecutionKeys(rows);
    expect(counts.get('test_execution')).toBe(2);
    expect(counts.get('tests_passed')).toBe(1);
    expect(counts.get('Coverage_Pct')).toBe(1);
    expect(counts.has('unrelated_field')).toBe(false);
  });

  it('is silent (empty map) for rows carrying no execution-related keys', () => {
    const rows = [{ metadata: { some_other_thing: 1 } }, { metadata: {} }];
    expect(censusExecutionKeys(rows).size).toBe(0);
  });

  it('tolerates rows with missing/malformed metadata without throwing', () => {
    const rows = [{ metadata: undefined }, { metadata: null }, {}, { metadata: 'not-an-object' }];
    expect(() => censusExecutionKeys(rows)).not.toThrow();
    expect(censusExecutionKeys(rows).size).toBe(0);
  });
});
