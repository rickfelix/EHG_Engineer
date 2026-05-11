/**
 * SD-FDBK-INFRA-FIX-PENDING-MIGRATIONS-001
 *
 * Unit tests for FR-1 (pg_proc probe replacing git-status check) and FR-4
 * (post-apply re-check via pg introspection). Heavier integration tests that
 * actually round-trip to live pg live elsewhere — these tests mock the
 * dependencies so the probe logic itself is exercised deterministically.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock('../../lib/migration-audit-reader.js', () => ({
  hasBeenApplied: vi.fn(),
  getLatestSuccessForPath: vi.fn(),
  listApplied: vi.fn()
}));

vi.mock('../../scripts/lib/supabase-connection.js', () => ({
  createDatabaseClient: vi.fn()
}));

vi.mock('../../scripts/lib/migration-verification.js', () => ({
  captureObjectDefinitions: vi.fn()
}));

const { hasBeenApplied } = await import('../../lib/migration-audit-reader.js');
const { createDatabaseClient } = await import('../../scripts/lib/supabase-connection.js');
const { captureObjectDefinitions } = await import('../../scripts/lib/migration-verification.js');
const { probeDeclaredObjectsExist } = await import(
  '../../scripts/modules/handoff/pre-checks/pending-migrations-check.js'
);

function makeTempSql(contents) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pmc-test-'));
  const file = path.join(dir, 'test-migration.sql');
  writeFileSync(file, contents, 'utf8');
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('probeDeclaredObjectsExist (FR-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createDatabaseClient.mockResolvedValue({ end: vi.fn().mockResolvedValue() });
  });

  it('returns executed=null when the file does not exist', async () => {
    const result = await probeDeclaredObjectsExist('/no/such/path.sql');
    expect(result.executed).toBe(null);
    expect(result.fastPath).toBe('file_missing');
  });

  it('returns executed=true via audit-log fast path when applied', async () => {
    const { file, cleanup } = makeTempSql('CREATE FUNCTION foo() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;');
    try {
      hasBeenApplied.mockResolvedValue(true);
      const r = await probeDeclaredObjectsExist(file);
      expect(r.executed).toBe(true);
      expect(r.fastPath).toBe('audit_log');
      // captureObjectDefinitions must NOT be called on fast path
      expect(captureObjectDefinitions).not.toHaveBeenCalled();
    } finally { cleanup(); }
  });

  it('returns executed=true when declared objects ALL exist in pg', async () => {
    const sql = 'CREATE OR REPLACE FUNCTION public.fn_x(int) RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;';
    const { file, cleanup } = makeTempSql(sql);
    try {
      hasBeenApplied.mockResolvedValue(false);
      captureObjectDefinitions.mockResolvedValue([
        { kind: 'FUNCTION', schema: 'public', name: 'fn_x', definition: 'CREATE FUNCTION ...' }
      ]);
      const r = await probeDeclaredObjectsExist(file);
      expect(r.executed).toBe(true);
      expect(r.missingObjects).toEqual([]);
      expect(r.declaredCount).toBe(1);
    } finally { cleanup(); }
  });

  it('returns executed=false with missing list when objects are NOT present', async () => {
    const sql = `CREATE FUNCTION public.fn_a(int) RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;
                 CREATE FUNCTION public.fn_b(text) RETURNS text AS $$ SELECT $1 $$ LANGUAGE sql;`;
    const { file, cleanup } = makeTempSql(sql);
    try {
      hasBeenApplied.mockResolvedValue(false);
      captureObjectDefinitions.mockResolvedValue([
        { kind: 'FUNCTION', schema: 'public', name: 'fn_a', definition: 'CREATE FUNCTION ...' },
        { kind: 'FUNCTION', schema: 'public', name: 'fn_b', definition: null } // missing
      ]);
      const r = await probeDeclaredObjectsExist(file);
      expect(r.executed).toBe(false);
      expect(r.missingObjects).toEqual([
        { kind: 'FUNCTION', schema: 'public', name: 'fn_b' }
      ]);
      expect(r.declaredCount).toBe(2);
    } finally { cleanup(); }
  });

  it('returns executed=null when the migration declares zero parseable objects (INDETERMINATE)', async () => {
    const { file, cleanup } = makeTempSql('-- data only\nINSERT INTO foo VALUES (1);');
    try {
      hasBeenApplied.mockResolvedValue(false);
      const r = await probeDeclaredObjectsExist(file);
      expect(r.executed).toBe(null);
      expect(r.fastPath).toBe('no_declared_objects');
      expect(captureObjectDefinitions).not.toHaveBeenCalled();
    } finally { cleanup(); }
  });

  it('genesis replay: a CREATE TRIGGER not yet applied → executed=false (closes PR #3703 class)', async () => {
    const sql = `CREATE OR REPLACE FUNCTION trg_fn() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;
                 CREATE TRIGGER cascade_trg_v2 BEFORE UPDATE ON sd_feedback FOR EACH ROW EXECUTE FUNCTION trg_fn();`;
    const { file, cleanup } = makeTempSql(sql);
    try {
      hasBeenApplied.mockResolvedValue(false);
      // FN exists (was applied), TRIGGER does not (this is the genesis class)
      captureObjectDefinitions.mockResolvedValue([
        { kind: 'FUNCTION', schema: 'public', name: 'trg_fn', definition: 'CREATE FUNCTION ...' },
        { kind: 'TRIGGER', schema: 'public', name: 'cascade_trg_v2', definition: null }
      ]);
      const r = await probeDeclaredObjectsExist(file);
      expect(r.executed).toBe(false);
      expect(r.missingObjects).toEqual([
        { kind: 'TRIGGER', schema: 'public', name: 'cascade_trg_v2' }
      ]);
    } finally { cleanup(); }
  });

  it('audit-log fast path errors do not crash — falls through to declared probe', async () => {
    const sql = 'CREATE FUNCTION public.fn_x() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;';
    const { file, cleanup } = makeTempSql(sql);
    try {
      hasBeenApplied.mockRejectedValue(new Error('audit read transient'));
      captureObjectDefinitions.mockResolvedValue([
        { kind: 'FUNCTION', schema: 'public', name: 'fn_x', definition: 'CREATE ...' }
      ]);
      const r = await probeDeclaredObjectsExist(file);
      expect(r.executed).toBe(true);
      expect(r.fastPath).toBe(null);
    } finally { cleanup(); }
  });
});
