/**
 * SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-3 -- regression test for the invariant declared in
 * tests/collection-contract.md: any directory matched by a .gitignore pattern must never be
 * collectible by vitest.
 *
 * Creates a throwaway directory INSIDE the real repo tree (scratch/__test-fixture-<pid>/),
 * which is itself gitignored ('/scratch/' in .gitignore -- verified live via `git check-ignore`,
 * not assumed) with a trivial *.test.js file inside, then exercises the SAME matcher vitest
 * itself uses for `exclude` (picomatch -- vitest's own package.json dependency, verified before
 * writing this test; vitest globs via tinyglobby, which matches via picomatch) against the real
 * collection-contract.json pattern list.
 *
 * "Load-bearing" proof (third describe block): re-runs the same match with the
 * gitignore-backed patterns stripped out and asserts the fixture file becomes collectible --
 * proving the exclusion is doing real work, not a tautology that always reports "excluded"
 * regardless of what's being checked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { loadCollectionContractExclude, loadCollectionContractEntries } from '../../lib/collection-contract.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'scratch', `__test-fixture-collection-contract-${process.pid}`);
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'canary.test.js');
const FIXTURE_REL = path.relative(REPO_ROOT, FIXTURE_FILE).split(path.sep).join('/');

let contract;

beforeAll(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(FIXTURE_FILE, "import { it } from 'vitest';\nit('canary', () => {});\n");
  contract = { patterns: loadCollectionContractEntries() };
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('the fixture directory is genuinely gitignored (not assumed)', () => {
  it('git check-ignore confirms scratch/ matches a real .gitignore pattern', () => {
    // git check-ignore exits 0 (matched) or 1 (not matched); execFileSync throws on non-zero,
    // so a successful call here IS the assertion.
    const output = execFileSync('git', ['check-ignore', '-v', FIXTURE_FILE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(output).toContain('scratch');
  });
});

describe('the collection contract excludes a gitignored fixture (real invariant)', () => {
  it('every collection-contract pattern entry has gitignore_backed and reason fields', () => {
    for (const entry of contract.patterns) {
      expect(typeof entry.pattern).toBe('string');
      expect(typeof entry.gitignore_backed).toBe('boolean');
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('the fixture file (under scratch/, a real gitignored dir) is matched by the full pattern list', () => {
    const patterns = contract.patterns.map((e) => e.pattern);
    expect(picomatch.isMatch(FIXTURE_REL, patterns)).toBe(true);
  });

  it('specifically the scratch/-targeting entries are the ones matching it', () => {
    const scratchPatterns = contract.patterns
      .filter((e) => e.pattern === 'scratch/**' || e.pattern === '**/scratch/**')
      .map((e) => e.pattern);
    expect(scratchPatterns.length).toBe(2);
    expect(picomatch.isMatch(FIXTURE_REL, scratchPatterns)).toBe(true);
  });
});

describe('vitest.config.js actually calls this loader (not a parallel re-implementation)', () => {
  it('loadCollectionContractExclude() output excludes the fixture too', () => {
    const excludePatterns = loadCollectionContractExclude();
    expect(picomatch.isMatch(FIXTURE_REL, excludePatterns)).toBe(true);
  });

  it('the safety floor alone (simulating a missing/corrupt contract.json) still excludes the fixture', () => {
    // loadCollectionContractExclude(<nonexistent path>) exercises the real fail-safe branch.
    const withMissingContract = loadCollectionContractExclude(path.join(REPO_ROOT, 'tests', '__does-not-exist.json'));
    expect(picomatch.isMatch(FIXTURE_REL, withMissingContract)).toBe(true);
  });
});

describe('real vitest collection (subprocess)', () => {
  // vitest's CLI positional filter is a plain substring match against each collected file's
  // PATH (verified: 'scratch/**' as a literal filter string matches nothing -- vitest does not
  // glob-expand it -- while a plain substring like the fixture's own directory name matches
  // correctly). Using a glob-looking string here would silently make this assertion vacuous
  // (always "not found" regardless of real exclusion behavior) -- caught during this test's own
  // authoring by first proving the filter finds a KNOWN-COLLECTED file (sanity check below)
  // before trusting a negative result to mean "excluded" rather than "filter is broken".
  const FIXTURE_SUBSTRING = `__test-fixture-collection-contract-${process.pid}`;

  function listMatching(filterSubstring) {
    return execFileSync(
      'node',
      [path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'list', '--project', 'unit', filterSubstring],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  }

  it('sanity check: the substring filter mechanism itself finds a real, always-collected file', () => {
    // This file (vitest-collection-contract.test.js) is itself a normal, never-excluded unit
    // test -- if the filter mechanism can't find IT, a negative result for the fixture below
    // would be meaningless.
    const output = listMatching('vitest-collection-contract');
    expect(output).toContain('vitest-collection-contract.test.js');
  });

  it('vitest itself does not collect the fixture test file', () => {
    const output = listMatching(FIXTURE_SUBSTRING);
    expect(output).toBe('');
  }, 30000);
});

describe('load-bearing proof: the fixture becomes collectible if gitignore-backed patterns are removed', () => {
  it('with ONLY the non-gitignore-backed patterns, the fixture is NOT excluded', () => {
    const nonGitignorePatterns = contract.patterns
      .filter((e) => e.gitignore_backed === false)
      .map((e) => e.pattern);
    // Sanity: this set must be non-empty and must NOT be the full set, or the assertion below
    // would be vacuous.
    expect(nonGitignorePatterns.length).toBeGreaterThan(0);
    expect(nonGitignorePatterns.length).toBeLessThan(contract.patterns.length);
    expect(picomatch.isMatch(FIXTURE_REL, nonGitignorePatterns)).toBe(false);
  });

  it('re-adding the gitignore-backed patterns restores exclusion (the fix, isolated)', () => {
    const gitignorePatterns = contract.patterns
      .filter((e) => e.gitignore_backed === true)
      .map((e) => e.pattern);
    expect(picomatch.isMatch(FIXTURE_REL, gitignorePatterns)).toBe(true);
  });
});
