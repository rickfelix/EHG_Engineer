/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-3)
 *
 * Mirrors execute-subagent-diff-range-flag.test.js: --e2e-timeout-ms must be parsed as an
 * explicit numeric-valued flag (like --phase/--validation-mode/--diff-range), never coerced to
 * boolean true by the generic --foo fallthrough, and never a bare string when a number is
 * expected -- phase3-execution.js's `options.e2e_timeout_ms || DEFAULT_E2E_TIMEOUT_MS` treats
 * any truthy non-zero value as an override, so a string would silently "work" but break
 * downstream arithmetic (e.g. a setTimeout comparison) the moment it's used numerically.
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

describe('execute-subagent.js parseArgs --e2e-timeout-ms flag', () => {
  it('parses an explicit --e2e-timeout-ms value as a number', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--full-e2e', '--e2e-timeout-ms', '1800000'],
      () => parseArgs()
    );
    expect(parsed.options.e2e_timeout_ms).toBe(1800000);
    expect(typeof parsed.options.e2e_timeout_ms).toBe('number');
  });

  it('leaves options.e2e_timeout_ms unset when omitted', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--full-e2e'],
      () => parseArgs()
    );
    expect(parsed.options.e2e_timeout_ms).toBeUndefined();
  });

  it('does not coerce a trailing --e2e-timeout-ms with no value into boolean true', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--e2e-timeout-ms'],
      () => parseArgs()
    );
    expect(parsed.options.e2e_timeout_ms).not.toBe(true);
    expect(parsed.options.e2e_timeout_ms).toBeNull();
  });

  it('rejects a non-numeric value as null rather than passing through a string', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--e2e-timeout-ms', 'not-a-number'],
      () => parseArgs()
    );
    expect(parsed.options.e2e_timeout_ms).toBeNull();
  });

  it('rejects zero/negative values as null (a non-positive timeout is not a valid override)', () => {
    const parsedZero = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--e2e-timeout-ms', '0'],
      () => parseArgs()
    );
    expect(parsedZero.options.e2e_timeout_ms).toBeNull();

    const parsedNeg = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--e2e-timeout-ms', '-5'],
      () => parseArgs()
    );
    expect(parsedNeg.options.e2e_timeout_ms).toBeNull();
  });
});
