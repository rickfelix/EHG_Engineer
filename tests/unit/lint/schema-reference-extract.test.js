/**
 * SD-LEO-INFRA-SCHEMA-REFERENCE-LINT-001 (FR-5) — hermetic tests for the pure
 * schema-reference extractor + comparator. No fs/DB/network: fixture strings
 * drive extractReferences; a mock snapshot object drives findViolations.
 */
import { describe, it, expect } from 'vitest';
import { extractReferences, findViolations } from '../../../scripts/lint/schema-reference-extract.mjs';

const SNAPSHOT = {
  tables: {
    ventures: ['id', 'name', 'current_lifecycle_stage', 'company_id'],
    companies: ['id', 'name'],
    feedback: ['id', 'title', 'status', 'metadata'],
  },
  views: {
    v_okr_scorecard: ['objective_id', 'progress_pct'],
  },
};

describe('extractReferences — .from() tables', () => {
  it('extracts table refs with line numbers', () => {
    const text = 'const a = 1;\nawait supabase.from(\'ventures\').select(\'*\');\n';
    const refs = extractReferences(text, 'lib/x.js');
    const t = refs.find(r => r.type === 'table');
    expect(t).toMatchObject({ table: 'ventures', line: 2, kind: 'from', file: 'lib/x.js' });
  });

  it('skips lines carrying the disable pragma', () => {
    const text = 'await supabase.from(\'dynamic_thing\').select(\'*\'); // schema-lint-disable-line\n';
    expect(extractReferences(text).filter(r => r.kind === 'from')).toHaveLength(0);
  });
});

describe('extractReferences — select literals', () => {
  it('parses plain columns, aliases, json operators', () => {
    const text = 'supabase.from(\'ventures\').select(\'id, display:name, metadata->>kind\')';
    const cols = extractReferences(text).filter(r => r.type === 'column').map(r => r.column);
    // alias display:name -> name; metadata->>kind -> metadata (json op root)
    expect(cols).toEqual(expect.arrayContaining(['id', 'name', 'metadata']));
    expect(cols).not.toContain('display');
    expect(cols).not.toContain('kind');
  });

  it('marks embedded relations rel(cols) as embedded, not columns', () => {
    const text = 'supabase.from(\'ventures\').select(\'id, companies(name)\')';
    const refs = extractReferences(text).filter(r => r.type === 'column');
    const embedded = refs.find(r => r.column === 'companies');
    expect(embedded?.embedded).toBe(true);
  });

  it('skips * selects entirely', () => {
    const text = 'supabase.from(\'ventures\').select(\'*\')';
    expect(extractReferences(text).filter(r => r.type === 'column')).toHaveLength(0);
  });
});

describe('extractReferences — insert/update/upsert keys', () => {
  it('extracts top-level keys only (nested flattened away)', () => {
    const text = 'supabase.from(\'feedback\').insert({ title: \'x\', metadata: { deep: 1 }, status: \'new\' })';
    const cols = extractReferences(text).filter(r => r.type === 'column').map(r => r.column);
    expect(cols).toEqual(expect.arrayContaining(['title', 'metadata', 'status']));
    expect(cols).not.toContain('deep');
  });

  it('does NOT report option-object keys (onConflict in second arg)', () => {
    const text = 'supabase.from(\'feedback\').upsert({ title: \'t\' }, { onConflict: \'id\', ignoreDuplicates: true })';
    const cols = extractReferences(text).filter(r => r.type === 'column').map(r => r.column);
    expect(cols).toContain('title');
    expect(cols).not.toContain('onConflict');
    expect(cols).not.toContain('ignoreDuplicates');
  });
});

describe('extractReferences — raw SQL', () => {
  it('extracts FROM/INSERT INTO/UPDATE table refs and skips keywords/pg_*', () => {
    const text = 'const q = `SELECT * FROM ventures JOIN pg_class ON true`; const r = `INSERT INTO feedback (id) VALUES (1)`;';
    const tabs = extractReferences(text).filter(r => r.kind === 'sql').map(r => r.table);
    expect(tabs).toEqual(expect.arrayContaining(['ventures', 'feedback']));
    expect(tabs).not.toContain('pg_class');
  });
});

describe('extractReferences — cross-chain isolation', () => {
  it('does not attribute the next chain\'s insert/select to the previous table', () => {
    const text = [
      "await supabase.from('ventures').select('id');",
      "await supabase.from('feedback').upsert({ phantom_field_abc: 1 });",
    ].join('\n');
    const refs = extractReferences(text);
    const venturesCols = refs.filter(r => r.type === 'column' && r.table === 'ventures');
    expect(venturesCols.map(r => r.column)).not.toContain('phantom_field_abc');
    const feedbackCols = refs.filter(r => r.type === 'column' && r.table === 'feedback');
    expect(feedbackCols.map(r => r.column)).toContain('phantom_field_abc');
  });
});

describe('findViolations — comparator', () => {
  it('flags a from() ref to a missing table with file:line metadata', () => {
    const refs = extractReferences('supabase.from(\'nonexistent_xyz\').select(\'id\')', 'lib/y.js');
    const v = findViolations(refs, SNAPSHOT);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ missing: 'nonexistent_xyz', kind: 'from', file: 'lib/y.js' });
  });

  it('flags a phantom column on a live table (the ventures.stage class)', () => {
    const refs = extractReferences('supabase.from(\'ventures\').select(\'id, stage\')');
    const v = findViolations(refs, SNAPSHOT);
    expect(v.map(x => x.missing)).toContain('ventures.stage');
  });

  it('passes valid refs, views included', () => {
    const refs = extractReferences(
      'supabase.from(\'v_okr_scorecard\').select(\'objective_id, progress_pct\')'
    );
    expect(findViolations(refs, SNAPSHOT)).toHaveLength(0);
  });

  it('does not flag embedded relation names that are live relations', () => {
    const refs = extractReferences('supabase.from(\'ventures\').select(\'id, companies(name)\')');
    expect(findViolations(refs, SNAPSHOT)).toHaveLength(0);
  });

  it('does not block raw-SQL table misses (advisory contract: from() is the blocking surface)', () => {
    const refs = extractReferences('const q = `SELECT * FROM not_a_table_here`;');
    expect(findViolations(refs, SNAPSHOT)).toHaveLength(0);
  });

  it('insert keys against a missing table only flag the table, not the columns', () => {
    const refs = extractReferences('supabase.from(\'ghost_tbl\').insert({ a: 1, b: 2 })');
    const v = findViolations(refs, SNAPSHOT);
    expect(v).toHaveLength(1);
    expect(v[0].missing).toBe('ghost_tbl');
  });
});
