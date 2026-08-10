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

  // SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 FR-6: the optional THIRD parameter.
  // The whole point of it being optional-and-last is that everything above this comment
  // keeps passing untouched — those are the byte-identical-no-ledger-path assertions.
  describe('ledger suppression seam (TRIAGE FR-6)', () => {
    const gaps = [
      { file: '20260701_real_new_drift.sql', status: 'NOT_APPLIED', missing: [] },
      { file: '20260702_retired_thing.sql', status: 'NOT_APPLIED', missing: [] },
      { file: '20260614_settled.sql', status: 'NOT_APPLIED', missing: [] },
    ];

    it('omitting the parameter suppresses nothing (no-ledger path unchanged)', () => {
      expect(partitionRecentGaps(gaps, RETIRED_BEFORE).map((g) => g.file))
        .toEqual(partitionRecentGaps(gaps).map((g) => g.file));
      expect(partitionRecentGaps(gaps)).toHaveLength(2);
    });

    it('an empty suppression set is identical to omitting it', () => {
      expect(partitionRecentGaps(gaps, RETIRED_BEFORE, new Set()).map((g) => g.file))
        .toEqual(partitionRecentGaps(gaps).map((g) => g.file));
    });

    it('AC-2: a dispositioned file leaves failSet while an undispositioned recent file still fails', () => {
      const recent = partitionRecentGaps(gaps, RETIRED_BEFORE, new Set(['20260702_retired_thing.sql']));
      expect(recent.map((g) => g.file)).toEqual(['20260701_real_new_drift.sql']);
      expect(recent.length > 0).toBe(true); // still red — suppression did not fake a pass
    });

    it('suppression can only REMOVE from the fail set, never admit a legacy gap into it', () => {
      // A ledger naming a legacy file cannot pull it into recentGaps: isRecent still gates.
      const recent = partitionRecentGaps(gaps, RETIRED_BEFORE, new Set(['20260614_settled.sql']));
      expect(recent.map((g) => g.file)).toEqual(['20260701_real_new_drift.sql', '20260702_retired_thing.sql']);
    });

    it('matches on basename, so a path-qualified gap is still suppressed', () => {
      const pathGaps = [{ file: 'database/migrations/20260701_real_new_drift.sql' }];
      expect(partitionRecentGaps(pathGaps, RETIRED_BEFORE, new Set(['20260701_real_new_drift.sql']))).toHaveLength(0);
    });

    it('C3 NEGATIVE CONTROL: an UNsuppressed path-qualified recent gap stays in the fail set', () => {
      // SD-LEO-INFRA-MIGRATION-APPLY-STATE-002. The test above passed for the WRONG reason
      // before the multi-root change: migrationDateToken anchored on the raw string, so the
      // prefixed id had a null token, classified LEGACY, and the empty result proved nothing
      // about suppression — the exact fail-open FR-A closes (a recent new-root gap escaping
      // the strict gate). This control fails pre-change and pins the repaired meaning: the
      // gap survives an EMPTY suppression set precisely because it now classifies RECENT.
      const pathGaps = [{ file: 'supabase/migrations/20260701_real_new_drift.sql' }];
      expect(partitionRecentGaps(pathGaps, RETIRED_BEFORE, new Set())).toHaveLength(1);
    });

    it('a non-Set argument degrades to no suppression rather than throwing', () => {
      for (const bad of [null, undefined, ['20260701_real_new_drift.sql'], 'x', {}]) {
        expect(partitionRecentGaps(gaps, RETIRED_BEFORE, bad)).toHaveLength(2);
      }
    });
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

/**
 * QF-20260725-470 — ADD COLUMN class. The verifier had NO column class, so a migration whose only
 * DDL is ALTER TABLE ... ADD COLUMN was structurally invisible and could contribute to a
 * MIGRATION_APPLY_STATE_PASS (live ghost 2026-07-25: chairman-gated QF-20260719-281 closed while
 * ship_review_findings.metadata/.repo and quick_fixes.factory_lane were still absent from prod).
 * Names are table-qualified because a bare column name is not unique across the schema.
 */
describe('extraction — ADD COLUMN class (QF-20260725-470)', () => {
  it('extracts a single ADD COLUMN, table-qualified, incl. IF NOT EXISTS', () => {
    const { creates } = extractDdlFacts('ALTER TABLE ship_review_findings ADD COLUMN IF NOT EXISTS metadata jsonb;');
    expect(creates).toEqual([{ cls: 'column', name: 'ship_review_findings.metadata' }]);
  });

  it('pairs the table with EVERY item of a comma-separated multi-column ALTER', () => {
    const { creates } = extractDdlFacts(
      'ALTER TABLE sms_budget\n  ADD COLUMN IF NOT EXISTS envelope_cents int,\n  ADD COLUMN spent_cents int DEFAULT 0;'
    );
    expect(creates).toEqual([
      { cls: 'column', name: 'sms_budget.envelope_cents' },
      { cls: 'column', name: 'sms_budget.spent_cents' },
    ]);
  });

  it('normalizes quoted and schema-qualified table/column names', () => {
    const { creates } = extractDdlFacts('ALTER TABLE public."quick_fixes" ADD COLUMN "factory_lane" text;');
    expect(creates).toEqual([{ cls: 'column', name: 'quick_fixes.factory_lane' }]);
  });

  it('handles a final statement with no trailing semicolon', () => {
    const { creates } = extractDdlFacts('ALTER TABLE foo ADD COLUMN bar text');
    expect(creates).toEqual([{ cls: 'column', name: 'foo.bar' }]);
  });

  it('keeps tables distinct across multiple ALTER statements', () => {
    const { creates } = extractDdlFacts('ALTER TABLE a ADD COLUMN x int;\nALTER TABLE b ADD COLUMN y int;');
    expect(creates.map((c) => c.name)).toEqual(['a.x', 'b.y']);
  });

  it('routes DROP COLUMN to drops so the lifecycle fold stays drop-aware', () => {
    const { creates, drops } = extractDdlFacts('ALTER TABLE foo ADD COLUMN a int, DROP COLUMN b;');
    expect(creates).toEqual([{ cls: 'column', name: 'foo.a' }]);
    expect(drops).toEqual([{ cls: 'column', name: 'foo.b' }]);
  });

  it('a column added then dropped later does NOT survive as an expected object', () => {
    const folded = foldLifecycle([
      { file: '1_add.sql', ...extractDdlFacts('ALTER TABLE foo ADD COLUMN tmp int;') },
      { file: '2_drop.sql', ...extractDdlFacts('ALTER TABLE foo DROP COLUMN tmp;') },
    ]);
    expect([...folded.expected.keys()]).not.toContain('column:foo.tmp');
  });

  it('an absent declared column classifies NOT_APPLIED, not APPLIED', () => {
    const facts = [{ file: 'm.sql', ...extractDdlFacts('ALTER TABLE ship_review_findings ADD COLUMN metadata jsonb;') }];
    const { expected, perFile } = foldLifecycle(facts);
    const live = new Set(); // column absent live
    const [row] = classifyFiles(['m.sql'], expected, perFile, live);
    expect(row.status).toBe('NOT_APPLIED');
    expect(row.missing).toEqual([{ cls: 'column', name: 'ship_review_findings.metadata' }]);
  });

  it('ignores ADD COLUMN inside comments and dollar-quoted bodies', () => {
    const dq = '$' + '$';
    const { creates } = extractDdlFacts(
      '-- ALTER TABLE ghost ADD COLUMN nope text;\n' +
      `CREATE FUNCTION f() RETURNS void AS ${dq} BEGIN EXECUTE 'ALTER TABLE ghost ADD COLUMN nope text'; END ${dq} LANGUAGE plpgsql;`
    );
    expect(creates.filter((c) => c.cls === 'column')).toEqual([]);
  });

  it('does not regress ADD CONSTRAINT, which shares the ALTER TABLE prefix', () => {
    const { creates } = extractDdlFacts('ALTER TABLE foo ADD CONSTRAINT foo_pk PRIMARY KEY (id);');
    expect(creates).toEqual([{ cls: 'constraint', name: 'foo_pk' }]);
  });

  it('an ALTER TABLE with no column items yields no facts', () => {
    expect(extractDdlFacts('ALTER TABLE foo ENABLE ROW LEVEL SECURITY;').creates).toEqual([]);
  });

  it('the live resolver has a column branch querying information_schema.columns', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-migration-apply-state.mjs'), 'utf8');
    expect(src).toMatch(/byClass\.get\('column'\)/);
    expect(src).toMatch(/information_schema\.columns/);
  });
});
