/**
 * Unit tests for the ALTER SET DEFAULT vs code-override (F12) drift lint.
 * SD-LEO-INFRA-LINT-ALTER-SET-001 — FR-1..FR-7 / TS-1..TS-5, AC-SCOPE.
 *
 * Pure-function tests (no fs/DB/network): exercise the migration-default
 * extractor, value classifier, SQL/JS writer extractors, the override
 * classifier (honors / intentional-override / drift / ambiguous), and the
 * allow-list loader.
 */
import { describe, it, expect } from 'vitest';
import {
  extractMigrationDefaults,
  normalizeDefault,
  classifyValue,
  valuesMatch,
  extractSqlWriters,
  extractJsWriters,
  classifyOverrides,
  COMMON_COLUMNS,
} from '../../scripts/lint/alter-default-override-lint.mjs';

const rowFor = (rows, table, col) => rows.find((r) => r.table === table && r.column === col);

describe('extractMigrationDefaults (FR-1)', () => {
  it('extracts a single ALTER COLUMN ... SET DEFAULT', () => {
    const d = extractMigrationDefaults("ALTER TABLE user_stories ALTER COLUMN status SET DEFAULT 'draft';");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ table: 'user_stories', column: 'status', norm: 'draft', isExpression: false });
  });

  it('extracts multiple comma-separated ALTER COLUMN clauses on one ALTER TABLE', () => {
    const sql = `ALTER TABLE sd
      ALTER COLUMN key_principles SET DEFAULT '[]'::jsonb,
      ALTER COLUMN success_metrics SET DEFAULT '[]'::jsonb;`;
    const d = extractMigrationDefaults(sql);
    expect(d.map((x) => x.column).sort()).toEqual(['key_principles', 'success_metrics']);
    expect(d.every((x) => x.norm === '[]')).toBe(true);
  });

  it('handles ALTER COLUMN on a line separate from ALTER TABLE', () => {
    const sql = `ALTER TABLE eva_support_decision_log\n  ALTER COLUMN decision_kind SET DEFAULT 'sd_recommendation';`;
    const d = extractMigrationDefaults(sql);
    expect(d[0]).toMatchObject({ table: 'eva_support_decision_log', column: 'decision_kind', norm: 'sd_recommendation' });
  });

  it('ignores commented-out ALTER statements', () => {
    const sql = `--   ALTER COLUMN status SET DEFAULT 'ready';\nALTER TABLE t ALTER COLUMN status SET DEFAULT 'draft';`;
    const d = extractMigrationDefaults(sql);
    expect(d).toHaveLength(1);
    expect(d[0].norm).toBe('draft');
  });

  it('does NOT match CREATE TABLE column defaults (AC-SCOPE)', () => {
    const sql = `CREATE TABLE t (id int, status text DEFAULT 'open');`;
    expect(extractMigrationDefaults(sql)).toHaveLength(0);
  });

  it('flags a function/expression default as isExpression (out of failing class)', () => {
    const d = extractMigrationDefaults('ALTER TABLE t ALTER COLUMN created_at SET DEFAULT now();');
    expect(d[0].isExpression).toBe(true);
  });
});

describe('normalizeDefault / classifyValue / valuesMatch', () => {
  it('strips ::type casts and quotes', () => {
    expect(normalizeDefault("'[]'::jsonb").norm).toBe('[]');
    expect(normalizeDefault('25').norm).toBe('25');
    expect(normalizeDefault('NULL').norm).toBeNull();
  });
  it('classifies literals vs computed values', () => {
    expect(classifyValue("'draft'")).toMatchObject({ kind: 'literal', norm: 'draft' });
    expect(classifyValue('25')).toMatchObject({ kind: 'literal', norm: '25' });
    expect(classifyValue('null')).toMatchObject({ kind: 'literal', norm: null });
    expect(classifyValue('someVariable').kind).toBe('computed');
    expect(classifyValue('`${x}`').kind).toBe('computed');
  });
  it('valuesMatch handles NULL default vs literal', () => {
    expect(valuesMatch(null, null)).toBe(true);
    expect(valuesMatch(null, 'EXEC_TO_PLAN')).toBe(false);
    expect(valuesMatch('draft', 'draft')).toBe(true);
  });
});

describe('writer extractors (FR-2)', () => {
  it('extractSqlWriters maps INSERT columns positionally', () => {
    const w = extractSqlWriters("INSERT INTO user_stories (id, status) VALUES (1, 'ready');", new Set(['status']));
    expect(w).toEqual([{ table: 'user_stories', column: 'status', value: "'ready'", strong: true }]);
  });
  it('extractJsWriters attributes table via nearest .from()', () => {
    const src = `await supabase.from('user_stories').insert({ status: 'ready' });`;
    const w = extractJsWriters(src, new Set(['status']));
    expect(w[0]).toMatchObject({ table: 'user_stories', column: 'status', strong: true });
  });
  it('extractJsWriters records null table when no .from() is nearby', () => {
    const src = `const row = { decision_kind: 'reader_error' };`;
    const w = extractJsWriters(src, new Set(['decision_kind']));
    expect(w[0]).toMatchObject({ table: null, column: 'decision_kind', strong: false });
  });
});

describe('classifyOverrides (FR-3) — TS-1..TS-5', () => {
  const defaults = [
    { table: 'user_stories', column: 'status', norm: 'draft', isExpression: false },
    { table: 'retrospectives', column: 'retrospective_type', norm: null, isExpression: false },
  ];

  it('TS-2: synthetic drift (writer literal != default, not allow-listed) FAILS (AC-6)', () => {
    const writers = [{ table: 'user_stories', column: 'status', value: "'ready'", file: 'x.js' }];
    const rows = classifyOverrides(defaults, writers, new Set());
    const r = rowFor(rows, 'user_stories', 'status');
    expect(r.fail).toBe(true);
    expect(r.driftCount).toBe(1);
  });

  it('TS-3: allow-list silences the drift', () => {
    const writers = [{ table: 'user_stories', column: 'status', value: "'ready'", file: 'x.js' }];
    const rows = classifyOverrides(defaults, writers, new Set(['user_stories.status']));
    expect(rowFor(rows, 'user_stories', 'status').fail).toBe(false);
  });

  it('honors: writer literal equals default → no drift', () => {
    const writers = [{ table: 'user_stories', column: 'status', value: "'draft'", file: 'x.js' }];
    const r = rowFor(classifyOverrides(defaults, writers, new Set()), 'user_stories', 'status');
    expect(r.fail).toBe(false);
    expect(r.writers[0].classification).toBe('honors');
  });

  it('TS-4: computed value → ambiguous, never fails', () => {
    const writers = [{ table: 'retrospectives', column: 'retrospective_type', value: 'retrospectiveType', file: 'x.js' }];
    const r = rowFor(classifyOverrides(defaults, writers, new Set()), 'retrospectives', 'retrospective_type');
    expect(r.fail).toBe(false);
    expect(r.writers[0].classification).toBe('ambiguous');
  });

  it('distinctive column attributes by name without .from()', () => {
    const defs = [{ table: 'retrospectives', column: 'retrospective_type', norm: null, isExpression: false }];
    const writers = [{ table: null, column: 'retrospective_type', value: "'EXEC_TO_PLAN'", file: 'x.js' }];
    const r = rowFor(classifyOverrides(defs, writers, new Set()), 'retrospectives', 'retrospective_type');
    expect(r.driftCount).toBe(1); // name-attributed → override drift
  });

  it('common column without strong attribution is DROPPED (no cross-table false positive)', () => {
    expect(COMMON_COLUMNS.has('status')).toBe(true);
    const writers = [{ table: null, column: 'status', value: "'archived'", file: 'some_other_table.js' }];
    const r = rowFor(classifyOverrides(defaults, writers, new Set()), 'user_stories', 'status');
    expect(r.writers).toHaveLength(0); // dropped, not flagged
    expect(r.fail).toBe(false);
  });

  it('expression defaults are excluded from the failing class', () => {
    const defs = [{ table: 't', column: 'created_at', norm: 'now()', isExpression: true }];
    const writers = [{ table: 't', column: 'created_at', value: "'2020-01-01'", file: 'x.js' }];
    expect(classifyOverrides(defs, writers, new Set())).toHaveLength(0);
  });
});
