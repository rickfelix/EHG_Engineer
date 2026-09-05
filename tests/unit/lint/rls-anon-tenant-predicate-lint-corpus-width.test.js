/**
 * SD-LEO-FIX-RLS-LINT-CORPUS-WIDTH-001.
 *
 * The RLS anon/authenticated tenant-predicate lint previously scanned ONLY
 * database/migrations/, while the actual DDL-auto-apply writer of record
 * (scripts/modules/handoff/pre-checks/pending-migrations-check.js) applies
 * migrations from three directories: database/migrations, database/manual-updates,
 * and supabase/migrations. A non-compliant policy written to either of the other
 * two was auto-applied without ever being linted, in either advisory or blocking
 * form.
 *
 * These tests are a red-then-green proof, not a directory-list diff review:
 * each fixture violation lives in a directory the PRE-FIX corpus (hardcoded to
 * database/migrations/ alone) would never have reached, and each test asserts
 * both that the post-fix corpus catches it AND that the pre-fix corpus (recreated
 * inline, not imported, so the assertion can't accidentally exercise the fix
 * twice) would have missed it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { execSync } from 'node:child_process';
import {
  candidateFilesDiff,
  candidateFilesAll,
  lintSql,
} from '../../../scripts/lint/rls-anon-tenant-predicate-lint.mjs';
import { RLS_LINT_CORPUS_DIRS } from '../../../lib/lint/rls-lint-corpus-dirs.mjs';

const VIOLATION_SQL = 'CREATE POLICY leaky ON public.foo FOR SELECT TO anon USING (true);';

/** Pre-fix behavior, recreated inline (not imported) -- database/migrations/ only. */
function preFixCandidateFilesAll(repoRoot) {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, 'database', 'migrations'));
  } catch {
    return [];
  }
  return entries.filter((f) => f.endsWith('.sql'));
}

describe('RLS_LINT_CORPUS_DIRS', () => {
  it('lists exactly the three directories the DDL-auto-apply writer of record uses', () => {
    expect(RLS_LINT_CORPUS_DIRS).toEqual([
      'database/migrations',
      'database/manual-updates',
      'supabase/migrations',
    ]);
  });
});

describe('candidateFilesAll — widened corpus (FR-1, --all mode)', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rls-lint-corpus-width-all-'));
    for (const dir of RLS_LINT_CORPUS_DIRS) {
      const full = join(root, ...dir.split('/'));
      mkdirSync(full, { recursive: true });
      writeFileSync(join(full, 'violation.sql'), VIOLATION_SQL);
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('scans all three directories, not just database/migrations', () => {
    const files = candidateFilesAll(root);
    expect(files).toHaveLength(3);
  });

  it('every scanned file actually flags the seeded violation via lintSql', () => {
    const files = candidateFilesAll(root);
    for (const f of files) {
      const sql = readFileSync(f, 'utf8');
      expect(lintSql(sql, f)).toHaveLength(1);
    }
  });

  it('RED: the pre-fix (database/migrations/-only) scan would have caught only 1 of the 3 seeded violations', () => {
    const preFix = preFixCandidateFilesAll(root);
    expect(preFix).toHaveLength(1);
    // GREEN: the post-fix scan catches all 3 -- the widening is what closes the gap.
    expect(candidateFilesAll(root)).toHaveLength(3);
  });
});

describe('candidateFilesDiff — widened corpus (FR-1/FR-2, blocking diff mode) + non-retroactive baseline (FR-3, TS-4)', () => {
  let root;
  let baseSha;
  const savedBase = process.env.RLS_LINT_BASE;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rls-lint-corpus-width-diff-'));
    execSync('git init -q', { cwd: root });
    execSync('git config user.email "test@example.com"', { cwd: root });
    execSync('git config user.name "Test"', { cwd: root });

    // Pre-existing, COMMITTED violation in a newly-scanned directory that nobody
    // is touching in this "PR" -- must never become a newly-blocking failure.
    const baselineDir = join(root, 'supabase', 'migrations');
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(join(baselineDir, 'baseline.sql'), VIOLATION_SQL);
    execSync('git add -A', { cwd: root });
    execSync('git commit -q -m "baseline"', { cwd: root });
    baseSha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
    process.env.RLS_LINT_BASE = baseSha;

    // NEW, untracked violation in a different newly-scanned directory -- the
    // shape of a file a PR is actually introducing.
    const newDir = join(root, 'database', 'manual-updates');
    mkdirSync(newDir, { recursive: true });
    writeFileSync(join(newDir, 'new-violation.sql'), VIOLATION_SQL);
  });

  afterEach(() => {
    if (savedBase === undefined) delete process.env.RLS_LINT_BASE;
    else process.env.RLS_LINT_BASE = savedBase;
    rmSync(root, { recursive: true, force: true });
  });

  it('GREEN: includes the new untracked violation under database/manual-updates/ (a directory the pre-fix corpus never scanned)', () => {
    const files = candidateFilesDiff(root).map((f) => f.split(sep).join('/'));
    expect(files.some((f) => f.endsWith('database/manual-updates/new-violation.sql'))).toBe(true);
  });

  it('RED: the pre-fix (database/migrations/-only) diff filter would have missed the same file', () => {
    const preFixFiltered = ['database/manual-updates/new-violation.sql']
      .filter((f) => f.startsWith('database/migrations/') && f.endsWith('.sql'));
    expect(preFixFiltered).toHaveLength(0);
  });

  it('TS-4: does NOT include the committed, untouched baseline violation under supabase/migrations/ -- diff mode stays non-retroactive', () => {
    const files = candidateFilesDiff(root).map((f) => f.split(sep).join('/'));
    expect(files.some((f) => f.endsWith('supabase/migrations/baseline.sql'))).toBe(false);
  });
});
