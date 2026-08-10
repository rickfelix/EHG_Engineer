/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-002 — multi-root scan (FR-A) + gate wiring (FR-B/FR-C).
 *
 * Real temp dirs throughout (no fs mocks, per the PLAN TESTING conditions). Every positive
 * control injects the failing input: the repo's live corpus is quiet on most of these axes,
 * so an assertion over the real tree would stay green with the feature deleted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listForwardMigrations, resolveMigrationPath, migrationDateToken, isRecent,
  orderMigrations, DEFAULT_EXTRA_ROOTS, RETIRED_BEFORE,
} from '../../scripts/verify-migration-apply-state.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

let root;
let primary;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mig-scan-'));
  primary = path.join(root, 'database', 'migrations');
  mkdirSync(primary, { recursive: true });
  mkdirSync(path.join(root, 'extra'), { recursive: true });
  // primary corpus
  writeFileSync(path.join(primary, '20260101_alpha.sql'), 'CREATE TABLE a(x int);');
  writeFileSync(path.join(primary, '20260601_twin.sql'), 'CREATE TABLE twin(x int);');
  // extra root: unique file, recent-dated unique file, identical twin, divergent twin, non-sql, rollback artifact
  writeFileSync(path.join(root, 'extra', '20260701_unique_new.sql'), 'CREATE TABLE u(x int);');
  writeFileSync(path.join(root, 'extra', '20260601_twin.sql'), 'CREATE TABLE twin(x int);'); // identical
  writeFileSync(path.join(root, 'extra', 'notes.md'), '# not a migration');
  writeFileSync(path.join(root, 'extra', '20260702_thing_DOWN.sql'), 'DROP TABLE u;');
});
afterAll(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } });

const scan = (extraRoots = ['extra']) => listForwardMigrations({ primary, extraRoots, repoRoot: root });

describe('TS-1 — multi-root enumeration with collision exclusion', () => {
  it('unique new-root files enter the scan with REPO-RELATIVE ids; primary keeps bare basenames', () => {
    const { forward } = scan();
    expect(forward).toContain('extra/20260701_unique_new.sql');
    expect(forward).toContain('20260101_alpha.sql');
    expect(forward).not.toContain('database/migrations/20260101_alpha.sql');
  });

  it('an IDENTICAL basename twin is excluded and reported as a byte-identical copy', () => {
    const { forward, excluded } = scan();
    expect(forward.filter((f) => f.endsWith('20260601_twin.sql'))).toEqual(['20260601_twin.sql']);
    expect(excluded).toEqual([{ id: 'extra/20260601_twin.sql', twin: '20260601_twin.sql', verdict: 'byte-identical copy' }]);
  });

  it('a DIVERGENT basename twin is excluded and NAMED as divergent — the dangerous class is loud', () => {
    writeFileSync(path.join(root, 'extra', '20260601_twin.sql'), 'CREATE TABLE twin(x int, y int); -- diverged');
    try {
      const { excluded } = scan();
      expect(excluded[0].verdict).toBe('DIVERGENT CONTENT');
    } finally {
      writeFileSync(path.join(root, 'extra', '20260601_twin.sql'), 'CREATE TABLE twin(x int);');
    }
  });

  it('non-.sql files never enter the scan; rollback artifacts land in down (basename-tested)', () => {
    const { forward, down } = scan();
    expect(forward.some((f) => f.includes('notes.md'))).toBe(false);
    expect(down).toContain('extra/20260702_thing_DOWN.sql');
  });

  it('recent-dated new-root ids classify RECENT (a prefixed id must not silently classify LEGACY)', () => {
    expect(migrationDateToken('extra/20260701_unique_new.sql')).toBe('20260701');
    expect(isRecent('supabase/migrations/20260701_x.sql', RETIRED_BEFORE)).toBe(true);
    expect(isRecent('supabase/migrations/20250101_old.sql', RETIRED_BEFORE)).toBe(false);
  });
});

describe('TS-2 — primary-root id and ordering stability', () => {
  it('a pure-primary corpus produces byte-identical ids and ordering to the pre-change contract', () => {
    const { forward } = listForwardMigrations({ primary, extraRoots: [], repoRoot: root });
    expect(forward).toEqual(['20260101_alpha.sql', '20260601_twin.sql']);
  });

  it('mixed-corpus ordering follows basename date tokens — a prefixed id must not fall into the legacy bucket (which sorts FIRST)', () => {
    const ordered = orderMigrations(['supabase/migrations/20260625_late.sql', '20250101_early.sql']);
    expect(ordered).toEqual(['20250101_early.sql', 'supabase/migrations/20260625_late.sql']);
  });
});

describe('TS-5 — root-error fail directions', () => {
  it('ENOENT on a configured root warns and continues (nothing committed there to verify)', () => {
    const { forward } = listForwardMigrations({ primary, extraRoots: ['does-not-exist'], repoRoot: root });
    expect(forward).toContain('20260101_alpha.sql');
  });

  it('a non-ENOENT readdir error stays fail-closed (throws; main() converts it to MISCONFIG)', () => {
    // readdir on a FILE yields ENOTDIR on both platforms (a path UNDER a file yields ENOENT on
    // Windows, which would wrongly take the warn-continue arm — measured, hence this shape).
    expect(() => listForwardMigrations({ primary, extraRoots: ['extra/notes.md'], repoRoot: root })).toThrow();
  });
});

describe('resolveMigrationPath — the single resolution seam', () => {
  it('repo-relative ids resolve from the repo root; bare basenames from the primary root', () => {
    expect(resolveMigrationPath('extra/20260701_unique_new.sql', { primary, repoRoot: root }))
      .toBe(path.resolve(root, 'extra/20260701_unique_new.sql'));
    expect(resolveMigrationPath('20260101_alpha.sql', { primary, repoRoot: root }))
      .toBe(path.join(primary, '20260101_alpha.sql'));
  });
});

describe('TS-3 — workflow and config static assertions (FR-B/FR-C)', () => {
  const wf = readFileSync(path.join(REPO_ROOT, '.github/workflows/migration-deploy-drift-guard.yml'), 'utf8');
  const vc = readFileSync(path.join(REPO_ROOT, 'vitest.config.js'), 'utf8');

  it('FR-B: the push filter re-triggers on every scanned root', () => {
    for (const glob of ["'database/functions/*.sql'", "'database/manual-updates/*.sql'", "'supabase/migrations/*.sql'"]) {
      expect(wf, glob).toContain(glob);
    }
  });

  it('FR-C: the wiring-proof step runs the ungated migration-gate project with three-arm separation', () => {
    expect(wf).toContain('--project migration-gate');
    expect(wf).not.toContain('--project db\n'); // the old always-red invocation is gone
    // ANCHORED whole-line grep, pinned exactly (TESTING C2 + SECURITY SEC-1, forgery reproduced
    // by both): a -Fq substring match let a committed migration FILENAME containing the phrase
    // downgrade a REAL wiring-proof failure to a harness warning. The -Fxq + full-literal form
    // is load-bearing; this assertion reds if the anchoring silently regresses.
    expect(wf).toContain("grep -Fxq 'No test files found, exiting with code 1'");
    expect(wf).not.toMatch(/grep -Fq 'No test files found/);
    expect(wf).toContain('DID NOT RUN'); // the harness arm names itself instead of impersonating a verdict
    expect(wf).toContain('This is a real verdict, not a harness issue');
    // Never SET as an env assignment (a comment may name it while explaining why not).
    expect(wf).not.toMatch(/VITEST_DB_ALLOW_REF\s*[:=]/);
  });

  it('FR-C: the migration-gate vitest project exists and includes exactly the wiring test', () => {
    expect(vc).toContain("name: 'migration-gate'");
    expect(vc).toContain('migration-apply-state-ledger-wiring.test.js');
  });

  it('the DEFAULT_EXTRA_ROOTS constant and the workflow filter name the same three roots (no drift)', () => {
    for (const root2 of DEFAULT_EXTRA_ROOTS) {
      expect(wf, root2).toContain(`'${root2}/*.sql'`);
    }
    expect(DEFAULT_EXTRA_ROOTS).toHaveLength(3);
  });
});
