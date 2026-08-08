// SD-LEO-INFRA-CANONICAL-REPO-APP-001 FR-4 (TS-5, TS-6)
//
// QF-20260807-761 — WHY TS-5 NOW LINTS A TEMP TREE. TS-5 used to write its violation fixture into
// the REAL scripts/ directory while TS-6 lints the WHOLE repo off the same disk. Whether TS-6 saw
// that fixture depended on ordering and on any other worker touching the tree concurrently: it
// failed combined, passed alone. The failing arm was `filesScanned > 0`, and it was RIGHT — it
// fired on a genuine race. This file sits in the ONE required check, so an order-dependent test
// here can block unrelated merges at random.
//
// The fix is ISOLATION, not a retry: TS-5 builds a private repo-shaped temp tree and lints THAT
// via runLint({ repoRoot }), so no fixture is ever written into the scanned repo and there is
// nothing left to race. TS-6 still scans the real repo with default arguments.
//
// THE VACUITY ARM IS DELIBERATELY PRESERVED (coordinator-flagged: preserve, do not delete). It is
// the scanned-zero guard: without it, a scan that collected NO files would report `findings === []`
// and read as a clean pass. It now also has a two-sided proof of its own at the bottom.

import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLint } from '../../../scripts/lint-repo-resolution-drift.mjs';

const FIXTURE_REL = 'scripts/__lint_repo_resolution_drift_fixture__.mjs';

/** A private repo-shaped tree: <tmp>/scripts/<fixture>. Never inside the scanned repo. */
function withFixture(source) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lint-repo-drift-'));
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  writeFileSync(path.join(root, FIXTURE_REL), source, 'utf8');
  return root;
}

const TEMP_ROOTS = [];
const lintFixture = (source) => {
  const root = withFixture(source);
  TEMP_ROOTS.push(root);
  return runLint({ repoRoot: root });
};

afterAll(() => {
  for (const root of TEMP_ROOTS) {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('lint-repo-resolution-drift', () => {
  it('TS-6: passes clean against the current repo state (no false-flags on allowlisted anchors)', () => {
    const { findings, filesScanned } = runLint();
    expect(filesScanned).toBeGreaterThan(0);
    expect(findings).toEqual([]);
  });

  describe('TS-5: detects a new violation outside the allowlist', () => {
    it('flags a literal platform-repo string introduced in a new, non-allowlisted file', () => {
      const { findings } = lintFixture("export const OWNER_REPO = 'rickfelix/ehg';\n");
      const hit = findings.find((f) => f.file === FIXTURE_REL);
      expect(hit).toBeDefined();
      expect(hit.value).toBe('rickfelix/ehg');
    });

    it('flags a fully-literal string concatenation forming the same value', () => {
      const { findings } = lintFixture("export const OWNER_REPO = 'rickfelix' + '/' + 'ehg_engineer';\n");
      const hit = findings.find((f) => f.file === FIXTURE_REL);
      expect(hit).toBeDefined();
      expect(hit.value).toBe('rickfelix/ehg_engineer');
    });

    it('does NOT flag a dynamic (non-literal) concatenation — value is not statically known', () => {
      const { findings } = lintFixture("export function buildRepo(name) { return 'rickfelix/' + name; }\n");
      expect(findings.find((f) => f.file === FIXTURE_REL)).toBeUndefined();
    });
  });

  it('does not flag literal platform-repo strings inside tests/** (allowlisted for fixtures/mocks)', () => {
    const { findings } = runLint();
    expect(findings.find((f) => f.file.startsWith('tests/'))).toBeUndefined();
  });

  describe('QF-20260807-761: the isolation and the vacuity guard', () => {
    it('ORDER-INDEPENDENCE: a TS-5 fixture never reaches the repo scan, in either order', () => {
      // The regression itself. Lint the real repo, run the fixture case, lint the real repo again:
      // the fixture must be invisible to BOTH repo scans. Pre-fix, the fixture was written into
      // scripts/ and the second scan would find it.
      const before = runLint();
      const fixture = lintFixture("export const OWNER_REPO = 'rickfelix/ehg';\n");
      const after = runLint();

      expect(fixture.findings.find((f) => f.file === FIXTURE_REL), 'the fixture tree must still be linted').toBeDefined();
      expect(before.findings, 'repo scan before the fixture was not clean').toEqual([]);
      expect(after.findings, 'the fixture leaked into the repo scan — the race is still live').toEqual([]);
    });

    it('VACUITY GUARD is two-sided: a scan collecting zero files is NOT a clean pass', () => {
      // Preserved and now proven. An empty tree yields findings === [] — indistinguishable from a
      // real pass on `findings` alone. filesScanned is the only thing that separates them, which
      // is exactly why the arm that fired on the race must stay.
      const empty = mkdtempSync(path.join(os.tmpdir(), 'lint-repo-drift-empty-'));
      TEMP_ROOTS.push(empty);
      const { filesScanned, findings } = runLint({ repoRoot: empty });

      expect(findings, 'an empty scan reports no findings — the trap the guard exists for').toEqual([]);
      expect(filesScanned, 'a scan of nothing must not look like a clean repo').toBe(0);
      expect(runLint().filesScanned, 'the real repo must scan a non-zero file count').toBeGreaterThan(0);
    });
  });
});
