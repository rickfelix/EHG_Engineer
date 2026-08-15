/**
 * Scope guard for SD-LEO-FEAT-PROVEN-BETTER-NEW-001 (US-007, FR-4 reuse mandate).
 * evaluateScopeGuard() is a pure predicate over a changed-file list: no new lib/marketing/
 * file, no new CREATE TABLE migration. Exercised three ways — against a seeded violation
 * (proves the guard can observe its subject, per PER-001 / known-answer-control discipline),
 * against a known-good control, and against this SD's REAL diff vs its merge-base.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

function evaluateScopeGuard(changedFiles) {
  const violations = [];
  for (const file of changedFiles) {
    if (/^lib\/marketing\//.test(file)) {
      violations.push({ file, reason: 'new file under lib/marketing/ — out of scope per FR-4 reuse mandate' });
    }
  }
  return { pass: violations.length === 0, violations };
}

function evaluateMigrationGuard(migrationSql) {
  const hasCreateTable = /CREATE\s+TABLE/i.test(migrationSql);
  return { pass: !hasCreateTable, hasCreateTable };
}

describe('US-007 scope guard: evaluateScopeGuard (pure predicate)', () => {
  it('FAILS on a seeded violation — a stub file under lib/marketing/ — proving the guard observes its subject', () => {
    const result = evaluateScopeGuard(['lib/eva/stage-zero/pbn-gate.js', 'lib/marketing/pbn-stub.js']);
    expect(result.pass).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].file).toBe('lib/marketing/pbn-stub.js');
  });

  it('PASSES on a known-good control — no lib/marketing/ files — the complementary control proving the guard discriminates rather than always failing', () => {
    const result = evaluateScopeGuard(['lib/eva/stage-zero/pbn-gate.js', 'tests/unit/eva/stage-zero/pbn-gate.test.js']);
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe('US-007 AC #1: exactly one migration object, zero CREATE TABLE (real diff)', () => {
  const root = join(__dirname, '..', '..', '..', '..');
  const mergeBase = execSync('git merge-base HEAD origin/main 2>nul || git merge-base HEAD main', {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  }).trim();
  const changedFiles = execSync(`git diff --name-only ${mergeBase}...HEAD`, { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  it('the real diff contains no new file under lib/marketing/', () => {
    const result = evaluateScopeGuard(changedFiles);
    expect(result.pass).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('the real diff touches exactly one file under database/migrations/', () => {
    const migrationFiles = changedFiles.filter((f) => f.startsWith('database/migrations/'));
    expect(migrationFiles).toEqual(['database/migrations/20260815_venture_nursery_pbn_verdict.sql']);
  });

  it('that migration file contains zero CREATE TABLE statements (additive column only)', () => {
    const sql = readFileSync(join(root, 'database/migrations/20260815_venture_nursery_pbn_verdict.sql'), 'utf8');
    const result = evaluateMigrationGuard(sql);
    expect(result.pass).toBe(true);
    expect(result.hasCreateTable).toBe(false);
  });

  it('a seeded CREATE TABLE statement is caught by evaluateMigrationGuard — proving the migration guard is not vacuous', () => {
    const seeded = 'CREATE TABLE venture_demand_probes (id uuid PRIMARY KEY);';
    const result = evaluateMigrationGuard(seeded);
    expect(result.pass).toBe(false);
    expect(result.hasCreateTable).toBe(true);
  });
});
