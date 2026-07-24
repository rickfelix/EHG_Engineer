/**
 * Hermetic unit tests for the venture data-capture classifier —
 * SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-A (SD-0a, FR-4).
 *
 * Exercises the PURE classifyTable() decision (and its countProductionWriters helper)
 * with stubbed inputs. No live DB, fs, network, or clock.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyTable,
  countProductionWriters,
} from '../../../scripts/audit/venture-capture-table-audit.mjs';

describe('classifyTable — pure classification decision', () => {
  it('not-exists => GHOST (table absent, regardless of writers)', () => {
    expect(classifyTable({ exists: false, row_count: null, writerCallSites: [] })).toBe('GHOST');
    expect(
      classifyTable({ exists: false, row_count: null, writerCallSites: [{ kind: 'production' }] })
    ).toBe('GHOST');
  });

  it('exists + 3241 rows + production writers => WIRED (stage_executions case)', () => {
    expect(
      classifyTable({
        exists: true,
        row_count: 3241,
        writerCallSites: [
          { file: 'lib/eva/stage-execution-worker.js', line: 2080, op: 'insert', kind: 'production' },
        ],
      })
    ).toBe('WIRED');
  });

  it('exists + 0 rows + production writers => EMPTY-WIRED (wired-but-unpopulated case)', () => {
    expect(
      classifyTable({
        exists: true,
        row_count: 0,
        writerCallSites: [{ file: 'lib/x.js', line: 1, op: 'insert', kind: 'production' }],
      })
    ).toBe('EMPTY-WIRED');
  });

  it('exists + rows + only non-production writers => GHOST (dead table)', () => {
    expect(
      classifyTable({
        exists: true,
        row_count: 5,
        writerCallSites: [
          { file: 'tests/integration/s17-parity.test.js', line: 240, op: 'insert', kind: 'test' },
          { file: 'archive/scripts/x.js', line: 906, op: 'insert', kind: 'archive' },
        ],
      })
    ).toBe('GHOST');
  });

  it('exists + rows + NO writers at all => GHOST', () => {
    expect(classifyTable({ exists: true, row_count: 12, writerCallSites: [] })).toBe('GHOST');
  });

  it('null row_count on an existing table with a production writer => EMPTY-WIRED (treats null as 0)', () => {
    expect(
      classifyTable({
        exists: true,
        row_count: null,
        writerCallSites: [{ kind: 'production' }],
      })
    ).toBe('EMPTY-WIRED');
  });

  it('a production writer alongside test/archive writers still counts as WIRED', () => {
    expect(
      classifyTable({
        exists: true,
        row_count: 100,
        writerCallSites: [
          { kind: 'test' },
          { kind: 'production' },
          { kind: 'archive' },
        ],
      })
    ).toBe('WIRED');
  });
});

describe('countProductionWriters — writer-kind filter', () => {
  it('counts only writers whose kind is not test/archive/docs/fixture', () => {
    const sites = [
      { kind: 'production' },
      { kind: 'test' },
      { kind: 'archive' },
      { kind: 'docs' },
      { kind: 'fixture' },
      { kind: 'production' },
    ];
    expect(countProductionWriters(sites)).toBe(2);
  });

  it('treats a writer with no kind as production (undefined is not in the exclusion set)', () => {
    expect(countProductionWriters([{ file: 'lib/x.js' }])).toBe(1);
  });

  it('returns 0 for an empty or undefined list', () => {
    expect(countProductionWriters([])).toBe(0);
    expect(countProductionWriters()).toBe(0);
  });
});
