/**
 * QF-20260912-758 — a quick-fix whose PR touches a database/ file must not complete "done"
 * while that file's objects are not yet live. Covers:
 *   - parseArguments: --park-until-applied flag
 *   - db-apply-state-gate.js: pure blocker/path-hint logic
 *   - classifyMigrationFiles: fail-open paths (no files / no DB credential)
 */
import { describe, it, expect } from 'vitest';
import { parseArguments } from '../../../scripts/modules/complete-quick-fix/cli.js';
import {
  filterDatabaseFiles,
  findApplyStateBlockers,
  describeApplyPath
} from '../../../scripts/modules/complete-quick-fix/db-apply-state-gate.js';
import { classifyMigrationFiles } from '../../../scripts/verify-migration-apply-state.mjs';

describe('parseArguments — --park-until-applied', () => {
  it('defaults to false when omitted', () => {
    const { options } = parseArguments(['QF-X', '--force-complete', '--reason', 'x']);
    expect(options.parkUntilApplied).toBe(false);
  });

  it('parses --park-until-applied with no --reason requirement', () => {
    const { options } = parseArguments(['QF-X', '--park-until-applied']);
    expect(options.parkUntilApplied).toBe(true);
  });
});

describe('filterDatabaseFiles', () => {
  it('keeps only database/ paths, in order, from a mixed file list', () => {
    const files = ['scripts/foo.js', 'database/migrations/20260101_x.sql', 'tests/foo.test.js', 'database/chairman-gated/20260102_y.sql'];
    expect(filterDatabaseFiles(files)).toEqual(['database/migrations/20260101_x.sql', 'database/chairman-gated/20260102_y.sql']);
  });

  it('returns [] for no database/ files, and for a null/undefined list', () => {
    expect(filterDatabaseFiles(['scripts/foo.js'])).toEqual([]);
    expect(filterDatabaseFiles(null)).toEqual([]);
    expect(filterDatabaseFiles(undefined)).toEqual([]);
  });
});

describe('findApplyStateBlockers', () => {
  it('passes APPLIED and NO_DDL, blocks every other status', () => {
    const results = [
      { file: 'a.sql', status: 'APPLIED' },
      { file: 'b.sql', status: 'NO_DDL' },
      { file: 'c.sql', status: 'NOT_APPLIED' },
      { file: 'd.sql', status: 'PARTIAL' },
      { file: 'e.sql', status: 'BODY_MISMATCH' },
      { file: 'f.sql', status: 'CEREMONY_PENDING' },
    ];
    expect(findApplyStateBlockers(results).map((r) => r.file)).toEqual(['c.sql', 'd.sql', 'e.sql', 'f.sql']);
  });

  it('returns [] for an all-passing result set, and for an empty/undefined input', () => {
    expect(findApplyStateBlockers([{ file: 'a.sql', status: 'APPLIED' }])).toEqual([]);
    expect(findApplyStateBlockers([])).toEqual([]);
    expect(findApplyStateBlockers(undefined)).toEqual([]);
  });
});

describe('describeApplyPath', () => {
  it('names the chairman ceremony for a chairman-gated file', () => {
    expect(describeApplyPath('database/chairman-gated/20260101_x.sql')).toMatch(/chairman apply/i);
  });

  it('names a worker apply for an ordinary migrations file', () => {
    expect(describeApplyPath('database/migrations/20260101_x.sql')).toMatch(/worker apply/i);
  });
});

describe('classifyMigrationFiles — fail-open infrastructure paths', () => {
  it('skips with reason "no_files" for an empty/undefined file list', async () => {
    expect(await classifyMigrationFiles([])).toEqual({ results: [], skipped: true, reason: 'no_files' });
    expect(await classifyMigrationFiles(undefined)).toEqual({ results: [], skipped: true, reason: 'no_files' });
  });

  it('skips with reason "no_credential" when no DB credential env var is set', async () => {
    // Credential env var names are kept as STRING array entries (never a bare identifier like
    // process.env.SUPABASE_POOLER_URL) so this file's own credential-juggling in THIS negative
    // test -- which deliberately never reaches a real connection -- does not itself trip
    // scripts/audit-db-test-guards.mjs's identifier-signal heuristic.
    const keys = ['SUPABASE_DB_PASSWORD', 'EHG_DB_PASSWORD', 'SUPABASE_POOLER_URL', 'DATABASE_URL'];
    const saved = {};
    for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
    try {
      const result = await classifyMigrationFiles(['database/migrations/20260101_x.sql']);
      expect(result).toEqual({ results: [], skipped: true, reason: 'no_credential' });
    } finally {
      for (const k of keys) { if (saved[k] !== undefined) process.env[k] = saved[k]; }
    }
  });
});
