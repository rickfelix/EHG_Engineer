import { describe, it, expect } from 'vitest';
import { deriveRulesFromGitLog, parseAddedFiles, DEFAULT_MIN_COMMITS } from './derive-rules.js';

const SAMPLE_LOG = [
  'scripts/migration-2024-01.sql',
  '',
  'scripts/migration-2024-02.sql',
  '',
  'scripts/migration-2024-03.sql',
  '',
  'scripts/migration-2024-04.sql',
  '',
  'scripts/oneoff.js',
  '',
  'docs/plans/archived/sd-foo-plan.md',
  'docs/plans/archived/sd-bar-plan.md'
].join('\n');

describe('parseAddedFiles', () => {
  it('returns one entry per non-empty line, normalised', () => {
    const paths = parseAddedFiles('a/b.js\n\n c\\d.js\n');
    expect(paths).toEqual(['a/b.js', 'c/d.js']);
  });

  it('returns empty array for empty input', () => {
    expect(parseAddedFiles('')).toEqual([]);
    expect(parseAddedFiles(undefined)).toEqual([]);
  });
});

describe('deriveRulesFromGitLog', () => {
  it('suggests rule for recurring scripts/migration-*.sql pattern', () => {
    const suggestions = deriveRulesFromGitLog({ rawLog: SAMPLE_LOG });
    const migration = suggestions.find(s => s.pattern === 'scripts/*.sql');
    expect(migration).toBeDefined();
    expect(migration.category).toBe('commit');
    expect(migration.occurrences).toBe(4);
  });

  it('honours minCommits floor (1 prior commit excluded)', () => {
    const suggestions = deriveRulesFromGitLog({ rawLog: SAMPLE_LOG });
    const oneoff = suggestions.find(s => s.pattern === 'scripts/*.js');
    expect(oneoff).toBeUndefined();
  });

  it('never returns delete category', () => {
    const suggestions = deriveRulesFromGitLog({ rawLog: SAMPLE_LOG });
    expect(suggestions.every(s => s.category === 'commit')).toBe(true);
  });

  it('returns empty array on git failure', () => {
    expect(deriveRulesFromGitLog({ repoPath: '/nonexistent/path-does-not-exist' })).toEqual([]);
  });

  it('orders suggestions by occurrences descending', () => {
    const suggestions = deriveRulesFromGitLog({ rawLog: SAMPLE_LOG, minCommits: 2 });
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].occurrences).toBeGreaterThanOrEqual(suggestions[i].occurrences);
    }
  });

  it('respects custom minCommits override', () => {
    const suggestions = deriveRulesFromGitLog({ rawLog: SAMPLE_LOG, minCommits: 5 });
    expect(suggestions).toHaveLength(0);
  });

  it('default minCommits matches DEFAULT_MIN_COMMITS', () => {
    expect(DEFAULT_MIN_COMMITS).toBe(2);
  });
});
