/**
 * QF-20260807-359 — shared fail-closed argv guard, extracted from QF-20260807-289.
 *
 * The defect being pinned: a state-mutating script that IGNORES an unknown flag runs when
 * you asked it a question. safe-root-resync.mjs was invoked with `--help`, silently ignored
 * it, cleared a stale index.lock and evaluated a resync. handoff.js had the same shape when
 * `--precheck` no-op'd into a REAL transition.
 */
import { describe, it, expect } from 'vitest';
import { findUnknownFlags, formatUnknownFlagError } from '../../lib/argv-guard.mjs';

const KNOWN = new Set(['--clean-untracked', '--confirm-clean', '--help']);

describe('findUnknownFlags — long flags', () => {
  it('accepts documented flags', () => {
    expect(findUnknownFlags(['--clean-untracked', '--confirm-clean'], KNOWN)).toEqual([]);
  });

  it('rejects an undocumented flag', () => {
    expect(findUnknownFlags(['--dry-run'], KNOWN)).toEqual(['--dry-run']);
  });

  it('never mistakes a flag VALUE for a flag', () => {
    expect(findUnknownFlags(['--clean-untracked', 'origin/main'], KNOWN)).toEqual([]);
  });

  it('stops at a bare -- (end of options)', () => {
    expect(findUnknownFlags(['--', '--not-a-flag'], KNOWN)).toEqual([]);
  });

  it('matches --flag=value on its name half', () => {
    expect(findUnknownFlags(['--nope=1'], KNOWN)).toEqual(['--nope']);
    expect(findUnknownFlags(['--help=1'], KNOWN)).toEqual([]);
  });

  it('de-duplicates and preserves order', () => {
    expect(findUnknownFlags(['--b', '--a', '--b'], KNOWN)).toEqual(['--b', '--a']);
  });

  it('survives hostile input without throwing', () => {
    for (const args of [null, undefined, [null], [42], [{}], [[]]]) {
      expect(() => findUnknownFlags(args, KNOWN)).not.toThrow();
    }
  });
});

describe('singleDash — opt-in, and off by default ON PURPOSE', () => {
  // The default must stay off: turning it on globally would change handoff.js, the canonical
  // never-bypass script, as a side effect of a fix aimed at a different tool.
  it('IGNORES short flags by default', () => {
    expect(findUnknownFlags(['-h'], KNOWN)).toEqual([]);
  });

  it('catches them when opted in — this is the case that RAN the script', () => {
    expect(findUnknownFlags(['-h'], KNOWN, { singleDash: true })).toEqual(['-h']);
  });

  it('a lone dash is not a flag', () => {
    expect(findUnknownFlags(['-'], KNOWN, { singleDash: true })).toEqual([]);
  });

  it('still stops at a bare -- when opted in', () => {
    expect(findUnknownFlags(['--', '-h'], KNOWN, { singleDash: true })).toEqual([]);
  });

  it('a documented short flag would be accepted if a tool declared one', () => {
    expect(findUnknownFlags(['-v'], new Set(['-v']), { singleDash: true })).toEqual([]);
  });
});

describe('formatUnknownFlagError', () => {
  const base = { tool: 'safe-root-resync.mjs', knownFlags: KNOWN, nearMiss: new Map([['-h', '--help']]) };

  it('names the tool, the bad flag, and every documented flag', () => {
    const out = formatUnknownFlagError({ ...base, unknown: ['-h'] });
    expect(out).toContain('[safe-root-resync.mjs]');
    expect(out).toContain('-h');
    expect(out).toContain('--clean-untracked');
  });

  it('surfaces a near-miss suggestion when one exists', () => {
    expect(formatUnknownFlagError({ ...base, unknown: ['-h'] })).toContain('Did you mean: --help');
  });

  it('omits the suggestion line when no near-miss matches', () => {
    expect(formatUnknownFlagError({ ...base, unknown: ['--zzz'] })).not.toContain('Did you mean');
  });

  it('carries the per-tool rationale — "unknown flag" alone reads as pedantry', () => {
    const out = formatUnknownFlagError({ ...base, unknown: ['--zzz'], rationale: ['   NOTHING WAS EXECUTED.'] });
    expect(out).toContain('NOTHING WAS EXECUTED.');
  });

  it('pluralises and lists every unknown flag, not just the first', () => {
    const out = formatUnknownFlagError({ ...base, unknown: ['--a', '--b'] });
    expect(out).toContain('Unknown flags:');
    expect(out).toContain('--a, --b');
  });
});
