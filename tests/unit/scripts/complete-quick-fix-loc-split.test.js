/**
 * SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-1/FR-2 vitest:
 *   - countLocBySplit() per-file source/test classification
 *   - validateLOC() source-only cap; test LOC excluded
 *   - validateLOC() --force-complete bypass
 *   - Static source-code regression guard (no `.eq('actual_loc', N)` writes that
 *     bypass the new actual_source_loc / actual_test_loc fields)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const execSyncMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execSync: execSyncMock }));

const { countLocBySplit } = await import('../../../scripts/modules/complete-quick-fix/git-operations.js');
const { validateLOC, QF_HARD_LOC_CAP } = await import('../../../scripts/modules/complete-quick-fix/verification.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');

describe('SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 — countLocBySplit', () => {
  beforeEach(() => execSyncMock.mockReset());

  it('classifies *.test.js as test', () => {
    execSyncMock.mockReturnValue('20\t5\tlib/foo.js\n50\t10\ttests/foo.test.js');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(25);
    expect(r.test).toBe(60);
    expect(r.total).toBe(85);
  });

  it('classifies *.spec.ts as test', () => {
    execSyncMock.mockReturnValue('30\t0\tlib/handler.ts\n100\t20\tlib/handler.spec.ts');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(30);
    expect(r.test).toBe(120);
  });

  it('classifies __tests__/ paths as test', () => {
    execSyncMock.mockReturnValue('15\t5\tlib/util.js\n40\t8\tsrc/__tests__/util.js');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(20);
    expect(r.test).toBe(48);
  });

  it('classifies tests/ root paths as test', () => {
    execSyncMock.mockReturnValue('10\t2\tlib/foo.js\n30\t5\ttests/integration/foo.test.js');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(12);
    expect(r.test).toBe(35);
  });

  it('classifies e2e/ + playwright/ paths as test', () => {
    execSyncMock.mockReturnValue('20\t0\te2e/login.spec.ts\n30\t5\tplaywright/checkout.test.ts');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(0);
    expect(r.test).toBe(55);
  });

  it('handles binary files (numstat = -)', () => {
    execSyncMock.mockReturnValue('-\t-\timages/logo.png\n10\t2\tlib/foo.js');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(12);
    expect(r.test).toBe(0);
  });

  it('returns zeros on empty git output (e.g. no commits past base)', () => {
    execSyncMock.mockReturnValue('');
    const r = countLocBySplit('/fake/repo');
    // QF-20260509-407: signature extended with sourceDeletionLoc.
    expect(r).toEqual({ source: 0, test: 0, total: 0, sourceDeletionLoc: 0 });
  });

  it('honors custom baseRef (QF-20260511-205: 3-dot symmetric diff)', () => {
    execSyncMock.mockReturnValue('5\t1\tlib/x.js');
    countLocBySplit('/fake/repo', 'origin/develop');
    // QF-20260511-205: must use 3-dot (origin/develop...HEAD), NOT 2-dot.
    // 2-dot inflates by including main-side commits when origin/main has
    // advanced since branch divergence (witnessed 9468 LOC across 752 files
    // on a branch with zero unique commits when 2-dot was in use).
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('origin/develop...HEAD'),
      expect.any(Object)
    );
    expect(execSyncMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/origin\/develop\.\.HEAD(?!\.)/),
      expect.any(Object)
    );
  });

  it('strips empty lines + counts insertions+deletions per file', () => {
    execSyncMock.mockReturnValue('\n10\t5\tlib/a.js\n\n20\t10\tlib/b.test.js\n');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(15);
    expect(r.test).toBe(30);
    expect(r.total).toBe(45);
  });

  it('case-insensitive test pattern (.TEST. / .Spec.)', () => {
    execSyncMock.mockReturnValue('5\t0\tlib/Foo.TEST.js\n10\t0\tlib/Bar.Spec.ts');
    const r = countLocBySplit('/fake/repo');
    expect(r.source).toBe(0);
    expect(r.test).toBe(15);
  });

  // QF-20260511-129: pin the source/test split to the PR's actual commit boundary
  // (mergeCommit.oid) instead of CWD HEAD. Without this, running complete-quick-fix.js
  // from a long-lived QF/SD worktree inflates the split by orders of magnitude
  // (QF-20260511-876: reported 1624 src / 181 test for actual 67 / 106 LOC).
  it('defaults headRef to "HEAD" (backward-compat with legacy callers)', () => {
    execSyncMock.mockReturnValue('5\t1\tlib/x.js');
    countLocBySplit('/fake/repo', 'origin/main');
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('origin/main...HEAD'),
      expect.any(Object)
    );
  });

  it('honors custom headRef parameter (pins diff to PR mergeCommit.oid)', () => {
    execSyncMock.mockReturnValue('5\t1\tlib/x.js');
    countLocBySplit('/fake/repo', 'origin/main', 'abc1234567');
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('origin/main...abc1234567'),
      expect.any(Object)
    );
    expect(execSyncMock).not.toHaveBeenCalledWith(
      expect.stringContaining('origin/main...HEAD'),
      expect.any(Object)
    );
  });

  it('passes headRef to the deleted-files diff-filter probe as well', () => {
    // First call = numstat; second call = name-status. Both must use headRef.
    execSyncMock
      .mockReturnValueOnce('5\t1\tlib/x.js')
      .mockReturnValueOnce('D\tlib/legacy.js');
    countLocBySplit('/fake/repo', 'origin/main', 'deadbeef');
    expect(execSyncMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('origin/main...deadbeef'),
      expect.any(Object)
    );
    expect(execSyncMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('--diff-filter=D origin/main...deadbeef'),
      expect.any(Object)
    );
  });
});

// QF-20260511-129: source-code regression guard — assert that the PR-metadata
// branch in autoDetectGitInfo wires result.commitSha as the headRef when calling
// countLocBySplit. Reading source via readFileSync (not import) so the guard
// catches AST-level changes, not just behavioral drift.
describe('QF-20260511-129 — PR-metadata path pins countLocBySplit to mergeCommit.oid', () => {
  const src = readFileSync(
    resolve(REPO_ROOT, 'scripts/modules/complete-quick-fix/git-operations.js'),
    'utf-8'
  );

  it('countLocBySplit signature accepts (testDir, baseRef, headRef)', () => {
    expect(src).toMatch(/export function countLocBySplit\(testDir,\s*baseRef\s*=\s*['"]origin\/main['"],\s*headRef\s*=\s*['"]HEAD['"]\)/);
  });

  it('PR-metadata branch passes result.commitSha as splitHeadRef (not bare "HEAD")', () => {
    // Locate the PR-metadata branch by its unique prNumber console.log marker.
    const prBranchStart = src.indexOf('PR-metadata authoritative path');
    expect(prBranchStart).toBeGreaterThan(0);
    const prBranchSnippet = src.slice(prBranchStart, prBranchStart + 4000);
    expect(prBranchSnippet).toMatch(/splitHeadRef\s*=\s*['"]HEAD['"]/);
    expect(prBranchSnippet).toMatch(/result\.commitSha[\s\S]*?splitHeadRef\s*=\s*result\.commitSha/);
    expect(prBranchSnippet).toMatch(/countLocBySplit\(testDir,\s*['"]origin\/main['"],\s*splitHeadRef\)/);
  });

  it('PR-metadata branch guards with git cat-file -e before pinning to commitSha', () => {
    const prBranchStart = src.indexOf('PR-metadata authoritative path');
    const prBranchSnippet = src.slice(prBranchStart, prBranchStart + 4000);
    // The guard skips the split (rather than inflating from CWD HEAD) when the
    // commit isn't fetched locally.
    expect(prBranchSnippet).toMatch(/git cat-file -e \$\{result\.commitSha\}/);
    expect(prBranchSnippet).toMatch(/skipping source\/test split/);
  });

  it('legacy in-worktree branch passes "HEAD" explicitly (clarity, no behavior change)', () => {
    const legacyStart = src.indexOf('Legacy in-worktree path');
    expect(legacyStart).toBeGreaterThan(0);
    const legacySnippet = src.slice(legacyStart, legacyStart + 4000);
    expect(legacySnippet).toMatch(/countLocBySplit\(testDir,\s*['"]origin\/main['"],\s*['"]HEAD['"]\)/);
  });
});

describe('SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 — validateLOC', () => {
  let noopPrompt;
  beforeEach(() => { noopPrompt = vi.fn(async () => 'no'); });

  it('passes when source LOC <= QF_HARD_LOC_CAP regardless of test LOC', async () => {
    expect(QF_HARD_LOC_CAP).toBe(75);
    const result = await validateLOC(50, 200, 'QF-X', null, noopPrompt);
    expect(result).toBe(true);
  });

  it('fails when source LOC exceeds cap (default path)', async () => {
    const result = await validateLOC(100, 0, 'QF-X', null, noopPrompt);
    expect(result).toBe(false);
  });

  it('--force-complete bypasses cap entirely (returns true even at 500 source LOC)', async () => {
    const result = await validateLOC(500, 200, 'QF-X', null, noopPrompt, {
      forceComplete: true,
      reason: 'test fixture'
    });
    expect(result).toBe(true);
    expect(noopPrompt).not.toHaveBeenCalled();
  });

  it('--force-complete absent → cap rule applies even with massive test LOC', async () => {
    const result = await validateLOC(80, 0, 'QF-X', null, noopPrompt);
    expect(result).toBe(false);
  });
});

describe('SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 — static source-code regression guards', () => {
  it('orchestrator.js writes BOTH actual_source_loc AND actual_test_loc on completion', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'scripts/modules/complete-quick-fix/orchestrator.js'),
      'utf8'
    );
    expect(src).toContain('actual_source_loc:');
    expect(src).toContain('actual_test_loc:');
    expect(src).toContain('force_completed:');
  });

  it('cli.js exposes --non-interactive + --force-complete + --reason flags', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'scripts/modules/complete-quick-fix/cli.js'),
      'utf8'
    );
    expect(src).toContain("'non-interactive'");
    expect(src).toContain("'force-complete'");
    expect(src).toContain("'reason'");
    expect(src).toContain("'actual-source-loc'");
    expect(src).toContain("'actual-test-loc'");
  });

  it('migration file exists and references the 4 expected ALTERs', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'database/migrations/20260508_qf_lifecycle_fix_actual_loc_split.sql'),
      'utf8'
    );
    expect(src).toContain('ADD COLUMN IF NOT EXISTS actual_source_loc');
    expect(src).toContain('ADD COLUMN IF NOT EXISTS actual_test_loc');
    expect(src).toContain('ADD COLUMN IF NOT EXISTS force_completed');
    expect(src).toContain('actual_loc_reasonable');
    expect(src).toContain('completed_requires_verification');
    expect(src).toContain('force_completed = TRUE');
  });
});

describe('QF-20260511-205 — countLocBySplit uses 3-dot diff syntax (static-pin)', () => {
  let src;
  beforeEach(() => {
    src = readFileSync(
      resolve(REPO_ROOT, 'scripts/modules/complete-quick-fix/git-operations.js'),
      'utf8'
    );
  });

  it('numstat call uses 3-dot baseRef...headRef (not 2-dot)', () => {
    // QF-20260511-129: headRef is now parameterized (was hardcoded 'HEAD').
    // QF-20260511-741: the 3-dot range is now hoisted into an `effectiveRange`
    // variable so an empty 3-dot result can be retried against headRef^.
    // The literal `${baseRef}...${headRef}` template lives at the variable
    // init site; execSync references the variable.
    expect(src).toContain('`${baseRef}...${headRef}`');
    expect(src).toMatch(/git diff --numstat \$\{effectiveRange\}/);
    // Guard against accidental 2-dot regression on either ref form.
    expect(src).not.toMatch(/git diff --numstat \$\{baseRef\}\.\.\$\{headRef\}(?!\.)/);
    expect(src).not.toMatch(/git diff --numstat \$\{baseRef\}\.\.HEAD(?!\.)/);
  });

  it('name-status (--diff-filter=D) call shares the same range as numstat', () => {
    // QF-20260511-741: both numstat and diff-filter route through
    // ${effectiveRange} so the fallback (headRef^...headRef) is applied
    // symmetrically — diff-filter against original 3-dot when numstat
    // fell back would mis-count deletions.
    expect(src).toMatch(/git diff --name-status --diff-filter=D \$\{effectiveRange\}/);
    expect(src).not.toMatch(/git diff --name-status --diff-filter=D \$\{baseRef\}\.\.\$\{headRef\}(?!\.)/);
    expect(src).not.toMatch(/git diff --name-status --diff-filter=D \$\{baseRef\}\.\.HEAD(?!\.)/);
  });

  it('docstring documents 3-dot semantics + cross-references sister QF-20260503-820', () => {
    // Pin doc-comment changes so future cleanups don't silently drop the
    // reason 3-dot is required (would invite a regression to the old 2-dot
    // form that produced 9468-LOC inflation on this branch's repro case).
    expect(src).toContain('<baseRef>...HEAD');
    expect(src).toContain('QF-20260511-205');
    expect(src).toContain('QF-20260503-820');
  });

  it('countLocBySplit body contains no 2-dot ${baseRef}..HEAD occurrence (anchored)', () => {
    // Scope to the countLocBySplit function body so other call sites
    // (e.g. analyzeGitDiff, which already used 3-dot per QF-20260503-820)
    // aren't matched. The function ends before validateBranchName.
    const fnStart = src.indexOf('export function countLocBySplit');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('function validateBranchName', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).not.toMatch(/\$\{baseRef\}\.\.HEAD(?!\.)/);
  });
});

describe('QF-20260511-205 — countLocBySplit behavior with 3-dot diff', () => {
  beforeEach(() => execSyncMock.mockReset());

  it('passes the 3-dot ref form to execSync for the default origin/main base', () => {
    execSyncMock.mockReturnValue('10\t2\tlib/x.js');
    countLocBySplit('/fake/repo');
    // First call is the numstat; assert command shape.
    const firstCall = execSyncMock.mock.calls[0];
    expect(firstCall[0]).toBe('git diff --numstat origin/main...HEAD');
  });

  it('name-status call (deletion enumeration) also uses 3-dot', () => {
    execSyncMock.mockReturnValue('10\t2\tlib/x.js');
    countLocBySplit('/fake/repo', 'origin/main');
    // Second call is the --diff-filter=D enumeration.
    const secondCall = execSyncMock.mock.calls[1];
    expect(secondCall?.[0]).toBe('git diff --name-status --diff-filter=D origin/main...HEAD');
  });
});
