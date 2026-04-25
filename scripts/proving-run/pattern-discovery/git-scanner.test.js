import { describe, it, expect } from 'vitest';
import { parseGitLog, parsePathsOnly } from './git-scanner.js';

const ONELINE_OUTPUT = [
  'abc1234 feat: add foo',
  'src/foo.js',
  'src/foo.test.js',
  '',
  'def5678 fix: bar',
  'src/bar.js'
].join('\n');

describe('parseGitLog (oneline + name-only format)', () => {
  it('parses commit + files into structured objects', () => {
    const commits = parseGitLog(ONELINE_OUTPUT);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      hash: 'abc1234',
      subject: 'feat: add foo',
      files: ['src/foo.js', 'src/foo.test.js']
    });
    expect(commits[1]).toMatchObject({
      hash: 'def5678',
      subject: 'fix: bar',
      files: ['src/bar.js']
    });
  });

  it('returns empty array for empty input', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  it('skips file lines before any commit line is seen', () => {
    expect(parseGitLog('orphan/file.js\nanother.js')).toEqual([]);
  });
});

describe('parsePathsOnly (--pretty= format)', () => {
  it('returns one normalised path per non-empty line', () => {
    expect(parsePathsOnly('a/b.js\n\nc\\d.js\n')).toEqual(['a/b.js', 'c/d.js']);
  });

  it('returns empty array for falsy input', () => {
    expect(parsePathsOnly('')).toEqual([]);
    expect(parsePathsOnly(undefined)).toEqual([]);
    expect(parsePathsOnly(null)).toEqual([]);
  });

  it('strips surrounding whitespace per line', () => {
    expect(parsePathsOnly('  a.js  \n   b.js')).toEqual(['a.js', 'b.js']);
  });
});
