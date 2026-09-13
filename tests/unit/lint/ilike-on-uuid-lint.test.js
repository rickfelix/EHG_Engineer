/**
 * QF-20260829-440 — two-sided acceptance for the ilike/like-on-uuid lint.
 * (a) alone would pass a lint that fires on everything; (b) alone would pass today's no-op.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findIlikeOnUuid, parseAddedLineRanges } from '../../../scripts/lint/ilike-on-uuid-lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '../../../scripts/lint/ilike-on-uuid-lint.mjs');

const UUID_COLUMNS = new Set(['id', 'session_id', 'sd_id']);

describe('findIlikeOnUuid', () => {
  it('(a) FIRES on .ilike(uuid-column, ...)', () => {
    const src = "await supabase.from('t').select('*').ilike('id', 'abc%');";
    const findings = findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js');
    expect(findings).toHaveLength(1);
    expect(findings[0].column).toBe('id');
  });

  it('(a) FIRES on .like(uuid-column, ...) too', () => {
    const src = "await supabase.from('t').select('*').like('session_id', 'abc%');";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(1);
  });

  it('(b) PASSES a legitimate .ilike(text-column, ...)', () => {
    const src = "await supabase.from('t').select('*').ilike('title', 'abc%');";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(0);
  });

  it('zero-subjects-collected is treated as a real result, not a silent skip — an empty uuid-column set finds nothing even on an obvious uuid literal', () => {
    const src = "await supabase.from('t').select('*').ilike('id', 'abc%');";
    expect(findIlikeOnUuid(src, new Set(), 'fixture.js')).toHaveLength(0);
  });

  it('a comment mentioning .ilike("id", ...) as an example is not a live defect', () => {
    const src = "// e.g. never write .ilike('id', 'x') here\nawait supabase.from('t').select('*').ilike('title', 'x');";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(0);
  });

  it('escape hatch: a trailing ilike-uuid-lint-disable-line comment suppresses the finding', () => {
    const src = "await supabase.from('t').select('*').ilike('id', 'x'); // ilike-uuid-lint-disable-line: this table's 'id' is a slug, not the uuid PK";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(0);
  });

  it('reports the correct line number for a finding past line 1', () => {
    const src = "const x = 1;\nconst y = 2;\nawait supabase.from('t').ilike('sd_id', 'x');";
    const findings = findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js');
    expect(findings[0].line).toBe(3);
  });
});

// QF-20260912-056 — parseAddedLineRanges is the new hunk-scoping logic: it must read ONLY the
// `+c[,d]` (new-file) side of each hunk header, never `-a[,b]` (old-file numbering).
describe('parseAddedLineRanges', () => {
  it('derives a single added-line range from a pure-addition hunk (no removed lines)', () => {
    const diff = [
      'diff --git a/scripts/foo.js b/scripts/foo.js',
      '--- a/scripts/foo.js',
      '+++ b/scripts/foo.js',
      '@@ -19,0 +20,3 @@',
      '+line20',
      '+line21',
      '+line22',
    ].join('\n');
    const ranges = parseAddedLineRanges(diff);
    expect(ranges.get('scripts/foo.js')).toEqual([[20, 22]]);
  });

  it('a hunk with no comma on the +side means exactly one added line', () => {
    const diff = ['+++ b/scripts/foo.js', '@@ -4,1 +4 @@'].join('\n');
    expect(parseAddedLineRanges(diff).get('scripts/foo.js')).toEqual([[4, 4]]);
  });

  it('a hunk with +c,0 (pure deletion at that point) contributes no range', () => {
    const diff = ['+++ b/scripts/foo.js', '@@ -10,3 +9,0 @@'].join('\n');
    expect(parseAddedLineRanges(diff).get('scripts/foo.js')).toEqual([]);
  });

  it('a deleted file (+++ /dev/null) gets no entry at all', () => {
    const diff = ['--- a/scripts/gone.js', '+++ /dev/null', '@@ -1,3 +0,0 @@'].join('\n');
    expect(parseAddedLineRanges(diff).has('scripts/gone.js')).toBe(false);
  });

  it('multiple hunks in the same file each contribute their own range', () => {
    const diff = [
      '+++ b/scripts/foo.js',
      '@@ -4,0 +5,1 @@',
      '+one',
      '@@ -19,0 +20,3 @@',
      '+two',
      '+three',
      '+four',
    ].join('\n');
    expect(parseAddedLineRanges(diff).get('scripts/foo.js')).toEqual([[5, 5], [20, 22]]);
  });

  it('multi-file diffs keep each file\'s ranges separate', () => {
    const diff = [
      '+++ b/scripts/a.js',
      '@@ -1,0 +2,1 @@',
      '+x',
      '+++ b/scripts/b.js',
      '@@ -1,0 +9,1 @@',
      '+y',
    ].join('\n');
    const ranges = parseAddedLineRanges(diff);
    expect(ranges.get('scripts/a.js')).toEqual([[2, 2]]);
    expect(ranges.get('scripts/b.js')).toEqual([[9, 9]]);
  });
});

// QF-20260912-056 (gate-bug 96df56ea, PR #8818) — real-git-repo acceptance, matching the QF's
// own FIX SHAPE (c): a pre-existing offender at line 5 plus a PR hunk elsewhere in the same
// file must NOT fire in --diff mode (it fires in a full sweep); a hunk that itself ADDS an
// offender must fire.
describe('CLI --diff mode: hunk-scoped, not file-scoped (real git repo)', () => {
  function makeScratchRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilike-uuid-diff-scope-'));
    fs.mkdirSync(path.join(dir, 'database'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'database', 'uuid-columns-census.json'), JSON.stringify({ columns: ['id'] }));
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true }); // walk('lib', ...) requires this dir to exist
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    return dir;
  }
  function run(dir) {
    return spawnSync('node', [SCRIPT, '--diff'], { encoding: 'utf8', cwd: dir, env: { ...process.env, ILIKE_UUID_LINT_BASE: 'main' } });
  }

  it('a PR hunk elsewhere in the file does NOT re-flag a pre-existing offender (--diff: 0 findings; full sweep: 1)', () => {
    const dir = makeScratchRepo();
    try {
      // Base: 19 lines, offender at line 5.
      const baseLines = Array.from({ length: 19 }, (_, i) => `// filler ${i + 1}`);
      baseLines[4] = "await supabase.from('t').ilike('id', 'x');"; // line 5, 1-indexed
      fs.writeFileSync(path.join(dir, 'scripts', 'touched.js'), baseLines.join('\n') + '\n');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });

      // Diverge onto a feature branch -- staying ON main would diff main against its own tip
      // (always empty), matching the eva-logger-required-lint TS-3 precedent.
      execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir });

      // Feature: append 3 harmless lines (20-22) -- a PR hunk that never reaches line 5.
      const featureLines = [...baseLines, '// added 20', '// added 21', '// added 22'];
      fs.writeFileSync(path.join(dir, 'scripts', 'touched.js'), featureLines.join('\n') + '\n');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'append harmless lines'], { cwd: dir });

      const diffResult = run(dir);
      expect(diffResult.status).toBe(0);
      expect(diffResult.stderr).not.toContain('ilike/like-on-uuid finding');

      const fullResult = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: dir });
      expect(fullResult.status).toBe(1);
      expect(fullResult.stderr).toContain('touched.js:5');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a hunk that ADDS a new offender DOES fire in --diff mode', () => {
    const dir = makeScratchRepo();
    try {
      fs.writeFileSync(path.join(dir, 'scripts', 'touched.js'), '// filler 1\n// filler 2\n');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });

      execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'scripts', 'touched.js'), "// filler 1\n// filler 2\nawait supabase.from('t').ilike('id', 'y');\n");
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'introduce a real offender'], { cwd: dir });

      const diffResult = run(dir);
      expect(diffResult.status).toBe(1);
      expect(diffResult.stderr).toContain('touched.js:3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
