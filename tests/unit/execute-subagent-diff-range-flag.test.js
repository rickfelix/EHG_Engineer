/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-8)
 *
 * Mirrors execute-subagent-phase-flag.test.js: --diff-range must be parsed as an explicit
 * string-valued flag (like --phase/--validation-mode), never coerced to boolean true by the
 * generic --foo fallthrough.
 */

import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../scripts/execute-subagent.js';

function withArgv(args, fn) {
  const original = process.argv;
  process.argv = ['node', 'execute-subagent.js', ...args];
  try {
    return fn();
  } finally {
    process.argv = original;
  }
}

describe('execute-subagent.js parseArgs --diff-range flag', () => {
  it('parses an explicit --diff-range value as a string, not a boolean', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--diff-range', 'abc1234~1..abc1234'],
      () => parseArgs()
    );
    expect(parsed.options.diff_range).toBe('abc1234~1..abc1234');
    expect(typeof parsed.options.diff_range).toBe('string');
  });

  it('leaves options.diff_range unset when omitted', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001'],
      () => parseArgs()
    );
    expect(parsed.options.diff_range).toBeUndefined();
  });

  it('does not coerce a trailing --diff-range with no value into boolean true', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--diff-range'],
      () => parseArgs()
    );
    expect(parsed.options.diff_range).not.toBe(true);
    expect(parsed.options.diff_range).toBeNull();
  });
});
