/**
 * Unit tests for scripts/execute-stop.mjs argv parser.
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3)
 *
 * Pure-function test for parseArgs only. Full processTeam flow is exercised
 * by tests/integration/execute-stop.integration.test.js.
 */

import { describe, test, expect } from 'vitest';
import { parseArgs } from '../scripts/execute-stop.mjs';

describe('execute-stop.parseArgs', () => {
  test('default: --all is implied with no args', () => {
    const opts = parseArgs([]);
    expect(opts.all).toBe(true);
    expect(opts.team).toBeNull();
    expect(opts.callsign).toBeNull();
    expect(opts.gracePeriodSec).toBe(60);
    expect(opts.force).toBe(false);
  });

  test('--team <uuid>', () => {
    const opts = parseArgs(['--team', 'abc-123']);
    expect(opts.team).toBe('abc-123');
    expect(opts.all).toBe(false);
  });

  test('--callsign Alpha', () => {
    const opts = parseArgs(['--callsign', 'Alpha']);
    expect(opts.callsign).toBe('Alpha');
    expect(opts.all).toBe(false);
  });

  test('--all explicit', () => {
    const opts = parseArgs(['--all']);
    expect(opts.all).toBe(true);
  });

  test('--grace-period override', () => {
    const opts = parseArgs(['--grace-period', '120']);
    expect(opts.gracePeriodSec).toBe(120);
  });

  test('--force', () => {
    const opts = parseArgs(['--force']);
    expect(opts.force).toBe(true);
  });

  test('combination: --team + --grace-period + --force', () => {
    const opts = parseArgs(['--team', 't1', '--grace-period', '90', '--force']);
    expect(opts.team).toBe('t1');
    expect(opts.gracePeriodSec).toBe(90);
    expect(opts.force).toBe(true);
    expect(opts.all).toBe(false);
  });
});
