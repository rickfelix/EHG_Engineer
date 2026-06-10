/**
 * Unit tests — DR restore-rehearsal pure core (FR-4,
 * SD-LEO-INFRA-RESILIENCE-REVIEW-SPECIAL-001).
 *
 * Offline by construction: imports only restore-rehearsal-core.mjs (no DB
 * modules) and exercises the audited executor against a mock client.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  scratchSchemaName,
  isValidScratchSchema,
  clampSampleSize,
  classifyStatement,
  makeAuditedExecutor,
  fieldsMatch,
  compareRestoredRows,
  md5ListsMatch,
  buildReport,
  MAX_SAMPLE,
} from '../../scripts/dr/restore-rehearsal-core.mjs';

const SCHEMA = 'dr_rehearsal_20260610_2300';

describe('scratchSchemaName / isValidScratchSchema', () => {
  it('formats UTC yyyymmdd_hhmm with the dr_rehearsal_ prefix', () => {
    const d = new Date(Date.UTC(2026, 5, 10, 23, 5)); // June = month index 5
    expect(scratchSchemaName(d)).toBe('dr_rehearsal_20260610_2305');
  });

  it('round-trips its own validator', () => {
    expect(isValidScratchSchema(scratchSchemaName())).toBe(true);
  });

  it('rejects injection-shaped names', () => {
    expect(isValidScratchSchema('dr_rehearsal_2026; DROP TABLE x')).toBe(false);
    expect(isValidScratchSchema('public')).toBe(false);
    expect(isValidScratchSchema('')).toBe(false);
    expect(isValidScratchSchema(null)).toBe(false);
  });
});

describe('clampSampleSize', () => {
  it('clamps to MAX_SAMPLE', () => {
    expect(clampSampleSize(10000)).toBe(MAX_SAMPLE);
    expect(clampSampleSize('9999')).toBe(MAX_SAMPLE);
  });
  it('passes through small positive integers', () => {
    expect(clampSampleSize(25)).toBe(25);
    expect(clampSampleSize('42')).toBe(42);
  });
  it('falls back on garbage / non-positive', () => {
    expect(clampSampleSize('abc')).toBe(MAX_SAMPLE);
    expect(clampSampleSize(-5)).toBe(MAX_SAMPLE);
    expect(clampSampleSize(0)).toBe(MAX_SAMPLE);
  });
});

describe('classifyStatement — the read-only safety contract', () => {
  it('classifies pure reads', () => {
    expect(classifyStatement('SELECT 1', SCHEMA)).toBe('read');
    expect(classifyStatement('  select id, row_data FROM public.retention_archive WHERE source_table = $1 LIMIT 500', SCHEMA)).toBe('read');
    expect(classifyStatement('WITH s AS (SELECT 1) SELECT * FROM s', SCHEMA)).toBe('read');
  });

  it('allows DDL/DML scoped to the scratch schema only', () => {
    expect(classifyStatement(`CREATE SCHEMA "${SCHEMA}"`, SCHEMA)).toBe('scratch-write');
    expect(classifyStatement(`CREATE TABLE "${SCHEMA}"."restored_x" (id uuid)`, SCHEMA)).toBe('scratch-write');
    expect(classifyStatement(`INSERT INTO "${SCHEMA}"."restored_x" SELECT * FROM public.src LIMIT 5`, SCHEMA)).toBe('scratch-write');
    expect(classifyStatement(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`, SCHEMA)).toBe('scratch-write');
    // unquoted identifiers too
    expect(classifyStatement(`CREATE TABLE ${SCHEMA}.t (id int)`, SCHEMA)).toBe('scratch-write');
  });

  it('forbids any write outside the scratch schema', () => {
    expect(classifyStatement('INSERT INTO public.strategic_directives_v2 VALUES (1)', SCHEMA)).toBe('forbidden');
    expect(classifyStatement('UPDATE public.feedback SET status = $1', SCHEMA)).toBe('forbidden');
    expect(classifyStatement('DELETE FROM retention_archive', SCHEMA)).toBe('forbidden');
    expect(classifyStatement('TRUNCATE public.audit_log', SCHEMA)).toBe('forbidden');
    expect(classifyStatement('DROP TABLE public.feedback', SCHEMA)).toBe('forbidden');
    expect(classifyStatement('CREATE TABLE public.evil (id int)', SCHEMA)).toBe('forbidden');
    expect(classifyStatement(`CREATE TABLE other_schema.t (LIKE "${SCHEMA}".x)`, SCHEMA)).toBe('forbidden');
    expect(classifyStatement('DROP SCHEMA public CASCADE', SCHEMA)).toBe('forbidden');
  });

  it('forbids sneaky read-shaped writes', () => {
    expect(classifyStatement('SELECT * INTO public.copy FROM public.src', SCHEMA)).toBe('forbidden');
    expect(classifyStatement('WITH d AS (DELETE FROM public.x RETURNING *) SELECT * FROM d', SCHEMA)).toBe('forbidden');
  });

  it('does not false-positive on keywords embedded inside identifiers', () => {
    // attisdropped contains "DROP" but not as a word
    expect(classifyStatement('SELECT a.attname FROM pg_attribute a WHERE NOT a.attisdropped', SCHEMA)).toBe('read');
  });

  it('forbids everything when the scratch schema name itself is invalid', () => {
    expect(classifyStatement('SELECT 1', 'public')).toBe('forbidden');
  });

  it('strips comments before classifying', () => {
    expect(classifyStatement('-- harmless\nSELECT 1', SCHEMA)).toBe('read');
    expect(classifyStatement('/* x */ DELETE FROM public.y', SCHEMA)).toBe('forbidden');
  });
});

describe('makeAuditedExecutor', () => {
  it('executes whitelisted statements and records the audit trail', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) };
    const audit = [];
    const execute = makeAuditedExecutor(client, SCHEMA, audit);

    await execute('SELECT 1', [], 'probe');
    await execute(`CREATE SCHEMA "${SCHEMA}"`, [], 'create');

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ label: 'probe', kind: 'read', executed: true });
    expect(audit[1]).toMatchObject({ label: 'create', kind: 'scratch-write', executed: true });
  });

  it('REFUSES forbidden statements before they reach the client', async () => {
    const client = { query: vi.fn() };
    const audit = [];
    const execute = makeAuditedExecutor(client, SCHEMA, audit);

    await expect(execute('DELETE FROM public.feedback', [], 'evil')).rejects.toThrow(/SAFETY/);
    expect(client.query).not.toHaveBeenCalled();
    expect(audit[0]).toMatchObject({ kind: 'forbidden', executed: false });
  });

  it('rejects construction with an invalid scratch schema', () => {
    expect(() => makeAuditedExecutor({ query: vi.fn() }, 'public', [])).toThrow(/Invalid scratch schema/);
  });
});

describe('fieldsMatch — semantic round-trip equality', () => {
  it('strict equals and null/undefined unification', () => {
    expect(fieldsMatch('a', 'a')).toBe(true);
    expect(fieldsMatch(null, null)).toBe(true);
    expect(fieldsMatch(null, undefined)).toBe(true);
    expect(fieldsMatch(null, 'a')).toBe(false);
  });

  it('numeric string vs number', () => {
    expect(fieldsMatch('42', 42)).toBe(true);
    expect(fieldsMatch('42.5', 42.5)).toBe(true);
    expect(fieldsMatch('42', 43)).toBe(false);
    expect(fieldsMatch('', 0)).toBe(false); // '' must not coerce to 0
  });

  it('timestamp rendering differences compare by epoch', () => {
    expect(fieldsMatch('2026-06-10T20:05:16+00:00', '2026-06-10 20:05:16+00')).toBe(true);
    expect(fieldsMatch('2026-06-10T20:05:16.523+00:00', '2026-06-10T20:05:17.523+00:00')).toBe(false);
  });

  it('jsonb objects compare canonically (key order irrelevant)', () => {
    expect(fieldsMatch({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(fieldsMatch({ a: 1 }, { a: 2 })).toBe(false);
    expect(fieldsMatch([1, 2], [2, 1])).toBe(false);
  });
});

describe('compareRestoredRows', () => {
  const columns = ['id', 'phase', 'duration_ms', 'created_at'];

  it('passes on faithful restore', () => {
    const originals = [
      { id: 'r1', phase: 'EXEC', duration_ms: 12, created_at: '2026-06-10T20:00:00+00:00' },
      { id: 'r2', phase: 'PLAN', duration_ms: null, created_at: '2026-06-10T21:00:00+00:00' },
    ];
    const restored = [
      { id: 'r2', phase: 'PLAN', duration_ms: null, created_at: '2026-06-10T21:00:00+00:00' },
      { id: 'r1', phase: 'EXEC', duration_ms: 12, created_at: '2026-06-10T20:00:00+00:00' },
    ];
    const r = compareRestoredRows({ originals, restored, columns });
    expect(r.rowsCompared).toBe(2);
    expect(r.mismatches).toEqual([]);
    expect(r.missingRestored).toEqual([]);
    expect(r.fieldChecks).toBe(8);
  });

  it('reports field mismatches with row id and field name', () => {
    const originals = [{ id: 'r1', phase: 'EXEC', duration_ms: 12, created_at: null }];
    const restored = [{ id: 'r1', phase: 'LEAD', duration_ms: 12, created_at: null }];
    const r = compareRestoredRows({ originals, restored, columns });
    expect(r.mismatches).toEqual([{ id: 'r1', field: 'phase', original: 'EXEC', restored: 'LEAD' }]);
  });

  it('reports missing restored rows', () => {
    const r = compareRestoredRows({ originals: [{ id: 'gone' }], restored: [], columns });
    expect(r.missingRestored).toEqual(['gone']);
    expect(r.rowsCompared).toBe(0);
  });

  it('classifies archived keys absent from the live shape as drift, not failure', () => {
    const originals = [{ id: 'r1', phase: 'EXEC', legacy_col: 'x' }];
    const restored = [{ id: 'r1', phase: 'EXEC' }];
    const r = compareRestoredRows({ originals, restored, columns });
    expect(r.mismatches).toEqual([]);
    expect(r.droppedKeys).toEqual(['legacy_col']);
  });
});

describe('md5ListsMatch', () => {
  it('order-insensitive identity', () => {
    const r = md5ListsMatch(['b', 'a'], ['a', 'b']);
    expect(r.match).toBe(true);
    expect(r.sourceCount).toBe(2);
  });
  it('detects divergence on either side', () => {
    const r = md5ListsMatch(['a', 'b'], ['a', 'c']);
    expect(r.match).toBe(false);
    expect(r.onlySource).toEqual(['b']);
    expect(r.onlyScratch).toEqual(['c']);
  });
  it('detects count drift with identical sets', () => {
    const r = md5ListsMatch(['a', 'a'], ['a']);
    expect(r.match).toBe(false);
  });
});

describe('buildReport', () => {
  const base = {
    scratchSchema: SCHEMA,
    startedAt: 't0',
    finishedAt: 't1',
    drillA: { status: 'PASS' },
    drillB: { status: 'PASS' },
    auditLog: [
      { label: 'a', kind: 'read', executed: true },
      { label: 'b', kind: 'scratch-write', executed: true },
    ],
    schemaDropped: true,
  };

  it('PASS only when both drills pass, no forbidden stmts, schema dropped', () => {
    expect(buildReport(base).overall).toBe('PASS');
  });

  it('FAIL when a drill fails', () => {
    expect(buildReport({ ...base, drillB: { status: 'FAIL' } }).overall).toBe('FAIL');
  });

  it('FAIL when a forbidden statement was attempted — even if drills passed', () => {
    const audit = [...base.auditLog, { label: 'evil', kind: 'forbidden', executed: false }];
    const r = buildReport({ ...base, auditLog: audit });
    expect(r.overall).toBe('FAIL');
    expect(r.statementAudit.forbidden).toBe(1);
  });

  it('FAIL when cleanup did not drop the scratch schema', () => {
    expect(buildReport({ ...base, schemaDropped: false }).overall).toBe('FAIL');
  });

  it('FAIL on fatal error and counts statement kinds', () => {
    const r = buildReport({ ...base, error: 'boom' });
    expect(r.overall).toBe('FAIL');
    expect(r.statementAudit).toMatchObject({ total: 2, reads: 1, scratchWrites: 1, forbidden: 0 });
  });
});
