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

  it('honors custom baseRef', () => {
    execSyncMock.mockReturnValue('5\t1\tlib/x.js');
    countLocBySplit('/fake/repo', 'origin/develop');
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('origin/develop..HEAD'),
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
