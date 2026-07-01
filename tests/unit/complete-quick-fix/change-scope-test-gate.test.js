/**
 * SD-FDBK-INFRA-CHANGE-SCOPE-COMPLETE-001
 * Unit tests for the change-scoped complete-quick-fix test gate.
 *
 * Pure / fs-fixture tests — no DB, no real vitest execution. They assert:
 *  - the targeted unit-test command builder (FR-1/FR-3/FR-5);
 *  - the frontend-touch classification that gates e2e (FR-2);
 *  - resolution of the QF's unit-test files from its diff (FR-1/TR-2).
 *
 * Design note: the gate runs RESOLVED test files via `vitest run` (targeted),
 * NOT `vitest related`/`--changed`. EXEC found both graph-building modes throw
 * ERR_LOAD_URL during project-wide collection on a pre-existing baseline file —
 * the very baseline-poisoning this SD escapes. A targeted run avoids that graph.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

let execSyncMock;
vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

import {
  buildUnitTestCommand,
  WHOLE_SUITE_UNIT_COMMAND,
  runTests,
} from '../../../scripts/modules/complete-quick-fix/test-runner.js';
import {
  isFrontendPath,
  touchesFrontend,
  getRelatedSourceFiles,
  sourceBasename,
  candidateTestPaths,
  getScopedUnitTestFiles,
} from '../../../scripts/modules/complete-quick-fix/git-operations.js';

describe('buildUnitTestCommand (FR-1, FR-3, FR-5)', () => {
  it('builds a TARGETED vitest run over the supplied test files', () => {
    const cmd = buildUnitTestCommand(['tests/unit/foo.test.js']);
    expect(cmd).toContain('vitest run');
    expect(cmd).not.toContain('related'); // not the graph-building mode
    expect(cmd).not.toContain('--changed');
    expect(cmd).toContain('"tests/unit/foo.test.js"');
    expect(cmd).toContain('--project unit'); // FR-5: pin to no-DB unit project
    // RCA a15122006891b019b: --passWithNoTests on a scoped run masks a
    // zero-tests-executed false-pass when every path is filtered out by the
    // unit project's own excludes (quarantine manifest / SHARED_EXCLUDE /
    // DB_INCLUDE). Dropped from the scoped branch; runTests() asserts
    // summary.total>0 instead (see the runTests describe block below).
    expect(cmd).not.toContain('--passWithNoTests');
    expect(cmd).not.toBe(WHOLE_SUITE_UNIT_COMMAND);
  });

  it('passes multiple files, each individually quoted', () => {
    const cmd = buildUnitTestCommand(['tests/a.test.js', 'tests/b.test.js']);
    expect(cmd).toContain('"tests/a.test.js"');
    expect(cmd).toContain('"tests/b.test.js"');
  });

  it('FR-5: a path containing a space stays quoted as one argument', () => {
    const cmd = buildUnitTestCommand(['tests/dir with space/foo.test.js']);
    expect(cmd).toContain('"tests/dir with space/foo.test.js"');
  });

  it('FR-1: empty testFiles falls back to the whole unit suite', () => {
    expect(buildUnitTestCommand([])).toBe(WHOLE_SUITE_UNIT_COMMAND);
  });

  it('FR-1: undefined/non-array testFiles falls back to the whole unit suite', () => {
    expect(buildUnitTestCommand(undefined)).toBe(WHOLE_SUITE_UNIT_COMMAND);
    expect(buildUnitTestCommand(null)).toBe(WHOLE_SUITE_UNIT_COMMAND);
    expect(buildUnitTestCommand('tests/foo.test.js')).toBe(WHOLE_SUITE_UNIT_COMMAND);
  });

  it('falls back to whole suite when every entry is blank/non-string', () => {
    expect(buildUnitTestCommand(['', '   ', 42, null])).toBe(WHOLE_SUITE_UNIT_COMMAND);
  });

  it('escapes embedded double-quotes so injection is not possible', () => {
    const cmd = buildUnitTestCommand(['tests/a";rm -rf x.test.js']);
    expect(cmd).toContain('\\"'); // the inner quote is escaped
  });
});

describe('isFrontendPath / touchesFrontend (FR-2)', () => {
  it('classifies component / page / client / styling / e2e paths as frontend', () => {
    for (const f of [
      'src/components/Foo.tsx',
      'src/pages/Home.jsx',
      'src/app/App.vue',
      'client/index.html',
      'public/logo.svg',
      'styles/main.scss',
      'tests/e2e/login.spec.ts',
      'e2e/checkout.spec.js',
      'playwright.config.ts',
    ]) {
      expect(isFrontendPath(f), `${f} should be frontend`).toBe(true);
    }
  });

  it('classifies backend tooling / lib / non-frontend scripts as NOT frontend', () => {
    for (const f of [
      'lib/server-manager.js',
      'scripts/modules/complete-quick-fix/test-runner.js',
      'scripts/foo.mjs',
      'docs/readme.md',
      'package.json',
      'migrations/001_init.sql',
    ]) {
      expect(isFrontendPath(f), `${f} should NOT be frontend`).toBe(false);
    }
  });

  it('touchesFrontend is true if ANY file is frontend, false for all-backend', () => {
    expect(touchesFrontend(['lib/a.js', 'src/components/X.tsx'])).toBe(true);
    expect(touchesFrontend(['lib/a.js', 'scripts/b.mjs'])).toBe(false);
    expect(touchesFrontend([])).toBe(false);
    expect(touchesFrontend(undefined)).toBe(false);
  });

  it('handles backslash (Windows) separators', () => {
    expect(isFrontendPath('src\\components\\Foo.tsx')).toBe(true);
    expect(isFrontendPath('lib\\server-manager.js')).toBe(false);
  });
});

describe('getRelatedSourceFiles', () => {
  it('keeps JS/TS source files and drops test/non-source files', () => {
    const changed = [
      'lib/foo.js', 'scripts/bar.mjs',
      'lib/foo.test.js', 'tests/unit/baz.test.js', 'src/x.spec.ts', // tests → dropped
      'docs/readme.md', 'package.json', // non-source → dropped
    ];
    expect(getRelatedSourceFiles(changed)).toEqual(['lib/foo.js', 'scripts/bar.mjs']);
  });
  it('returns [] for a test-only or docs-only diff', () => {
    expect(getRelatedSourceFiles(['lib/foo.test.js'])).toEqual([]);
    expect(getRelatedSourceFiles(['docs/readme.md'])).toEqual([]);
    expect(getRelatedSourceFiles(undefined)).toEqual([]);
  });
});

describe('sourceBasename + candidateTestPaths (TR-2)', () => {
  it('sourceBasename strips directory and source extension', () => {
    expect(sourceBasename('lib/foo.js')).toBe('foo');
    expect(sourceBasename('a/b/c.mjs')).toBe('c');
    expect(sourceBasename('x.tsx')).toBe('x');
  });
  it('candidateTestPaths returns co-located + __tests__ .test.js siblings', () => {
    expect(candidateTestPaths('lib/foo.js')).toEqual(['lib/foo.test.js', 'lib/__tests__/foo.test.js']);
  });
});

describe('getScopedUnitTestFiles (FR-1, TR-2) — fs fixture', () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'cqf-scope-'));
    mkdirSync(path.join(dir, 'lib', '__tests__'), { recursive: true });
    mkdirSync(path.join(dir, 'tests', 'unit'), { recursive: true });
    writeFileSync(path.join(dir, 'lib', 'foo.js'), 'export const x=1;');
    writeFileSync(path.join(dir, 'lib', 'foo.test.js'), ''); // co-located sibling
    writeFileSync(path.join(dir, 'lib', 'bar.js'), 'export const y=1;'); // no test
    writeFileSync(path.join(dir, 'lib', 'baz.js'), '');
    writeFileSync(path.join(dir, 'lib', '__tests__', 'baz.test.js'), ''); // __tests__ sibling
    writeFileSync(path.join(dir, 'tests', 'unit', 'changed.test.js'), '');
  });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it('resolves a co-located sibling test for a changed source file', () => {
    expect(getScopedUnitTestFiles(['lib/foo.js'], dir)).toEqual(['lib/foo.test.js']);
  });
  it('resolves a __tests__ sibling test', () => {
    expect(getScopedUnitTestFiles(['lib/baz.js'], dir)).toContain('lib/__tests__/baz.test.js');
  });
  it('includes a changed *.test.js file directly (rule 1)', () => {
    expect(getScopedUnitTestFiles(['tests/unit/changed.test.js'], dir)).toEqual(['tests/unit/changed.test.js']);
  });
  it('returns [] (coverage gap) when a source file has no associated unit test', () => {
    expect(getScopedUnitTestFiles(['lib/bar.js'], dir)).toEqual([]);
  });
  it('returns [] for an empty / non-array diff', () => {
    expect(getScopedUnitTestFiles([], dir)).toEqual([]);
    expect(getScopedUnitTestFiles(undefined, dir)).toEqual([]);
  });
  it('does not include a candidate path that does not exist on disk', () => {
    // lib/foo.js sibling exists, but a non-existent source yields nothing
    expect(getScopedUnitTestFiles(['lib/nope.js'], dir)).toEqual([]);
  });
});

describe('runTests — scoped zero-execution guard (RCA a15122006891b019b)', () => {
  beforeEach(() => {
    execSyncMock = vi.fn();
  });

  it('treats exit-0 with zero executed tests as non-pass when testFiles were scoped', () => {
    // Simulates vitest exiting 0 with no "Tests: N passed" summary line at all
    // (the false-pass this RCA closes, previously masked by --passWithNoTests).
    execSyncMock.mockReturnValue('No test files found, exiting with code 0\n');
    const result = runTests('unit', { testFiles: ['tests/unit/quarantined.test.js'] });
    expect(result.passed).toBe(false);
    expect(result.summary.total).toBe(0);
    expect(result.falseVerificationGuard).toMatch(/zero executed tests/);
  });

  it('is a real pass when a scoped run actually executes tests', () => {
    execSyncMock.mockReturnValue('Tests: 3 passed (3)\n');
    const result = runTests('unit', { testFiles: ['tests/unit/real.test.js'] });
    expect(result.passed).toBe(true);
    expect(result.summary.total).toBe(3);
    expect(result.falseVerificationGuard).toBeUndefined();
  });

  it('does not apply the guard to a whole-suite run (no testFiles)', () => {
    // Zero executed tests with no scoped files is not this class of bug — leave as-is.
    execSyncMock.mockReturnValue('No test files found, exiting with code 0\n');
    const result = runTests('unit', {});
    expect(result.passed).toBe(true);
    expect(result.falseVerificationGuard).toBeUndefined();
  });

  it('does not apply the guard to e2e runs', () => {
    execSyncMock.mockReturnValue('0 passed\n');
    const result = runTests('e2e', { testFiles: ['tests/e2e/foo.spec.ts'] });
    expect(result.passed).toBe(true);
    expect(result.falseVerificationGuard).toBeUndefined();
  });
});
