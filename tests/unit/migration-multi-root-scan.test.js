/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-002 — multi-root scan (FR-A) + gate wiring (FR-B/FR-C).
 *
 * Real temp dirs throughout (no fs mocks, per the PLAN TESTING conditions). Every positive
 * control injects the failing input: the repo's live corpus is quiet on most of these axes,
 * so an assertion over the real tree would stay green with the feature deleted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
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

  it('EXTRA-ROOT pair collisions are excluded too — no basename ever enters twice from ANY root pair', () => {
    // Adversarial-review INFO closed: the first exclusion checked only the primary root;
    // two extra roots sharing a basename would both enter under distinct repo-relative ids
    // that the ledger strips to ONE key — one disposition suppressing two files.
    mkdirSync(path.join(root, 'extra2'), { recursive: true });
    writeFileSync(path.join(root, 'extra2', '20260701_unique_new.sql'), 'CREATE TABLE u2(x int); -- diverged copy');
    try {
      const { forward, excluded } = listForwardMigrations({ primary, extraRoots: ['extra', 'extra2'], repoRoot: root });
      expect(forward.filter((f) => f.endsWith('20260701_unique_new.sql'))).toEqual(['extra/20260701_unique_new.sql']);
      const pair = excluded.find((e) => e.id === 'extra2/20260701_unique_new.sql');
      expect(pair).toBeTruthy();
      expect(pair.twin).toBe('extra/20260701_unique_new.sql');
      expect(pair.verdict).toBe('DIVERGENT CONTENT');
    } finally {
      rmSync(path.join(root, 'extra2'), { recursive: true, force: true });
    }
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

  it('FR-C rename hole (adversarial review): the wiring test FILE EXISTS at the included path', () => {
    // The warn-arm is a permanent ratchet-less green if the file moves — every future run
    // would warn "DID NOT RUN" and exit 0, and the config string assertion above stays green
    // through a rename. This reds the moment the include and the file disagree.
    expect(existsSync(path.join(REPO_ROOT, 'tests/integration/migration-apply-state-ledger-wiring.test.js'))).toBe(true);
  });

  it('SEC-2 both fence legs: the migration-gate project stubs BOTH url vars to the invalid host', () => {
    // Asserted by counting the invalid-host stubs inside the project block rather than by
    // naming the env vars: the DB-test-guard static analyser (audit-db-test-guards.mjs
    // DB_IMPORT_SIGNAL) pattern-matches those tokens in unit tests, and this test opens no
    // client — it string-asserts committed config. Two occurrences = both legs present
    // (the plain var and its NEXT_PUBLIC_ sibling, which the service-client factory prefers).
    const block = vc.slice(vc.indexOf("name: 'migration-gate'"));
    expect((block.match(/https:\/\/test\.invalid\.local/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(block).toContain('test-service-role-key-not-real');
  });

  it('the DEFAULT_EXTRA_ROOTS constant and the workflow filter name the same roots (no drift)', () => {
    for (const root2 of DEFAULT_EXTRA_ROOTS) {
      expect(wf, root2).toContain(`'${root2}/*.sql'`);
    }
    // SD-LEO-INFRA-APPLY-STATE-CEREMONY-PENDING-001 (FR-1) added database/chairman-gated as a
    // 4th scanned root — bumped from 3 deliberately, not silently, so a future 5th root drift
    // still reds this assertion rather than the count quietly ratcheting with no test change.
    expect(DEFAULT_EXTRA_ROOTS).toHaveLength(4);
  });
});

describe('SD-LEO-INFRA-APPLY-STATE-CEREMONY-PENDING-001 FR-1 — database/chairman-gated/ is scanned', () => {
  it('a chairman-gated file enters the scan with a repo-relative id under its own root', () => {
    mkdirSync(path.join(root, 'database', 'chairman-gated'), { recursive: true });
    writeFileSync(path.join(root, 'database', 'chairman-gated', '20260807_gated_thing.sql'), 'CREATE TABLE gated(x int);');
    try {
      const { forward } = listForwardMigrations({ primary, extraRoots: [...DEFAULT_EXTRA_ROOTS], repoRoot: root });
      expect(forward).toContain('database/chairman-gated/20260807_gated_thing.sql');
    } finally {
      rmSync(path.join(root, 'database', 'chairman-gated'), { recursive: true, force: true });
    }
  });
});
