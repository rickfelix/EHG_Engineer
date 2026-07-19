/**
 * SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 (FR-4)
 *
 * scripts/execute-subagent.js's parseArgs() previously had no --phase flag;
 * any unrecognized `--foo` fell through to the generic boolean-flag branch,
 * so a naive `--phase EXEC` would have set options.phase = true (dropping
 * the string value) rather than options.phase = 'EXEC'. This pins the fix:
 * --phase is parsed as an explicit string-valued flag, consistent with
 * --sd-id / --prd-id / --table-name.
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

describe('execute-subagent.js parseArgs --phase flag', () => {
  it('parses an explicit --phase value as a string, not a boolean', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--phase', 'EXEC_TO_PLAN'],
      () => parseArgs()
    );
    expect(parsed.options.phase).toBe('EXEC_TO_PLAN');
    expect(typeof parsed.options.phase).toBe('string');
  });

  it('leaves options.phase unset when --phase is omitted (backstop derivation applies downstream)', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001'],
      () => parseArgs()
    );
    expect(parsed.options.phase).toBeUndefined();
  });

  it('does not coerce a trailing --phase with no value into boolean true', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--phase'],
      () => parseArgs()
    );
    expect(parsed.options.phase).not.toBe(true);
    expect(parsed.options.phase).toBeNull();
  });

  it('other unrecognized flags still fall through to the boolean branch unaffected', () => {
    const parsed = withArgv(
      ['--code', 'TESTING', '--sd-id', 'SD-TEST-001', '--full-e2e'],
      () => parseArgs()
    );
    expect(parsed.options.full_e2e).toBe(true);
  });
});
