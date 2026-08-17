/**
 * QF-20260816-687 — READ_ONLY_LEADING_RE allowlisted bare `find` as provably read-only, but
 * find's own primaries (-delete, -exec, -execdir, -ok, -okdir) can mutate the filesystem
 * without ever emitting a shell metacharacter MUTATION_OPERATOR_RE would catch: `find . -delete`
 * and `find . -exec rm -f {} +` (the `+` terminator batches invocations with no per-match `;`,
 * unlike `\;`) both contain zero chained/redirect operators, so isReadOnlyCommand wrongly
 * returned true — and a command classified read-only resets the 3-strikes retry counter to 0
 * every invocation (recordAndCount's Control 1+2 branch), letting a destructive find loop
 * evade the guard entirely (ULTRAREVIEW A2 bug_011).
 *
 * A2 ultrareview #7065 bug_011.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isReadOnlyCommand } = require('../../scripts/hooks/retry-state-manager.cjs');

describe('isReadOnlyCommand — find destructive primaries (QF-20260816-687)', () => {
  it('find . -delete → NOT read-only (the exact QF repro)', () => {
    expect(isReadOnlyCommand('find . -delete')).toBe(false);
  });

  it('find . -type f -exec rm -f {} + → NOT read-only (+ terminator, no semicolon at all)', () => {
    expect(isReadOnlyCommand('find . -type f -exec rm -f {} +')).toBe(false);
  });

  it('find . -exec rm {} \\; → NOT read-only (escaped-semicolon terminator)', () => {
    expect(isReadOnlyCommand('find . -exec rm {} \\;')).toBe(false);
  });

  it('find . -execdir rm {} + → NOT read-only', () => {
    expect(isReadOnlyCommand('find . -execdir rm {} +')).toBe(false);
  });

  it('find . -ok rm {} \\; → NOT read-only (interactive-confirm variant, still mutating)', () => {
    expect(isReadOnlyCommand('find . -ok rm {} \\;')).toBe(false);
  });

  // Adversarial review (PR #7185): the \; form above contains a literal semicolon, so it's
  // rejected by the PRE-EXISTING MUTATION_OPERATOR_RE check before ever reaching the new
  // lookahead — it doesn't actually prove the `-ok` alternative in the lookahead itself works.
  // This metacharacter-free form (a valid regex-classifier input regardless of whether real
  // GNU find accepts `-ok ... {} +` in practice) reaches and exercises the lookahead directly.
  it('find . -ok rm {} + → NOT read-only, via the lookahead itself (no semicolon to pre-empt it)', () => {
    expect(isReadOnlyCommand('find . -ok rm {} +')).toBe(false);
  });

  it('find . -okdir rm {} + → NOT read-only', () => {
    expect(isReadOnlyCommand('find . -okdir rm {} +')).toBe(false);
  });

  // Adversarial review (PR #7185): -delete/-exec[dir]/-ok[dir] alone still missed find's -f*
  // WRITE primaries — -fprint/-fprint0/-fls write to a named file argument, and -fprintf
  // additionally accepts a caller-controlled format string — all with zero shell
  // metacharacters, the exact same bypass class this QF exists to close.
  it('find / -fprintf /home/user/.bashrc "%p\\n" → NOT read-only (writes an arbitrary file with a caller-controlled format string)', () => {
    expect(isReadOnlyCommand('find / -fprintf /home/user/.bashrc "%p\\n"')).toBe(false);
  });

  it('find . -fprint out.txt → NOT read-only (writes to a named file)', () => {
    expect(isReadOnlyCommand('find . -fprint out.txt')).toBe(false);
  });

  it('find . -fprint0 out.txt → NOT read-only', () => {
    expect(isReadOnlyCommand('find . -fprint0 out.txt')).toBe(false);
  });

  it('find . -fls out.txt → NOT read-only', () => {
    expect(isReadOnlyCommand('find . -fls out.txt')).toBe(false);
  });

  it('find . -name x → STILL read-only (the exact QF acceptance case — common usage unaffected)', () => {
    expect(isReadOnlyCommand('find . -name x')).toBe(true);
  });

  it('find /tmp -mtime +7 -type f → STILL read-only (a realistic listing query)', () => {
    expect(isReadOnlyCommand('find /tmp -mtime +7 -type f')).toBe(true);
  });

  it('find . -delete somewhere mid-command still evades if a leading verb changes — sanity: the flag can appear anywhere after find', () => {
    // Not a realistic find invocation, but proves the lookahead scans the WHOLE command,
    // not just immediately after the verb (find's flags can appear in any order/position).
    expect(isReadOnlyCommand('find . -type f -name "*.tmp" -delete')).toBe(false);
  });
});
