/**
 * Scope guard for SD-LEO-FEAT-PROVEN-BETTER-NEW-001 (US-007, FR-4 reuse mandate).
 * evaluateScopeGuard() is a pure predicate over a changed-file list: no new lib/marketing/
 * file, no new CREATE TABLE migration. Exercised against a seeded violation (proves the guard
 * can observe its subject, per PER-001 / known-answer-control discipline) and a known-good
 * control.
 *
 * REMOVED 2026-08-15 (found by SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001's CI, PR #7057): a third
 * describe block used to assert this SD's REAL diff against a fixed historical SHA
 * (SD_BRANCH_BASE_SHA). Its own comment correctly reasoned about one moving-target failure —
 * a merge-base computed against origin/main going stale once this branch merged — and "fixed"
 * it by pinning to a fixed ancestor SHA instead. That did not fix the actual problem: once
 * SD-LEO-FEAT-PROVEN-BETTER-NEW-001 merged, this test file itself became part of main, so
 * `git diff <fixed-SHA>...HEAD` on any LATER branch computes that later branch's entire
 * history back to the same ancient point — which necessarily also contains this file's own
 * PR (already in main) plus whatever the later branch adds, so the hardcoded
 * exactly-one-migration-file assertion false-fails on any subsequent PR that touches
 * database/migrations/ at all (confirmed: PR #7057 failed CI on exactly this). A one-time
 * acceptance check for a SPECIFIC PR's diff cannot correctly generalize into a permanent
 * multi-branch CI gate — pinning the SHA changes which kind of drift breaks it, not whether
 * it breaks. The PBN migration's own static content (no CREATE TABLE) is still checked below,
 * directly, without depending on live git state.
 */
import { describe, it, expect } from 'vitest';
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

describe('US-007 AC #1: the PBN migration itself is additive-only (static content check)', () => {
  const root = join(__dirname, '..', '..', '..', '..');

  it('database/migrations/20260815_venture_nursery_pbn_verdict.sql contains zero CREATE TABLE statements (additive column only)', () => {
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
