import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scanForCoworkReferences, isAllowListed, ALLOW_LIST } from './cowork-retirement-grep.mjs';

const REPO_ROOT = path.resolve(process.cwd());

describe('isAllowListed', () => {
  it('allows the named michael-cowork files', () => {
    expect(isAllowListed('scripts/michael/import-cowork-memory.mjs')).toBe(true);
    expect(isAllowListed('lib/michael/cowork-write.mjs')).toBe(true);
  });
  it('allows anything under docs/michael/ as a whole prefix', () => {
    expect(isAllowListed('docs/michael/02-SPEC.md')).toBe(true);
    expect(isAllowListed('docs/michael/anything/nested.md')).toBe(true);
  });
  it('does not allow an arbitrary file', () => {
    expect(isAllowListed('docs/06_deployment/strategic-intake-pipeline-v1.md')).toBe(false);
    expect(isAllowListed('scripts/some-other-script.mjs')).toBe(false);
  });
});

describe('ALLOW_LIST — no rot', () => {
  it('every non-docs/michael allow-listed path resolves to a real file on disk', () => {
    const missing = ALLOW_LIST.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)));
    expect(missing).toEqual([]);
  });
  it('has no duplicate entries', () => {
    expect(new Set(ALLOW_LIST).size).toBe(ALLOW_LIST.length);
  });
});

describe('scanForCoworkReferences — synthetic tree (fsImpl injected, no real disk)', () => {
  function fakeFs(tree) {
    // tree: { '<abs-posix-path>': 'file contents' } — directories are inferred from the keys.
    const dirOf = (p) => path.posix.dirname(p);
    return {
      readdirSync(dir, opts) {
        const norm = String(dir).split(path.sep).join('/');
        const names = new Set();
        for (const p of Object.keys(tree)) {
          if (dirOf(p) === norm) names.add({ name: path.posix.basename(p), isDirectory: () => false, isFile: () => true });
        }
        // one level of subdirectory support
        for (const p of Object.keys(tree)) {
          const rel = path.posix.relative(norm, dirOf(p));
          if (rel && !rel.startsWith('..') && rel.split('/')[0]) {
            names.add({ name: rel.split('/')[0], isDirectory: () => true, isFile: () => false });
          }
        }
        if (opts && opts.withFileTypes) return [...names];
        return [...names].map((n) => n.name);
      },
      readFileSync(file) {
        const norm = String(file).split(path.sep).join('/');
        if (!(norm in tree)) throw new Error('ENOENT');
        return tree[norm];
      },
    };
  }

  it('reports zero violations when a hit exists only in an allow-listed file', () => {
    const tree = {
      '/repo/scripts/michael/import-cowork-memory.mjs': '// reads _Cowork on the host\n',
    };
    const result = scanForCoworkReferences('/repo', { fsImpl: fakeFs(tree), scanRoots: ['scripts'] });
    expect(result.violations).toEqual([]);
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('reports a violation for a synthetic non-allow-listed file — proves the check is real, not vacuous', () => {
    const tree = {
      '/repo/scripts/some-unrelated-script.mjs': 'const path = "C:/Users/rickf/Dropbox/_Cowork";\n',
    };
    const result = scanForCoworkReferences('/repo', { fsImpl: fakeFs(tree), scanRoots: ['scripts'] });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ file: 'scripts/some-unrelated-script.mjs', line: 1 });
  });

  it('finds nothing when no file references the pattern', () => {
    const tree = { '/repo/scripts/unrelated.mjs': 'no reference here\n' };
    const result = scanForCoworkReferences('/repo', { fsImpl: fakeFs(tree), scanRoots: ['scripts'] });
    expect(result.hits).toEqual([]);
    expect(result.violations).toEqual([]);
  });
});

describe('scanForCoworkReferences — real repo tree (vacuity guard)', () => {
  it('finds real hits confined to allow-listed files — a vacuous scan (zero hits anywhere) would also fail this', () => {
    const result = scanForCoworkReferences(REPO_ROOT);
    // The corrected predicate must find SOMETHING (the michael-cowork files themselves reference
    // _Cowork legitimately) — a broken walker that silently finds nothing everywhere would pass a
    // "zero violations" check trivially. Assert real signal exists.
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });
});
