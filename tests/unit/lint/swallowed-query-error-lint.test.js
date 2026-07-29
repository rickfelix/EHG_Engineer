/**
 * SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-4 / TS-9, TS-10 — the lint's own tests.
 *
 * The extractor is pure, so these run against string fixtures rather than the filesystem.
 * NOTE the fixtures below deliberately contain the buggy shape; that is why this file is
 * excluded from the scan (tests/ is skipped by scanTree).
 */
import { describe, it, expect } from 'vitest';
import { extractSwallowedQueries, loadAllowlist, stripComments } from '../../../scripts/lint/swallowed-query-error-lint.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('TS-9: the extractor flags a data-only PostgREST destructure', () => {
  it('flags the defect shape', () => {
    const hits = extractSwallowedQueries(`
      const { data } = await supabase.from('x').select('y').limit(1);
    `, 'f.js');
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('data');
  });

  it('flags a renamed binding too — the name is not the point', () => {
    const hits = extractSwallowedQueries(`
      const { data: rows } = await supabase.from('x').select('y');
    `, 'f.js');
    expect(hits).toHaveLength(1);
  });

  it('flags the count-only shape (the sub-shape with no error to discard)', () => {
    const hits = extractSwallowedQueries(`
      const { count } = await supabase.from('x').select('*', { count: 'exact', head: true });
    `, 'f.js');
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('count');
  });

  // The controls. Without these the extractor could flag everything and still pass above.
  it('does NOT flag a destructure that binds error', () => {
    expect(extractSwallowedQueries(`
      const { data, error } = await supabase.from('x').select('y');
    `, 'f.js')).toEqual([]);
    expect(extractSwallowedQueries(`
      const { data: rows, error: rowsErr } = await supabase.from('x').select('y');
    `, 'f.js')).toEqual([]);
  });

  it('does NOT flag a non-PostgREST await — axios, helpers, anything else', () => {
    expect(extractSwallowedQueries(`
      const { data } = await axios.get('https://example.test');
    `, 'f.js')).toEqual([]);
    expect(extractSwallowedQueries(`
      const { data } = await resolveOwnSession(supabase, {});
    `, 'f.js')).toEqual([]);
  });

  it('does NOT flag a call already routed through a throwing wrapper', () => {
    expect(extractSwallowedQueries(`
      const rows = await safeQuery(supabase.from('x').select('y'), { site: 's' });
    `, 'f.js')).toEqual([]);
    expect(extractSwallowedQueries(`
      const { data } = await safeQuery(supabase.from('x').select('y'), { site: 's' });
    `, 'f.js')).toEqual([]);
  });

  it('does NOT flag a commented-out query, and keeps line numbers accurate', () => {
    const src = [
      '// const { data } = await supabase.from("x").select("y");',
      'const noop = 1;',
      'const { data } = await supabase.from("x").select("y");',
    ].join('\n');
    const hits = extractSwallowedQueries(src, 'f.js');
    expect(hits).toHaveLength(1);
    // Line 3, not 1 — stripComments must preserve line count or allowlist keys drift.
    expect(hits[0].line).toBe(3);
  });

  it('stripComments preserves line count for block comments', () => {
    expect(stripComments('a\n/* x\ny */\nb').split('\n')).toHaveLength(4);
  });
});

describe('TS-10: an allowlist entry without a reason is refused', () => {
  const write = obj => {
    const p = join(mkdtempSync(join(tmpdir(), 'swq-')), 'allow.json');
    writeFileSync(p, JSON.stringify(obj));
    return p;
  };

  it('THROWS on an empty reason — a silence you cannot explain is the reflexive kind', () => {
    expect(() => loadAllowlist(write({ allow: { 'a.js:1': '' } }))).toThrow(/has no reason/);
    expect(() => loadAllowlist(write({ allow: { 'a.js:1': '   ' } }))).toThrow(/has no reason/);
    expect(() => loadAllowlist(write({ allow: { 'a.js:1': true } }))).toThrow(/has no reason/);
  });

  it('accepts an entry that states why', () => {
    const allow = loadAllowlist(write({ allow: { 'a.js:1': 'best-effort telemetry; absence expected' } }));
    expect(allow['a.js:1']).toMatch(/best-effort/);
  });

  it('treats a missing allowlist file as empty rather than crashing the lint', () => {
    expect(loadAllowlist('/nonexistent/path/allow.json')).toEqual({});
  });
});

describe('the advisory-first claim is TESTED, not just asserted (TESTING 4118666a gap)', () => {
  // "Advisory-first" is a SAFETY PROPERTY -- it is what stops this lint turning every in-flight
  // PR red on day one over a 232-site pre-existing baseline. It had zero automated coverage and
  // rested on one manual run, which is precisely the shape of claim this SD exists to distrust.
  const LINT = new URL('../../../scripts/lint/swallowed-query-error-lint.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

  it('exits 0 by default even though the baseline is non-empty', () => {
    const r = spawnSync(process.execPath, [LINT], { encoding: 'utf8' });
    expect(r.stdout).toMatch(/ungoverned/);
    // The load-bearing assertion: findings exist AND the exit code is still 0.
    expect(r.stdout).not.toMatch(/0 ungoverned/);
    expect(r.status).toBe(0);
  });

  it('exits 1 under --enforce, so the escalation path genuinely works', () => {
    const r = spawnSync(process.execPath, [LINT, '--enforce'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('caps its output by default and shows everything under --list', () => {
    // A 200-line wall every run is the kind of output people learn to scroll past.
    const capped = spawnSync(process.execPath, [LINT], { encoding: 'utf8' }).stdout;
    const listed = spawnSync(process.execPath, [LINT, '--list'], { encoding: 'utf8' }).stdout;
    expect(capped).toMatch(/and \d+ more \(--list to show all\)/);
    expect(listed.split('\n').length).toBeGreaterThan(capped.split('\n').length);
  });
});
