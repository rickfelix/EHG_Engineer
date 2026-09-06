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

// SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C (FR-1) — the extractor used to match RAW text, so it reported
// example code as real schema references. TS-1 pins the fix; TS-2 is the two-sided contract required
// by lib/lint/added-line-text.mjs: a genuine occurrence MUST still fire after blanking, or the fix
// degrades into a blanket suppressor — the same blind-guard shape this workstream exists to abolish.
describe('extractReferences — comments and literal examples (QF/SD schema-truth C, FR-1)', () => {
  it('TS-1a: a .from() inside a line comment contributes no reference', () => {
    expect(extractReferences("// supabase.from('ghost_tbl')\n")).toEqual([]);
  });

  it('TS-1b: a .from() inside a block comment contributes no reference', () => {
    expect(extractReferences("/*\n * supabase.from('ghost_tbl').select('nope')\n */\n")).toEqual([]);
  });

  it('TS-1c: THE SELF-DEMONSTRATING CASE — the lint no longer matches its own documentation', () => {
    // Verbatim shape of scripts/hooks/lib/supabase-operative.cjs:17-18, the regex literals that
    // DOCUMENT this matcher. Pre-fix these produced two `missing table_name (from)` violations.
    const src = [
      'const PATTERNS = [',
      "  /\.from\(\s*['\"`](\w+)['\"`]\s*\)/,         // .from('table_name')",
      "  /supabase\.from\(\s*['\"`](\w+)['\"`]\s*\)/, // supabase.from('table_name')",
      '];',
    ].join('\n');
    expect(extractReferences(src).filter((r) => r.table === 'table_name')).toEqual([]);
  });

  it('TS-1d: a .from() example inside a template literal contributes no reference', () => {
    const src = 'const doc = `\n  const { data } = await supabase.from(\'ghost_tbl\').select(\'*\');\n`;\n';
    expect(extractReferences(src)).toEqual([]);
  });

  it('TS-2a: a REAL reference still fires — blanking is not a blanket suppressor', () => {
    const refs = extractReferences("const r = await supabase.from('ventures').select('id, name');");
    expect(refs.find((r) => r.type === 'table' && r.table === 'ventures')).toBeTruthy();
    expect(refs.some((r) => r.type === 'column' && r.column === 'name')).toBe(true);
  });

  it('TS-2b: a real reference on the same line as a trailing comment still fires', () => {
    const refs = extractReferences("await supabase.from('ventures').select('id'); // .from('ghost_tbl')");
    expect(refs.filter((r) => r.type === 'table').map((r) => r.table)).toEqual(['ventures']);
  });

  it('TS-2c: LINE NUMBERS ARE PRESERVED across a block comment — blanking must not shift offsets', () => {
    // The reason stripComments from added-line-text.mjs is NOT usable here: it collapses a block
    // comment to a single space, which would move this reference off line 6 and silently mis-report
    // the location of every violation after any block comment.
    const src = [
      'const a = 1;',        // 1
      '/*',                  // 2
      ' * filler',           // 3
      ' * filler',           // 4
      ' */',                 // 5
      "await supabase.from('ventures').select('id');", // 6
    ].join('\n');
    const t = extractReferences(src).find((r) => r.type === 'table');
    expect(t).toBeTruthy();
    expect(t.line).toBe(6);
  });

  it('TS-2d: a real reference AFTER a template-literal example still fires', () => {
    const src = 'const doc = `supabase.from(\'ghost_tbl\')`;\nawait supabase.from(\'ventures\').select(\'id\');';
    expect(extractReferences(src).filter((r) => r.type === 'table').map((r) => r.table)).toEqual(['ventures']);
  });

  it('TS-2e: the disable pragma still suppresses, and is read from the ORIGINAL text', () => {
    expect(extractReferences("await supabase.from('ghost_tbl'); // schema-lint-disable-line")).toEqual([]);
  });
});

// SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C (FR-4, TS-5) — THE PHANTOM CANARY.
//
// The requirement that distinguishes a wired check from a check-shaped object. FR-1 taught this
// extractor to ignore more things, and every such change carries the risk of ignoring the thing it
// exists to catch. These assertions are the standing proof that a deliberately-introduced phantom
// still fires; if they ever pass vacuously, the gate has been disarmed.
describe('phantom canary — the detector still fires (FR-4)', () => {
  it('TS-5a: a phantom TABLE reference is reported', () => {
    const v = findViolations(extractReferences("await supabase.from('seeded_phantom_table').select('id')"), SNAPSHOT);
    expect(v.map((x) => x.missing)).toContain('seeded_phantom_table');
  });

  it('TS-5b: a phantom COLUMN on an EXISTING table is reported', () => {
    const v = findViolations(extractReferences("await supabase.from('ventures').select('id, seeded_phantom_column')"), SNAPSHOT);
    expect(v.map((x) => x.missing)).toContain('ventures.seeded_phantom_column');
  });

  it('TS-5c: the canary is not satisfied by a real reference — a clean file reports nothing', () => {
    // Guards against the canary passing for the wrong reason (e.g. a comparator that flags
    // everything). Without this, TS-5a/b would still pass against a broken-open detector.
    expect(findViolations(extractReferences("await supabase.from('ventures').select('id, name')"), SNAPSHOT)).toEqual([]);
  });

  it('TS-5d: a phantom introduced INSIDE a comment is NOT reported — FR-1 and FR-4 do not fight', () => {
    expect(findViolations(extractReferences("// supabase.from('seeded_phantom_table')"), SNAPSHOT)).toEqual([]);
  });
});
