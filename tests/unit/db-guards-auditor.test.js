/**
 * SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 — auditor coverage for the runtime-aware
 * DB-test guard signal (FR-1), the ratchet baseline (FR-2), and the MISROUTED
 * describeDb check (FR-4). Pure-function tests against inline fixtures — no
 * filesystem, no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeSource,
  classifyTestSource,
  isUnguardedDbTest,
  isMisroutedDbSuite,
  collectImportSpecifiers,
  computeRatchet,
  updateBaseline,
} from '../../scripts/audit-db-test-guards.mjs';

// ---------------------------------------------------------------------------
// TS-1 — runtime-aware signal
// ---------------------------------------------------------------------------
describe('TS-1: runtime-aware DB signal (FR-1)', () => {
  it('does NOT flag a file whose supabase client is vi.mock-ed', () => {
    const src = [
      "import { createClient } from '@supabase/supabase-js';",
      "vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));",
      "describe('s', () => { it('t', () => {}); });",
    ].join('\n');
    expect(classifyTestSource(src)).toBe('GUARDED');
    expect(isUnguardedDbTest(src)).toBe(false);
  });

  it('does NOT flag a file that vi.doMock-s a supabase client helper module', () => {
    const src = [
      "import { createSupabaseServiceClient } from '../../lib/supabase-client.js';",
      "vi.doMock('../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: vi.fn() }));",
    ].join('\n');
    expect(isUnguardedDbTest(src)).toBe(false);
  });

  it('does NOT flag a file whose only DB signal lives in comments', () => {
    const src = [
      '// createSupabaseServiceClient is intentionally NOT used here',
      '/* the table is read via SUPABASE_URL in production, see lib/x.js */',
      "describe('pure', () => { it('adds', () => expect(1 + 1).toBe(2)); });",
    ].join('\n');
    expect(classifyTestSource(src)).toBe('CLEAN');
  });

  it('does NOT flag a file whose only DB signal is inside an assertion string', () => {
    const src = [
      "import { redact } from '../../lib/redactor.js';",
      "it('redacts the key', () => {",
      "  expect(redact('SUPABASE_SERVICE_ROLE_KEY=abc')).not.toContain('SUPABASE_SERVICE_ROLE_KEY=');",
      '});',
    ].join('\n');
    expect(classifyTestSource(src)).toBe('CLEAN');
  });

  it('does NOT flag DB signals inside multi-line template-literal fixtures', () => {
    const src = [
      'const fixture = `',
      "  import { createClient } from '@supabase/supabase-js';",
      '  const c = createSupabaseServiceClient();',
      '`;',
      "it('scans the fixture', () => expect(fixture).toBeTruthy());",
    ].join('\n');
    expect(classifyTestSource(src)).toBe('CLEAN');
  });

  it('DOES flag an unguarded real client-factory import', () => {
    const src = [
      "import { createClient } from '@supabase/supabase-js';",
      'const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);',
      "describe('queries', () => { it('reads', async () => { await supabase.from('t').select(); }); });",
    ].join('\n');
    expect(classifyTestSource(src)).toBe('UNGUARDED');
    expect(isUnguardedDbTest(src)).toBe(true);
  });

  it('DOES flag an unguarded supabase-client helper import (no mock)', () => {
    const src = [
      "import { createSupabaseServiceClient } from '../../lib/supabase-client.js';",
      'const supabase = createSupabaseServiceClient();',
    ].join('\n');
    expect(isUnguardedDbTest(src)).toBe(true);
  });

  it('still treats an inline HAS_REAL_DB skipIf as guarded', () => {
    const src = [
      "import { createClient } from '@supabase/supabase-js';",
      'const HAS_REAL_DB = !!process.env.SUPABASE_URL;',
      "describe.skipIf(!HAS_REAL_DB)('queries', () => {});",
    ].join('\n');
    expect(classifyTestSource(src)).toBe('GUARDED');
  });

  it('a guard that only appears in a comment does NOT count', () => {
    const src = [
      '// wrapped in describeDb would be wrong here, HAS_REAL_DB not needed',
      "import { createClient } from '@supabase/supabase-js';",
      'const c = createClient(process.env.SUPABASE_URL, "k");',
    ].join('\n');
    expect(classifyTestSource(src)).toBe('UNGUARDED');
  });

  it('analyzeSource strips comments but keeps strings (and blanks string contents in codeNoStrings)', () => {
    const { code, codeNoStrings } = analyzeSource(
      "// SUPABASE_URL\nconst u = 'SUPABASE_URL'; /* SUPABASE_URL */ const v = process.env.SUPABASE_URL;"
    );
    expect(code).not.toMatch(/\/\/|\/\*/);
    expect(code).toContain("'SUPABASE_URL'");
    expect(codeNoStrings).not.toContain("'SUPABASE_URL'");
    expect(codeNoStrings).toContain('process.env.SUPABASE_URL');
  });

  it('collectImportSpecifiers sees static, dynamic and require specifiers', () => {
    const specs = collectImportSpecifiers(
      "import a from 'mod-a';\nconst b = require('mod-b');\nawait import('mod-c');\nimport 'side-effect';"
    );
    expect(specs).toEqual(expect.arrayContaining(['mod-a', 'mod-b', 'mod-c', 'side-effect']));
  });
});

// ---------------------------------------------------------------------------
// TS-4 — MISROUTED describeDb suites (FR-4)
// ---------------------------------------------------------------------------
describe('TS-4: MISROUTED describeDb suites (FR-4)', () => {
  it('flags a describeDb-wrapped suite in a unit-project path as MISROUTED', () => {
    const src = [
      "import { describeDb } from '../helpers/db-available.js';",
      "describeDb('live venture queries', () => { it('reads', () => {}); });",
    ].join('\n');
    expect(classifyTestSource(src)).toBe('MISROUTED');
    expect(isMisroutedDbSuite(src)).toBe(true);
    expect(isUnguardedDbTest(src)).toBe(false); // distinct category, distinct message
  });

  it('flags itDb usage as MISROUTED too', () => {
    const src = [
      "import { itDb } from '../helpers/db-available.js';",
      "describe('s', () => { itDb('live read', async () => {}); });",
    ].join('\n');
    expect(isMisroutedDbSuite(src)).toBe(true);
  });

  it('does NOT misroute a file that merely imports/typeofs describeDb (meta tests)', () => {
    const src = [
      "import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';",
      "it('exports wrappers', () => { expect(typeof describeDb).toBe('function'); });",
    ].join('\n');
    expect(isMisroutedDbSuite(src)).toBe(false);
  });

  it('does NOT misroute describeDb mentions inside strings or comments', () => {
    const src = [
      '// describeDb(\'x\', ...) would be wrong here',
      'const fixture = `describeDb(\'queries\', () => {})`;',
      "it('f', () => expect(fixture).toBeTruthy());",
    ].join('\n');
    expect(isMisroutedDbSuite(src)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TS-2 — ratchet baseline semantics (FR-2)
// ---------------------------------------------------------------------------
describe('TS-2: ratchet baseline semantics (FR-2)', () => {
  const baseline = ['tests/a.test.js', 'tests/b.test.js'];

  it('flagged ⊆ baseline → zero new (clean run)', () => {
    const r = computeRatchet(['tests/a.test.js'], baseline);
    expect(r.newFlagged).toEqual([]);
    expect(r.tolerated).toEqual(['tests/a.test.js']);
    expect(r.removed).toEqual(['tests/b.test.js']);
  });

  it('new files outside the baseline are reported — and ONLY the new ones', () => {
    const r = computeRatchet(['tests/a.test.js', 'tests/z-new.test.js'], baseline);
    expect(r.newFlagged).toEqual(['tests/z-new.test.js']);
    expect(r.tolerated).toEqual(['tests/a.test.js']);
  });

  it('updateBaseline shrinks freely', () => {
    const r = updateBaseline(['tests/a.test.js'], baseline);
    expect(r.ok).toBe(true);
    expect(r.grew).toBe(false);
    expect(r.next).toEqual(['tests/a.test.js']);
  });

  it('updateBaseline refuses to grow without forceGrow', () => {
    const r = updateBaseline([...baseline, 'tests/c.test.js'], baseline);
    expect(r.ok).toBe(false);
    expect(r.grew).toBe(true);
  });

  it('updateBaseline grows only with forceGrow=true', () => {
    const r = updateBaseline([...baseline, 'tests/c.test.js'], baseline, true);
    expect(r.ok).toBe(true);
    expect(r.next).toEqual(['tests/a.test.js', 'tests/b.test.js', 'tests/c.test.js']);
  });

  it('updateBaseline output is sorted and de-duplicated', () => {
    const r = updateBaseline(['tests/b.test.js', 'tests/a.test.js', 'tests/a.test.js'], baseline);
    expect(r.next).toEqual(['tests/a.test.js', 'tests/b.test.js']);
  });
});
