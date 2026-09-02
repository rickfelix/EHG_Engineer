/**
 * QF-20260902-796
 *
 * scripts/execute-subagent.js's parseArgs() had no dedicated --validation-mode branch, so it
 * fell through to the generic boolean-flag coercion: `--validation-mode retrospective` set
 * options.validation_mode = true (dropping the string), which adaptive-validation.js then
 * rejected with "Invalid validation_mode: true" -- the documented manual override never
 * actually reached detectValidationMode(). Mirrors the --phase fix (same defect class).
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

describe('execute-subagent.js parseArgs --validation-mode flag', () => {
  it('parses an explicit --validation-mode value as a string, not a boolean', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--validation-mode', 'retrospective'],
      () => parseArgs()
    );
    expect(parsed.options.validation_mode).toBe('retrospective');
    expect(typeof parsed.options.validation_mode).toBe('string');
  });

  it('does not coerce a trailing --validation-mode with no value into boolean true', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--validation-mode'],
      () => parseArgs()
    );
    expect(parsed.options.validation_mode).not.toBe(true);
    expect(parsed.options.validation_mode).toBeNull();
  });

  it('leaves options.validation_mode unset when the flag is omitted', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001'],
      () => parseArgs()
    );
    expect(parsed.options.validation_mode).toBeUndefined();
  });
});
