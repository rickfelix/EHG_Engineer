import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  classifyDisposition,
  summarizePerTable,
  FK_TABLES,
  TEXT_TABLES,
  ALL_TABLES,
  SCHEMA_VERSION,
  SD_UUID,
} from '../../scripts/audit-shared-tables-residue.cjs';

describe('audit-shared-tables-residue — module shape', () => {
  it('exports schema version 1.0', () => {
    expect(SCHEMA_VERSION).toBe('1.0');
  });

  it('exports correct SD_UUID', () => {
    expect(SD_UUID).toBe('f05587df-f924-4e7c-8e9f-8cba628af50e');
  });

  it('lists 4 FK-authoritative tables', () => {
    expect(FK_TABLES).toEqual([
      'eva_events',
      'eva_orchestration_events',
      'ventures',
      'eva_ventures',
    ]);
  });

  it('lists 2 text-search tables', () => {
    expect(TEXT_TABLES).toEqual(['feedback', 'client_error_events']);
  });

  it('combines into 6 ALL_TABLES', () => {
    expect(ALL_TABLES.length).toBe(6);
    for (const t of FK_TABLES) expect(ALL_TABLES).toContain(t);
    for (const t of TEXT_TABLES) expect(ALL_TABLES).toContain(t);
  });
});

describe('audit-shared-tables-residue — classifyDisposition', () => {
  it('feedback rows surface for review (RETAIN by default)', () => {
    const c = classifyDisposition('feedback', { id: 'x', title: 'PrivacyPatrol issue' });
    expect(c.disposition).toBe('retain');
    expect(c.surfaced_for_review).toBe(true);
    expect(c.reason).toMatch(/harness_backlog/);
  });

  it('client_error_events RETAIN by default and surfaced', () => {
    const c = classifyDisposition('client_error_events', { id: 'x' });
    expect(c.disposition).toBe('retain');
    expect(c.surfaced_for_review).toBe(true);
  });

  it('eva_events RETAIN (immutable lifecycle log)', () => {
    const c = classifyDisposition('eva_events', { id: 'x' });
    expect(c.disposition).toBe('retain');
    expect(c.surfaced_for_review).toBe(false);
    expect(c.reason).toMatch(/Immutable/);
  });

  it('eva_orchestration_events RETAIN', () => {
    const c = classifyDisposition('eva_orchestration_events', { id: 'x' });
    expect(c.disposition).toBe('retain');
    expect(c.surfaced_for_review).toBe(false);
  });

  it('ventures RETAIN (killed venture record)', () => {
    const c = classifyDisposition('ventures', { id: 'x', workflow_status: 'killed' });
    expect(c.disposition).toBe('retain');
    expect(c.reason).toMatch(/Killed venture/);
  });

  it('eva_ventures RETAIN', () => {
    const c = classifyDisposition('eva_ventures', { id: 'x' });
    expect(c.disposition).toBe('retain');
  });

  it('unknown table RETAIN (default)', () => {
    const c = classifyDisposition('some_other_table', { id: 'x' });
    expect(c.disposition).toBe('retain');
  });
});

describe('audit-shared-tables-residue — summarizePerTable', () => {
  it('counts retain/delete/rename correctly for empty rows', () => {
    const s = summarizePerTable('eva_events', []);
    expect(s.total_rows).toBe(0);
    expect(s.retain).toBe(0);
    expect(s.delete).toBe(0);
    expect(s.rename).toBe(0);
    expect(Array.isArray(s.warnings)).toBe(true);
  });

  it('counts retain for 21 eva_events rows (mirrors database-agent baseline)', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `e${i}` }));
    const s = summarizePerTable('eva_events', rows);
    expect(s.total_rows).toBe(21);
    expect(s.retain).toBe(21);
    expect(s.delete).toBe(0);
    expect(s.rename).toBe(0);
    expect(s.surfaced_for_review).toBe(0);
  });

  it('counts surfaced_for_review for feedback rows', () => {
    const rows = Array.from({ length: 18 }, (_, i) => ({ id: `f${i}` }));
    const s = summarizePerTable('feedback', rows);
    expect(s.total_rows).toBe(18);
    expect(s.retain).toBe(18);
    expect(s.surfaced_for_review).toBe(18);
  });

  it('emits eva_ventures lifecycle drift warning when rows present', () => {
    const s = summarizePerTable('eva_ventures', [{ id: 'x' }]);
    expect(s.warnings.length).toBeGreaterThan(0);
    expect(s.warnings[0]).toMatch(/lifecycle/);
  });

  it('omits warnings for empty eva_ventures', () => {
    const s = summarizePerTable('eva_ventures', []);
    expect(s.warnings.length).toBe(0);
  });
});

describe('audit-shared-tables-residue — STATIC GUARD: no destructive ops in script source', () => {
  // Read script source once; strip comments before applying regex (per validation-agent
  // recommendation #2: comments would false-positive on benign "// no INSERT into..." text).
  const scriptPath = join(
    process.cwd(),
    'scripts',
    'audit-shared-tables-residue.cjs'
  );
  const rawSource = readFileSync(scriptPath, 'utf8');

  // Strip line comments (// ... to end-of-line) and block comments (/* ... */).
  const stripped = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const TABLES_PATTERN =
    '(feedback|client_error_events|eva_events|eva_orchestration_events|ventures|eva_ventures)';

  // REGEX-A: raw SQL DELETE/UPDATE/INSERT against any of the 6 audit tables.
  // Matches: DELETE FROM <table>, INSERT INTO <table>, UPDATE <table> SET, ...
  const RAW_SQL_REGEX = new RegExp(
    `\\b(DELETE|UPDATE|INSERT)\\s+(?:INTO\\s+|FROM\\s+)?${TABLES_PATTERN}\\b`,
    'i'
  );

  // REGEX-B: Supabase chain method: .from('<table>').delete()|update()|insert()|upsert()
  const SUPABASE_CHAIN_REGEX = new RegExp(
    `\\.from\\(["']?${TABLES_PATTERN}["']?\\)\\s*\\.\\s*(delete|update|insert|upsert)\\b`,
    'i'
  );

  it('source contains NO raw-SQL DELETE/UPDATE/INSERT against the 6 audit tables', () => {
    const m = stripped.match(RAW_SQL_REGEX);
    if (m) {
      throw new Error(
        `Static guard A FAILED: matched destructive raw SQL near "${m[0]}" in audit script. Audit MUST be read-only.`
      );
    }
    expect(m).toBeNull();
  });

  it('source contains NO supabase-chain delete/update/insert/upsert against the 6 audit tables', () => {
    const m = stripped.match(SUPABASE_CHAIN_REGEX);
    if (m) {
      throw new Error(
        `Static guard B FAILED: matched destructive Supabase chain near "${m[0]}" in audit script. Audit MUST be read-only.`
      );
    }
    expect(m).toBeNull();
  });

  it('source DOES use .select() against the audit tables (sanity: confirms regex would catch real changes)', () => {
    // Confirm we're not matching a no-op file. select() should appear after .from('eva_events').
    expect(stripped).toMatch(/\.from\(['"]eva_events['"]\)\s*\n?\s*\.\s*select/);
  });

  it('regex correctly catches a synthetic violation in fixture string (smoke test for the test itself)', () => {
    // Smoke-test the regex by applying to a fabricated string. If the regex
    // is broken, this test fails before the real source-scan tests.
    const violation = 'await supabase.from("eva_events").delete().eq("id", "x");';
    expect(violation).toMatch(SUPABASE_CHAIN_REGEX);

    const violation2 = 'DELETE FROM ventures WHERE id = $1;';
    expect(violation2).toMatch(RAW_SQL_REGEX);

    // Negative control: select should NOT match destructive regex.
    const benign = 'await supabase.from("eva_events").select("*");';
    expect(benign).not.toMatch(SUPABASE_CHAIN_REGEX);
  });
});
