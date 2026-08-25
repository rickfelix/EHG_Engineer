import { describe, it, expect } from 'vitest';
import { resolveRepoOrThrow } from '../../lib/audits/stage-census/repo-resolve.mjs';

// TS-5: sibling repo resolution failure must be loud (throw), never a silent empty-tree skip.
describe('resolveRepoOrThrow', () => {
  it('returns the path when resolveRepoPath resolves and the directory exists', () => {
    const path = resolveRepoOrThrow('ehg', {
      resolveRepoPath: () => '/fake/ehg',
      existsSync: () => true,
    });
    expect(path).toBe('/fake/ehg');
  });

  it('throws SIBLING_REPO_UNRESOLVED when resolveRepoPath returns null', () => {
    expect(() =>
      resolveRepoOrThrow('ehg', { resolveRepoPath: () => null, existsSync: () => true })
    ).toThrow(/SIBLING_REPO_UNRESOLVED/);
  });

  it('throws SIBLING_REPO_MISSING when the resolved path does not exist on disk', () => {
    expect(() =>
      resolveRepoOrThrow('ehg', { resolveRepoPath: () => '/fake/ehg', existsSync: () => false })
    ).toThrow(/SIBLING_REPO_MISSING/);
  });

  it('never returns a falsy path silently', () => {
    expect(() =>
      resolveRepoOrThrow('ehg', { resolveRepoPath: () => undefined, existsSync: () => true })
    ).toThrow();
  });
});
