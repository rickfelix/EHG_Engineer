/**
 * SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-4 / TS-9, TS-10 — the lint's own tests.
 *
 * The extractor is pure, so these run against string fixtures rather than the filesystem.
 * NOTE the fixtures below deliberately contain the buggy shape; that is why this file is
 * excluded from the scan (tests/ is skipped by scanTree).
 */
import { describe, it, expect } from 'vitest';
import { extractSwallowedQueries, loadAllowlist, stripComments, SCAN_PREFIXES } from '../../../scripts/lint/swallowed-query-error-lint.mjs';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
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
  // PR red on day one over a pre-existing baseline. It had zero automated coverage and rested on
  // one manual run, which is precisely the shape of claim this SD exists to distrust.
  //
  // SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-5: rewritten against a FIXTURE tree, not the live
  // repo tree. The live count reaching 0 (this SD's own FR-4 conversion work) would otherwise
  // invert "exits 0 by default even though the baseline is non-empty" (there is no non-empty
  // baseline left to observe) and starve "caps its output... shows everything under --list" (0
  // findings never trips the >15 cap). SWALLOWED_QUERY_LINT_ROOT lets the SAME CLI binary --
  // real spawnSync, real exit codes, real --enforce/--list flags -- scan a disposable temp
  // directory instead, so these tests exercise actual CLI wiring, not a re-implementation of the
  // extractor logic already covered by the TS-9 suite above.
  const LINT = new URL('../../../scripts/lint/swallowed-query-error-lint.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

  /** A fixture tree with N distinct ungoverned data-only PostgREST destructures, one per line. */
  function makeFixtureRoot(ungovernedCount) {
    const root = mkdtempSync(join(tmpdir(), 'swq-fixture-'));
    mkdirSync(join(root, 'scripts', 'lint'), { recursive: true });
    const lines = [];
    for (let i = 0; i < ungovernedCount; i++) {
      lines.push(`const { data: row${i} } = await supabase.from('t${i}').select('x').limit(1);`);
    }
    writeFileSync(join(root, 'fixture.js'), lines.join('\n') + '\n');
    // No allowlist file written -- loadAllowlist() treats a missing file as {} (already covered
    // by TS-10 above), so every generated line surfaces as ungoverned.
    return root;
  }

  function runLint(root, args = []) {
    return spawnSync(process.execPath, [LINT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, SWALLOWED_QUERY_LINT_ROOT: root },
    });
  }

  it('exits 0 by default even though the fixture baseline is non-empty', () => {
    const root = makeFixtureRoot(3);
    const r = runLint(root);
    expect(r.stdout).toMatch(/ungoverned/);
    // The load-bearing assertion: findings exist AND the exit code is still 0.
    // \b anchors to a standalone "0", which only the genuine all-clear message produces --
    // never a coincidental substring match on a larger total (e.g. "30 ungoverned").
    expect(r.stdout).not.toMatch(/\b0 ungoverned\b/);
    expect(r.status).toBe(0);
  });

  it('reports 0 ungoverned and exits 0 when the fixture tree is clean', () => {
    const root = makeFixtureRoot(0);
    const r = runLint(root);
    expect(r.stdout).toMatch(/\b0 ungoverned\b/);
    expect(r.status).toBe(0);
  });

  it('exits 1 under --enforce, so the escalation path genuinely works', () => {
    const root = makeFixtureRoot(3);
    const r = runLint(root, ['--enforce']);
    expect(r.status).toBe(1);
  });

  it('does NOT exit 1 under --enforce when the fixture tree is clean', () => {
    const root = makeFixtureRoot(0);
    const r = runLint(root, ['--enforce']);
    expect(r.status).toBe(0);
  });

  it('caps its output by default and shows everything under --list', () => {
    // A 200-line wall every run is the kind of output people learn to scroll past. 20 findings
    // trips the 15-item default cap deterministically, regardless of the live tree's own count.
    const root = makeFixtureRoot(20);
    const capped = runLint(root).stdout;
    const listed = runLint(root, ['--list']).stdout;
    expect(capped).toMatch(/and \d+ more \(--list to show all\)/);
    expect(listed.split('\n').length).toBeGreaterThan(capped.split('\n').length);
  });

  // FR-5 AC: assert the exact live SCAN_PREFIXES array so a future widening cannot land without
  // this test also changing -- a comment claiming the scope is in sync is not verification.
  // Imported directly (not spawned), so this reads the array WITHOUT
  // SWALLOWED_QUERY_LINT_ROOT set, i.e. the real scope, not a fixture override. FR-7 widened
  // this from 5 to 6 directories in the same SD; this test caught that widening the moment it
  // landed (it failed here first, then was updated), which is exactly the contract it exists for.
  it('SCAN_PREFIXES is exactly the 6 real gate/executor directories (fails loud on drift)', () => {
    expect(SCAN_PREFIXES).toEqual([
      'scripts/modules/handoff',
      'lib/gates',
      'scripts/modules/claim-health',
      'lib/claim',
      'lib/oversight',
      'scripts/modules/implementation-fidelity',
    ]);
  });
});
