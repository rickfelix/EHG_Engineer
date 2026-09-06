/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-4)
 *
 * The scoped TESTING mode: resolveScopedSpecs (pure spec-selection), discoverSpecFiles
 * (recursive spec discovery), and runScopedE2ESuite (the orchestrating function, spawn-mocked
 * per the existing phase3-execution-spawn-cwd.test.js pattern). The core honesty contract under
 * test: a scoped run NEVER silently reads as full-suite-equivalent -- every result carries
 * {mode: 'scoped', touched_paths, included_specs, excluded_count}, and zero matching specs
 * short-circuits to an explicit scoped_no_matching_specs:true rather than spawning Playwright
 * with no positional args (which Playwright would interpret as "run everything").
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import path from 'path';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args) => spawnMock(...args)
}));

const { resolveScopedSpecs, discoverSpecFiles, runScopedE2ESuite } = await import('../../../lib/sub-agents/testing/phases/phase3-execution.js');

const scratchDirs = [];
function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-scoped-'));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  spawnMock.mockClear();
  while (scratchDirs.length) {
    const dir = scratchDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveScopedSpecs (pure)', () => {
  it('includes a spec file that is itself in touchedPaths', () => {
    const { included, excludedCount } = resolveScopedSpecs(
      ['tests/e2e/foo.spec.ts', 'src/unrelated.js'],
      ['tests/e2e/foo.spec.ts', 'tests/e2e/bar.spec.ts']
    );
    expect(included).toEqual(['tests/e2e/foo.spec.ts']);
    expect(excludedCount).toBe(1);
  });

  it('normalizes backslashes and leading ./ before comparing', () => {
    const { included } = resolveScopedSpecs(
      ['.\\tests\\e2e\\foo.spec.ts'],
      ['tests/e2e/foo.spec.ts']
    );
    expect(included).toEqual(['tests/e2e/foo.spec.ts']);
  });

  it('returns an empty included set when no touched path matches any spec (never guesses)', () => {
    const { included, excludedCount } = resolveScopedSpecs(
      ['src/some-component.tsx'],
      ['tests/e2e/foo.spec.ts', 'tests/e2e/bar.spec.ts']
    );
    expect(included).toEqual([]);
    expect(excludedCount).toBe(2);
  });
});

describe('discoverSpecFiles', () => {
  it('recursively finds *.spec.* files, ignoring non-spec files, relative to repoPath', () => {
    const repo = makeScratchRepo();
    const testDir = path.join(repo, 'tests', 'e2e');
    mkdirSync(path.join(testDir, 'nested'), { recursive: true });
    writeFileSync(path.join(testDir, 'top.spec.ts'), '// spec');
    writeFileSync(path.join(testDir, 'nested', 'deep.spec.js'), '// spec');
    writeFileSync(path.join(testDir, 'nested', 'helper.js'), '// not a spec');
    writeFileSync(path.join(testDir, 'README.md'), '# not a spec');

    const found = discoverSpecFiles(repo, testDir).sort();
    expect(found).toEqual(['tests/e2e/nested/deep.spec.js', 'tests/e2e/top.spec.ts']);
  });
});

describe('runScopedE2ESuite', () => {
  it('errors without spawning when repoPath is missing', async () => {
    const result = await runScopedE2ESuite('test-sd', ['tests/e2e/foo.spec.ts'], {});
    expect(result.error).toMatch(/repoPath/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('reports e2e_not_applicable without spawning when the repo has no E2E infra', async () => {
    const repo = makeScratchRepo();
    const result = await runScopedE2ESuite('test-sd', ['tests/e2e/foo.spec.ts'], { repoPath: repo });
    expect(result.e2e_not_applicable).toBe(true);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('short-circuits to scoped_no_matching_specs when no touched path matches a spec, never spawning with zero args', async () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'playwright.config.js'), 'module.exports = {};');
    mkdirSync(path.join(repo, 'tests', 'e2e'), { recursive: true });
    writeFileSync(path.join(repo, 'tests', 'e2e', 'foo.spec.ts'), '// spec');

    const result = await runScopedE2ESuite('test-sd', ['src/unrelated.js'], { repoPath: repo });
    expect(result.scoped_no_matching_specs).toBe(true);
    expect(result.mode).toBe('scoped');
    expect(result.included_specs).toEqual([]);
    expect(result.excluded_count).toBe(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('spawns Playwright with only the matched spec as a positional arg and records the extent', async () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'playwright.config.js'), 'module.exports = {};');
    mkdirSync(path.join(repo, 'tests', 'e2e'), { recursive: true });
    writeFileSync(path.join(repo, 'tests', 'e2e', 'foo.spec.ts'), '// spec');
    writeFileSync(path.join(repo, 'tests', 'e2e', 'bar.spec.ts'), '// spec');

    spawnMock.mockImplementation((_cmd, args, opts) => {
      expect(args).toContain('tests/e2e/foo.spec.ts');
      expect(args).not.toContain('tests/e2e/bar.spec.ts');
      const reportPath = opts.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, JSON.stringify({ stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 1 }, suites: [] }));
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0));
      return child;
    });

    const result = await runScopedE2ESuite('test-sd', ['tests/e2e/foo.spec.ts'], { repoPath: repo });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, , opts] = spawnMock.mock.calls[0];
    expect(opts.cwd).toBe(repo);
    expect(result.mode).toBe('scoped');
    expect(result.included_specs).toEqual(['tests/e2e/foo.spec.ts']);
    expect(result.excluded_count).toBe(1);
    expect(result.tests_executed).toBe(1);
    expect(result.tests_passed).toBe(1);
    expect(result.failed_tests).toBe(0);
  });
});
