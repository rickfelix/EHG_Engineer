/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-8)
 *
 * parseDiffRange is the sole gate between an operator-supplied --diff-range CLI value and a
 * shell command string (execSync in lib/sub-agents/testing/index.js) -- an unvalidated value
 * would be a command injection vector, so every rejection case here is a security control,
 * not just input hygiene.
 */
import { describe, it, expect } from 'vitest';
import { parseDiffRange } from '../../../../lib/sub-agents/testing/diff-range.js';

describe('parseDiffRange (FR-8)', () => {
  it('accepts a well-formed sha~1..sha range', () => {
    expect(parseDiffRange('abc1234~1..abc1234')).toBe('abc1234~1..abc1234');
  });

  it('accepts a branch-name..branch-name range', () => {
    expect(parseDiffRange('main..feat/foo-001')).toBe('main..feat/foo-001');
  });

  it('trims surrounding whitespace', () => {
    expect(parseDiffRange('  abc..def  ')).toBe('abc..def');
  });

  it('returns null for missing/non-string input', () => {
    expect(parseDiffRange(undefined)).toBeNull();
    expect(parseDiffRange(null)).toBeNull();
    expect(parseDiffRange('')).toBeNull();
    expect(parseDiffRange(true)).toBeNull();
  });

  it('returns null when there is no ".." separator', () => {
    expect(parseDiffRange('abc1234')).toBeNull();
  });

  it('returns null when either side is empty', () => {
    expect(parseDiffRange('..abc')).toBeNull();
    expect(parseDiffRange('abc..')).toBeNull();
  });

  it('rejects shell metacharacters (command injection attempt)', () => {
    expect(parseDiffRange('abc..def; rm -rf /')).toBeNull();
    expect(parseDiffRange('abc..$(whoami)')).toBeNull();
    expect(parseDiffRange('abc..`whoami`')).toBeNull();
    expect(parseDiffRange('abc..def && echo pwned')).toBeNull();
    expect(parseDiffRange('abc..def | cat /etc/passwd')).toBeNull();
    expect(parseDiffRange('abc.. def')).toBeNull(); // embedded space
  });

  it('rejects a range with more than one ".." separator', () => {
    expect(parseDiffRange('abc..def..ghi')).toBeNull();
  });
});
