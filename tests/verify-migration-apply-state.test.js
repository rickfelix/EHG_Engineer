/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-001 — migration apply-state verifier (pure core).
 * All offline: exercises the exported pure functions (extraction, preprocessing, ordering,
 * lifecycle fold, classification) with no live DB; plus static wiring pins.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stripNonDdl, normalizeName, extractDdlFacts, orderMigrations,
  foldLifecycle, classifyFiles, ARTIFACT_RE,
} from '../scripts/verify-migration-apply-state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('extraction — each DDL class', () => {
  it('CREATE TABLE incl. IF NOT EXISTS, quoted, schema-qualified', () => {
    const { creates } = extractDdlFacts(`
      CREATE TABLE foo (id int);
      CREATE TABLE IF NOT EXISTS public.bar (id int);
      CREATE TABLE "Quoted_Baz" (id int);
    `);
    expect(creates).toEqual(expect.arrayContaining([
      { cls: 'table', name: 'foo' }, { cls: 'table', name: 'bar' }, { cls: 'table', name: 'quoted_baz' },
    ]));
  });

  it('VIEW / MATERIALIZED VIEW / FUNCTION / TRIGGER / INDEX / CONSTRAINT', () => {
    const { creates } = extractDdlFacts(`
      CREATE OR REPLACE VIEW v_x AS SELECT 1;
      CREATE MATERIALIZED VIEW mv_y AS SELECT 1;
      CREATE OR REPLACE FUNCTION fn_z() RETURNS void LANGUAGE sql AS 'SELECT 1';
      CREATE TRIGGER trg_a BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION fn_z();
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_b ON t(c);
      ALTER TABLE t ADD CONSTRAINT t_c_key UNIQUE (c);
    `);
    const got = Object.fromEntries(creates.map((c) => [c.cls, c.name]));
    expect(got).toMatchObject({
      view: 'v_x', matview: 'mv_y', function: 'fn_z', trigger: 'trg_a', index: 'idx_b', constraint: 't_c_key',
    });
  });

  it('DROP forms extract for the fold', () => {
    const { drops } = extractDdlFacts(`
      DROP TABLE IF EXISTS foo;
      DROP VIEW v_x;
      DROP FUNCTION IF EXISTS fn_z();
      ALTER TABLE t DROP CONSTRAINT IF EXISTS t_c_key;
    `);
    expect(drops).toEqual(expect.arrayContaining([
      { cls: 'table', name: 'foo' }, { cls: 'view', name: 'v_x' },
      { cls: 'function', name: 'fn_z' }, { cls: 'constraint', name: 't_c_key' },
    ]));
  });
});

describe('preprocessing — DDL-looking text never false-positives', () => {
  it('strips bare $$ and named $tag$ dollar-quoted bodies', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION real_fn() RETURNS void LANGUAGE plpgsql AS $body$
      BEGIN
        EXECUTE 'CREATE TABLE phantom_inside_body (id int)';
        RAISE NOTICE 'CREATE VIEW also_phantom AS SELECT 1';
      END
      $body$;
      DO $$ BEGIN PERFORM 'CREATE TRIGGER ghost_trg'; END $$;
    `;
    const { creates } = extractDdlFacts(sql);
    expect(creates).toEqual([{ cls: 'function', name: 'real_fn' }]);
  });

  it('strips line and block comments', () => {
    const { creates } = extractDdlFacts(`
      -- CREATE TABLE commented_out (id int);
      /* CREATE VIEW blocked_out AS SELECT 1; */
      CREATE TABLE real_one (id int);
    `);
    expect(creates).toEqual([{ cls: 'table', name: 'real_one' }]);
  });
});

describe('ordering + artifact exclusion', () => {
  it('legacy non-dated files sort before dated; dated sort chronologically', () => {
    expect(orderMigrations(['20260601_b.sql', '009_legacy.sql', '20250101_a.sql', 'update_thing.sql']))
      .toEqual(['009_legacy.sql', 'update_thing.sql', '20250101_a.sql', '20260601_b.sql']);
  });

  it('ARTIFACT_RE excludes DOWN, rollback, and DEFERRED files', () => {
    expect(ARTIFACT_RE.test('x_DOWN.sql')).toBe(true);
    expect(ARTIFACT_RE.test('x_rollback.sql')).toBe(true);
    expect(ARTIFACT_RE.test('x_DEFERRED.sql')).toBe(true);
    expect(ARTIFACT_RE.test('x_forward.sql')).toBe(false);
  });
});

describe('lifecycle fold — drop-aware expectations', () => {
  const facts = (file, sql) => ({ file, ...extractDdlFacts(sql) });

  it('created-then-dropped-later is NOT expected live; ledger records the pair', () => {
    const { expected, droppedLater } = foldLifecycle([
      facts('a.sql', 'CREATE TABLE temp_t (id int);'),
      facts('b.sql', 'DROP TABLE temp_t;'),
    ]);
    expect(expected.has('table:temp_t')).toBe(false);
    expect(droppedLater).toEqual([expect.objectContaining({ name: 'temp_t', createdIn: 'a.sql', droppedIn: 'b.sql' })]);
  });

  it('re-create after drop is expected again (provenance = recreating file)', () => {
    const { expected } = foldLifecycle([
      facts('a.sql', 'CREATE TABLE t1 (id int);'),
      facts('b.sql', 'DROP TABLE t1;'),
      facts('c.sql', 'CREATE TABLE t1 (id int);'),
    ]);
    expect(expected.get('table:t1')).toMatchObject({ file: 'c.sql' });
  });
});

describe('classification', () => {
  it('APPLIED / PARTIAL / NOT_APPLIED / NO_DDL from an injected live-set', () => {
    const ff = [
      { file: 'all-live.sql', ...extractDdlFacts('CREATE TABLE a1 (i int); CREATE VIEW a2 AS SELECT 1;') },
      { file: 'half.sql', ...extractDdlFacts('CREATE TABLE b1 (i int); CREATE TABLE b2 (i int);') },
      { file: 'none.sql', ...extractDdlFacts('CREATE TABLE c1 (i int);') },
      { file: 'docs-only.sql', ...extractDdlFacts('-- comment only\nSELECT 1;') },
    ];
    const { expected, perFile } = foldLifecycle(ff);
    const live = new Set(['table:a1', 'view:a2', 'table:b1']);
    const res = Object.fromEntries(
      classifyFiles(ff.map((f) => f.file), expected, perFile, live).map((r) => [r.file, r.status])
    );
    expect(res).toEqual({ 'all-live.sql': 'APPLIED', 'half.sql': 'PARTIAL', 'none.sql': 'NOT_APPLIED', 'docs-only.sql': 'NO_DDL' });
  });

  it('a file whose every object was superseded later classifies APPLIED (not a gap)', () => {
    const ff = [
      { file: 'old.sql', ...extractDdlFacts('CREATE TABLE gone (i int);') },
      { file: 'newer.sql', ...extractDdlFacts('DROP TABLE gone; CREATE TABLE kept (i int);') },
    ];
    const { expected, perFile } = foldLifecycle(ff);
    const res = classifyFiles(['old.sql', 'newer.sql'], expected, perFile, new Set(['table:kept']));
    expect(res.find((r) => r.file === 'old.sql').status).toBe('APPLIED');
  });
});

describe('wiring pins', () => {
  it('package.json has the migration:apply-state entry', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['migration:apply-state']).toBe('node scripts/verify-migration-apply-state.mjs');
  });

  it('entry point exits via armCliTeardown (exit-hang class primitive)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-migration-apply-state.mjs'), 'utf8');
    expect(src).toMatch(/import \{ armCliTeardown \} from '\.\.\/lib\/cli-graceful-exit\.js'/);
    expect(src).toMatch(/\.then\(\(code\) => armCliTeardown\(code\)\)/);
  });
});
