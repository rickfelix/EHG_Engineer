/**
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-B (W1 child B) — FR-1 / FR-2 regression.
 *
 * THE DEFECT: normalizeMigrationPath stripped only getRepoRoot(), which left TWO
 * DISTINCT unmatchable shapes over the same 344 success rows in
 * public.schema_migrations_applied:
 *   (a) WORKTREE — the path DID start with the repo root, so the prefix stripped and left
 *       '.worktrees/<name>/database/migrations/x.sql', which can never equal the
 *       repo-relative 'database/migrations/x.sql'. Stripped, and still unmatchable.
 *   (b) SIBLING CHECKOUT — the path did NOT start with `${root}/`, so the guard never
 *       fired and the value passed through ABSOLUTE AND UNMODIFIED.
 * Consequence at the live consumer (scripts/modules/handoff/pre-checks/pending-migrations-check.js:27,
 * via hasBeenApplied): an already-applied migration reads as PENDING and becomes a
 * candidate for handoff-time auto-apply — harmless for idempotent DDL, a re-execution
 * hazard otherwise.
 *
 * WHY (b) EARNS ITS OWN TESTS: the two LEAD evidence rows agreed exactly on shape (a)
 * (229 rows) and DISAGREED on shape (b) — VALIDATION measured 39 sibling / 76 matchable
 * / 268 unmatchable, Explore measured 43 / 72 / 272. The disagreement is unresolved and
 * the child re-measures it, but the SHAPE is not in dispute. A '.worktrees/' special-case
 * would close (a) and leave (b) entirely live, which is the trap this file exists to pin:
 * the obvious fix for a blind predicate is usually blind in the same way.
 *
 * ROOT PINNING: the (a)/(b) split is a function of getRepoRoot(). A test that reads the
 * real root passes in the shared checkout and FAILS inside a worktree — where this suite
 * actually runs. Every case below therefore builds its fixture FROM the mocked root, so
 * the test means the same thing wherever it executes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FAKE_ROOT = 'C:/fake/checkout/EHG_Engineer';

vi.mock('../../lib/repo-paths.js', () => ({
  getRepoRoot: () => FAKE_ROOT,
  resolveGitHubRepo: () => 'rickfelix/EHG_Engineer',
}));

let normalizeMigrationPath;
let MIGRATION_ROOTS;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../lib/migration-audit-reader.js');
  normalizeMigrationPath = mod.normalizeMigrationPath;
  MIGRATION_ROOTS = mod.MIGRATION_ROOTS;
});

afterEach(() => vi.restoreAllMocks());

const REPO_RELATIVE = 'database/migrations/20260829_x.sql';

describe('normalizeMigrationPath — location-invariant comparison key', () => {
  it('SHAPE BASELINE: a repo-relative POSIX path is unchanged', () => {
    expect(normalizeMigrationPath(REPO_RELATIVE)).toBe(REPO_RELATIVE);
  });

  it('SHAPE 0 (repo root): an absolute path under the root normalizes to repo-relative', () => {
    expect(normalizeMigrationPath(`${FAKE_ROOT}/${REPO_RELATIVE}`)).toBe(REPO_RELATIVE);
  });

  it('SHAPE 0 (Windows separators): backslashes normalize to POSIX', () => {
    const win = `${FAKE_ROOT}\\database\\migrations\\20260829_x.sql`.replace(/\//g, '\\');
    expect(normalizeMigrationPath(win)).toBe(REPO_RELATIVE);
  });

  it('SHAPE A (worktree): strips the .worktrees/<name>/ residue the old prefix-strip left behind', () => {
    // Old behaviour returned '.worktrees/qf-123/database/migrations/20260829_x.sql'.
    const worktree = `${FAKE_ROOT}/.worktrees/qf-123/${REPO_RELATIVE}`;
    expect(normalizeMigrationPath(worktree)).toBe(REPO_RELATIVE);
  });

  it('SHAPE B (sibling checkout): a path NOT under the repo root still normalizes', () => {
    // Old behaviour returned this ABSOLUTE AND UNMODIFIED — the guard never fired.
    // This is the case a '.worktrees/' special-case would leave live.
    const sibling = 'C:/fake/checkout/_EHG/.adam-scribe-fr5/database/migrations/20260829_x.sql';
    expect(normalizeMigrationPath(sibling)).toBe(REPO_RELATIVE);
  });

  it('SHAPE B (sibling, Windows separators)', () => {
    const sibling = 'C:\\fake\\checkout\\_EHG\\.adam-scribe-fr5\\database\\migrations\\20260829_x.sql';
    expect(normalizeMigrationPath(sibling)).toBe(REPO_RELATIVE);
  });

  it('A and B produce the SAME key — one mechanism closes both, which is the point', () => {
    const a = normalizeMigrationPath(`${FAKE_ROOT}/.worktrees/qf-123/${REPO_RELATIVE}`);
    const b = normalizeMigrationPath(`C:/elsewhere/sibling-checkout/${REPO_RELATIVE}`);
    expect(a).toBe(b);
    expect(a).toBe(REPO_RELATIVE);
  });

  it('COLLISION GUARD PRESERVED: the subdirectory is never collapsed to a basename', () => {
    // The function contract states basename is too weak because these two would collide.
    // A basename key (the tempting "invariant to both shapes" fix) REGRESSES this guard.
    const mig = normalizeMigrationPath(`${FAKE_ROOT}/.worktrees/w/database/migrations/same.sql`);
    const gated = normalizeMigrationPath(`${FAKE_ROOT}/.worktrees/w/database/chairman-gated/same.sql`);
    expect(mig).toBe('database/migrations/same.sql');
    expect(gated).toBe('database/chairman-gated/same.sql');
    expect(mig).not.toBe(gated);
  });

  it('every canonical root anchors, not just database/migrations', () => {
    for (const rootDir of MIGRATION_ROOTS) {
      const abs = `C:/some/other/checkout/${rootDir}/file.sql`;
      expect(normalizeMigrationPath(abs)).toBe(`${rootDir}/file.sql`);
    }
  });

  it('LAST root wins, so a checkout directory that itself looks like a root cannot hijack the key', () => {
    const nested = `${FAKE_ROOT}/database/migrations/.worktrees/w/supabase/migrations/x.sql`;
    expect(normalizeMigrationPath(nested)).toBe('supabase/migrations/x.sql');
  });

  it('ROLLBACK SAFETY: an unrecognized root falls back to the previous repo-root strip', () => {
    expect(normalizeMigrationPath(`${FAKE_ROOT}/docs/audits/notes.sql`)).toBe('docs/audits/notes.sql');
  });

  it('ROLLBACK SAFETY: a path with no recognized root and no repo root passes through', () => {
    expect(normalizeMigrationPath('some/other/place/file.sql')).toBe('some/other/place/file.sql');
  });

  it('falsy and non-string inputs are returned unchanged', () => {
    expect(normalizeMigrationPath('')).toBe('');
    expect(normalizeMigrationPath(null)).toBe(null);
    expect(normalizeMigrationPath(undefined)).toBe(undefined);
    expect(normalizeMigrationPath(42)).toBe(42);
  });

  it('the repo root itself normalizes to empty', () => {
    expect(normalizeMigrationPath(FAKE_ROOT)).toBe('');
  });
});

describe('MIGRATION_ROOTS is the single representation', () => {
  it('is frozen and non-empty', () => {
    expect(Object.isFrozen(MIGRATION_ROOTS)).toBe(true);
    expect(MIGRATION_ROOTS.length).toBeGreaterThan(0);
  });

  it('contains the primary root plus the verifier extra roots', () => {
    for (const r of ['database/migrations', 'database/functions', 'database/manual-updates', 'database/chairman-gated', 'supabase/migrations']) {
      expect(MIGRATION_ROOTS).toContain(r);
    }
  });

  it('carries no duplicates and no trailing slashes', () => {
    expect(new Set(MIGRATION_ROOTS).size).toBe(MIGRATION_ROOTS.length);
    for (const r of MIGRATION_ROOTS) expect(r.endsWith('/')).toBe(false);
  });
});
