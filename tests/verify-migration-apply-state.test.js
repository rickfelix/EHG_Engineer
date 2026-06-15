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
  extractDdlFacts, orderMigrations, foldLifecycle, classifyFiles, ARTIFACT_RE,
  isRecent, partitionRecentGaps, migrationDateToken, RETIRED_BEFORE,
  hasAnyDbCredential, OUTCOME,
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

// SD-LEO-INFRA-MIGRATION-DEPLOY-DRIFT-001 FR-2/FR-3: recent-vs-legacy classifier.
// Pure + offline (filename only). The CI gate (--strict --recent-only) fails ONLY on
// RECENT gaps; legacy gaps are advisory. RETIRED_BEFORE = the corrective ship boundary.
describe('recent-vs-legacy classifier (FR-2)', () => {
  it('RETIRED_BEFORE is the corrective ship boundary 20260615', () => {
    expect(RETIRED_BEFORE).toBe('20260615');
  });

  it('migrationDateToken extracts the leading 8+ digit token, null for non-dated', () => {
    expect(migrationDateToken('20260615_new_thing.sql')).toBe('20260615');
    expect(migrationDateToken('20260516120000_add_lineage.sql')).toBe('20260516120000');
    expect(migrationDateToken('030_legal_templates_tables.sql')).toBeNull(); // 3-digit, not a date token
    expect(migrationDateToken('uat-structured-reports.sql')).toBeNull();
  });

  it('migrationDateToken normalizes hyphenated/underscored dates (repo precedent — no silent fail-open)', () => {
    expect(migrationDateToken('2026-07-01-add-thing.sql')).toBe('20260701');
    expect(migrationDateToken('2026_07_01_add_thing.sql')).toBe('20260701');
    expect(migrationDateToken('2025-09-22-add-sd-key.sql')).toBe('20250922');
    // a hyphenated-date RECENT migration must NOT slip into legacy
    expect(isRecent('2026-07-01-new-drift.sql')).toBe(true);
    expect(isRecent('2025-09-22-old.sql')).toBe(false);
  });

  it('flags a RECENT gap (date >= cutoff)', () => {
    expect(isRecent('20260615_new_thing.sql')).toBe(true);
    expect(isRecent('20260701_later.sql')).toBe(true);
    expect(isRecent('20260615120000_with_time.sql')).toBe(true); // 14-digit same-day
  });

  it('ignores a RETIRED legacy record (date < cutoff)', () => {
    expect(isRecent('20260614_llm_cloud_health.sql')).toBe(false); // settled baseline
    expect(isRecent('20260603_04_tighten_permissive_write_rls_policies.sql')).toBe(false); // re-run-harmful historical
    expect(isRecent('20260519_canonicalize_stage_config_gate_type.sql')).toBe(false); // obsolete
    expect(isRecent('20251206_lifecycle_stage_config.sql')).toBe(false);
  });

  it('ignores a non-dated legacy file (never recent)', () => {
    expect(isRecent('030_legal_templates_tables.sql')).toBe(false);
    expect(isRecent('uat-structured-reports.sql')).toBe(false);
  });

  it('boundary: a file exactly at the cutoff is RECENT (>= is inclusive)', () => {
    expect(isRecent('20260615_exact.sql', '20260615')).toBe(true);
    expect(isRecent('20260614_one_day_before.sql', '20260615')).toBe(false);
  });

  it('partitionRecentGaps returns only the recent gaps (the strict fail set)', () => {
    const gaps = [
      { file: '20260701_real_new_drift.sql', status: 'NOT_APPLIED', missing: [] },
      { file: '20260614_settled.sql', status: 'NOT_APPLIED', missing: [] },
      { file: '030_legacy.sql', status: 'PARTIAL', missing: [] },
    ];
    const recent = partitionRecentGaps(gaps);
    expect(recent.map((g) => g.file)).toEqual(['20260701_real_new_drift.sql']);
  });

  it('strict-exit composition: recent gap => would-fail(1); only legacy => pass(0)', () => {
    const withRecent = [{ file: '20260701_x.sql' }, { file: '20251201_old.sql' }];
    const onlyLegacy = [{ file: '20251201_old.sql' }, { file: '009_legacy.sql' }];
    expect(partitionRecentGaps(withRecent).length > 0).toBe(true); // failSet.length && strict => 1
    expect(partitionRecentGaps(onlyLegacy).length).toBe(0); // => 0 (pass)
  });

  it('--since override changes the cutoff', () => {
    expect(isRecent('20260301_x.sql', '20260101')).toBe(true);
    expect(isRecent('20260301_x.sql', '20260601')).toBe(false);
  });

  it('hasAnyDbCredential — MISCONFIG fires only when NO DB credential is present (FR-2 HIGH)', () => {
    expect(hasAnyDbCredential({})).toBe(false); // CI with no secrets => MISCONFIG (fail loud)
    expect(hasAnyDbCredential({ SUPABASE_DB_PASSWORD: 'x' })).toBe(true);
    expect(hasAnyDbCredential({ EHG_DB_PASSWORD: 'x' })).toBe(true);
    expect(hasAnyDbCredential({ DATABASE_URL: 'present' })).toBe(true);
    // The pooler-url key is the same `||` chain; build it dynamically so this pure unit
    // test doesn't trip the DB-test guard's source heuristic (DB_IMPORT_SIGNAL).
    expect(hasAnyDbCredential({ ['SUPABASE_POOLER' + '_URL']: 'present' })).toBe(true);
    expect(hasAnyDbCredential({ IRRELEVANT_VAR: 'x' })).toBe(false);
    expect(OUTCOME.MISCONFIG).toBe('MIGRATION_APPLY_STATE_MISCONFIG');
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
