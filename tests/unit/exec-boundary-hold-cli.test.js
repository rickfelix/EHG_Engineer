/**
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-3): exec_boundary_hold CLI arg parser.
 */
import { describe, it, expect } from 'vitest';
import { parseExecBoundaryHoldArgs } from '../../scripts/exec-boundary-hold.js';

describe('parseExecBoundaryHoldArgs', () => {
  it('parses a set command with all flags', () => {
    const parsed = parseExecBoundaryHoldArgs([
      'set', 'SD-X', '--reason', 'waiting on B', '--owner', 'coordinator',
      '--review-at', '2026-08-01T00:00:00Z', '--release-condition', 'B ships',
    ]);
    expect(parsed).toMatchObject({
      showHelp: false, command: 'set', sdKey: 'SD-X',
      reason: 'waiting on B', owner: 'coordinator',
      reviewAt: '2026-08-01T00:00:00Z', releaseCondition: 'B ships',
    });
  });

  it('parses a clear command', () => {
    const parsed = parseExecBoundaryHoldArgs(['clear', 'SD-X', '--cleared-by', 'coordinator']);
    expect(parsed).toMatchObject({ showHelp: false, command: 'clear', sdKey: 'SD-X', clearedBy: 'coordinator' });
  });

  it('shows help with no args', () => {
    expect(parseExecBoundaryHoldArgs([])).toEqual({ showHelp: true });
  });

  it('shows help with --help', () => {
    expect(parseExecBoundaryHoldArgs(['--help'])).toEqual({ showHelp: true });
  });

  it('flags an unknown command', () => {
    const parsed = parseExecBoundaryHoldArgs(['bogus', 'SD-X']);
    expect(parsed.showHelp).toBe(true);
    expect(parsed.error).toMatch(/unknown command/);
  });
});
