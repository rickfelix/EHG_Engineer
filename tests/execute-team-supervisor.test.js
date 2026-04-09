/**
 * Unit tests for execute-team.mjs (parseArgs + buildWorkerEnv)
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-004, TR-002, TR-003)
 *
 * Pure-function tests only — full supervisor lifecycle tested via dry-run + pilot.
 */

import { describe, test, expect } from 'vitest';
import { parseArgs, buildWorkerEnv } from '../scripts/execute-team.mjs';

describe('execute-team.parseArgs', () => {
  test('default: 3 workers, no track, real spawn', () => {
    const opts = parseArgs([]);
    expect(opts.workers).toBe(3);
    expect(opts.track).toBeNull();
    expect(opts.dryRun).toBe(false);
  });

  test('--workers 1 --dry-run', () => {
    const opts = parseArgs(['--workers', '1', '--dry-run']);
    expect(opts.workers).toBe(1);
    expect(opts.dryRun).toBe(true);
  });

  test('--track A', () => {
    const opts = parseArgs(['--track', 'A']);
    expect(opts.track).toBe('A');
  });

  test('--team-id sets explicit teamId', () => {
    const opts = parseArgs(['--team-id', 'abc-123']);
    expect(opts.teamId).toBe('abc-123');
  });
});

describe('execute-team.buildWorkerEnv', () => {
  test('strips SUPABASE_SERVICE_ROLE_KEY (Guardrail 8)', () => {
    const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret';
    try {
      const env = buildWorkerEnv(0, 'team-uuid', 'session-uuid');
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    } finally {
      if (original !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = original;
      else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  test('sets EXECUTE_TEAM_ID, EXECUTE_SLOT, EXECUTE_PARENT_SESSION', () => {
    const env = buildWorkerEnv(2, 'team-abc', 'parent-xyz');
    expect(env.EXECUTE_TEAM_ID).toBe('team-abc');
    expect(env.EXECUTE_SLOT).toBe('2');
    expect(env.EXECUTE_PARENT_SESSION).toBe('parent-xyz');
    expect(env.EXECUTE_AGENT).toBe('true');
  });

  test('handles null parent session', () => {
    const env = buildWorkerEnv(0, 'team-id', null);
    expect(env.EXECUTE_PARENT_SESSION).toBe('');
  });

  test('preserves other env vars', () => {
    process.env.SOMEVAR = 'preserved';
    try {
      const env = buildWorkerEnv(0, 't', 'p');
      expect(env.SOMEVAR).toBe('preserved');
    } finally {
      delete process.env.SOMEVAR;
    }
  });
});
