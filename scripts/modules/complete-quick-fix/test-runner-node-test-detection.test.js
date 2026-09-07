/**
 * QF-20260906-859: a changed unit-test file that uses node:test (e.g.
 * tests/unit/auto-validate-user-stories-draft.test.js) is vitest-excluded and
 * cannot be collected by `vitest run`, even when passed as an explicit scoped
 * path -- vitest exits 1 with "No test files found" for that file alone. The
 * change-scoped gate in complete-quick-fix.js collapsed that runner failure
 * into a bare FAIL, blocking completion of a fix that actually passes 18/18
 * under `node --test`.
 *
 * These tests exercise the fix with one real excluded (node:test) fixture
 * file and one real vitest fixture file on disk, mirroring the ticket's own
 * acceptance criteria ("unit test with one excluded file and one vitest file").
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

let execSyncMock;
vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

import {
  isNodeTestFile,
  partitionTestFiles,
  extractNodeTestSummary,
  combineUnitResults,
  runTests,
} from './test-runner.js';

describe('isNodeTestFile — fs fixture', () => {
  let dir, nodeTestFile, vitestFile, missingFile;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'cqf-nodetest-'));
    nodeTestFile = 'excluded.test.js';
    writeFileSync(
      path.join(dir, nodeTestFile),
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('x', () => assert.ok(true));\n"
    );
    vitestFile = 'vitest.test.js';
    writeFileSync(
      path.join(dir, vitestFile),
      "import { describe, it, expect } from 'vitest';\ndescribe('x', () => { it('y', () => { expect(1).toBe(1); }); });\n"
    );
    missingFile = 'nope.test.js';
  });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it('detects a file that imports node:test', () => {
    expect(isNodeTestFile(nodeTestFile, dir)).toBe(true);
  });

  it('returns false for an ordinary vitest file', () => {
    expect(isNodeTestFile(vitestFile, dir)).toBe(false);
  });

  it('returns false (not throw) for a file that does not exist on disk', () => {
    expect(isNodeTestFile(missingFile, dir)).toBe(false);
  });

  it('also matches the require(\'node:test\') form', () => {
    const reqFile = 'excluded-require.test.js';
    writeFileSync(path.join(dir, reqFile), "const { test } = require('node:test');\n");
    expect(isNodeTestFile(reqFile, dir)).toBe(true);
  });
});

describe('partitionTestFiles — one excluded file, one vitest file', () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'cqf-partition-'));
    writeFileSync(path.join(dir, 'excluded.test.js'), "import { test } from 'node:test';\n");
    writeFileSync(path.join(dir, 'vitest.test.js'), "import { it } from 'vitest';\n");
  });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it('buckets the node:test file and the vitest file separately', () => {
    const { vitestFiles, nodeTestFiles } = partitionTestFiles(
      ['excluded.test.js', 'vitest.test.js'],
      dir
    );
    expect(nodeTestFiles).toEqual(['excluded.test.js']);
    expect(vitestFiles).toEqual(['vitest.test.js']);
  });

  it('returns both buckets empty for an empty/undefined input', () => {
    expect(partitionTestFiles([], dir)).toEqual({ vitestFiles: [], nodeTestFiles: [] });
    expect(partitionTestFiles(undefined, dir)).toEqual({ vitestFiles: [], nodeTestFiles: [] });
  });
});

describe('extractNodeTestSummary', () => {
  it('parses the node --test default-reporter summary block', () => {
    const output = [
      '✔ some test (1.2ms)',
      'ℹ tests 18',
      'ℹ suites 1',
      'ℹ pass 18',
      'ℹ fail 0',
      'ℹ cancelled 0',
      'ℹ skipped 0',
      'ℹ todo 0',
      'ℹ duration_ms 42',
    ].join('\n');
    expect(extractNodeTestSummary(output)).toEqual({ passed: 18, failed: 0, skipped: 0, total: 18 });
  });

  it('parses a run with failures and skips', () => {
    const output = 'ℹ tests 5\nℹ pass 3\nℹ fail 1\nℹ skipped 1\n';
    expect(extractNodeTestSummary(output)).toEqual({ passed: 3, failed: 1, skipped: 1, total: 5 });
  });

  it('falls back to passed+failed+skipped when no explicit tests-total line is present', () => {
    const output = 'ℹ pass 2\nℹ fail 0\nℹ skipped 0\n';
    expect(extractNodeTestSummary(output)).toEqual({ passed: 2, failed: 0, skipped: 0, total: 2 });
  });
});

describe('combineUnitResults', () => {
  it('is a pass only when both buckets pass, and sums their summaries', () => {
    const vitestResult = { passed: true, output: 'v-out', exitCode: 0, summary: { passed: 2, failed: 0, skipped: 0, total: 2 } };
    const nodeResult = { passed: true, output: 'n-out', exitCode: 0, summary: { passed: 18, failed: 0, skipped: 0, total: 18 } };
    const combined = combineUnitResults(vitestResult, nodeResult);
    expect(combined.passed).toBe(true);
    expect(combined.summary).toEqual({ passed: 20, failed: 0, skipped: 0, total: 20 });
    expect(combined.exitCode).toBe(0);
  });

  it('is a failure when either bucket fails', () => {
    const vitestResult = { passed: true, exitCode: 0, summary: { passed: 2, failed: 0, skipped: 0, total: 2 } };
    const nodeResult = { passed: false, exitCode: 1, summary: { passed: 17, failed: 1, skipped: 0, total: 18 } };
    const combined = combineUnitResults(vitestResult, nodeResult);
    expect(combined.passed).toBe(false);
    expect(combined.exitCode).toBe(1);
  });
});

describe('runTests(unit) — routes a mixed changed-file set through both runners (QF-20260906-859)', () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'cqf-runtests-'));
    writeFileSync(path.join(dir, 'excluded.test.js'), "import { test } from 'node:test';\n");
    writeFileSync(path.join(dir, 'vitest.test.js'), "import { it } from 'vitest';\n");
  });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  beforeEach(() => {
    execSyncMock = vi.fn((command) => {
      if (command.startsWith('node --test')) {
        return 'ℹ tests 18\nℹ pass 18\nℹ fail 0\nℹ skipped 0\n';
      }
      return 'Tests  1 passed (1)\n';
    });
  });

  it('runs the node:test file via `node --test` and the vitest file via vitest, combining to a pass', () => {
    const result = runTests('unit', { testFiles: ['excluded.test.js', 'vitest.test.js'], testDir: dir });
    expect(execSyncMock).toHaveBeenCalledTimes(2);
    const commands = execSyncMock.mock.calls.map(c => c[0]);
    expect(commands.some(c => c.startsWith('node --test') && c.includes('excluded.test.js'))).toBe(true);
    expect(commands.some(c => c.includes('vitest run') && c.includes('vitest.test.js'))).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.summary.total).toBe(19); // 18 node:test + 1 vitest
  });

  it('runs ONLY node --test (no vitest call) when every changed file is node:test', () => {
    const result = runTests('unit', { testFiles: ['excluded.test.js'], testDir: dir });
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock.mock.calls[0][0]).toContain('node --test');
    expect(result.passed).toBe(true);
  });

  it('does not change behavior for an all-vitest changed-file set (single vitest call, no node --test)', () => {
    const result = runTests('unit', { testFiles: ['vitest.test.js'], testDir: dir });
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock.mock.calls[0][0]).toContain('vitest run');
    expect(result.passed).toBe(true);
  });

  it('is a fail when the node:test bucket fails even if the vitest bucket passes', () => {
    execSyncMock = vi.fn((command) => {
      if (command.startsWith('node --test')) {
        const err = new Error('exit 1');
        err.status = 1;
        err.stdout = 'ℹ tests 2\nℹ pass 1\nℹ fail 1\nℹ skipped 0\n';
        throw err;
      }
      return 'Tests  1 passed (1)\n';
    });
    const result = runTests('unit', { testFiles: ['excluded.test.js', 'vitest.test.js'], testDir: dir });
    expect(result.passed).toBe(false);
  });
});
