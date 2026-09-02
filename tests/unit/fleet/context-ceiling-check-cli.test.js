/**
 * SD-FDBK-INFRA-COORDINATION-VOLUME-DEGRADES-001 FR-3 -- integration test for the
 * role-agnostic CLI wrapper scripts/context-ceiling-check.mjs (spawned as a real subprocess,
 * since it is a thin argv/env-driven entrypoint rather than an importable module). The
 * underlying checkContextCeiling logic itself is unit-tested in context-ceiling-checker.test.js.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const CLI = path.resolve(__dirname, '../../../scripts/context-ceiling-check.mjs');

function run(args, env = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ? err.stdout.toString() : '', stderr: err.stderr ? err.stderr.toString() : '' };
  }
}

describe('context-ceiling-check.mjs CLI', () => {
  it('exits non-zero with usage text when --role is missing', () => {
    const result = run([]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
  });

  it('exits non-zero when no session id is available (no --session-id, no CLAUDE_SESSION_ID)', () => {
    const result = run(['--role', 'solomon'], { CLAUDE_SESSION_ID: '' });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('No session id');
  });

  it('prints a DISABLED verdict (default-OFF enforcement flag) with --session-id supplied', () => {
    const result = run(['--role', 'solomon', '--session-id', 'test-session-cli'], { COORD_CONTEXT_CEILING_ENFORCE_V1: '' });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('CONTEXT_CEILING_CHECK role=solomon verdict=DISABLED');
  });

  it('falls back to CLAUDE_SESSION_ID from the environment when --session-id is omitted', () => {
    const result = run(['--role', 'coordinator'], { CLAUDE_SESSION_ID: 'env-session-id', COORD_CONTEXT_CEILING_ENFORCE_V1: '' });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('verdict=DISABLED');
  });

  it('--json prints a JSON verdict object instead of the human-readable line', () => {
    const result = run(['--role', 'solomon', '--session-id', 'test-session-cli', '--json'], { COORD_CONTEXT_CEILING_ENFORCE_V1: '' });
    expect(result.code).toBe(0);
    // The environment's dotenvx preload can print its own "◇ injected env" line to stdout
    // ahead of the CLI's own output (seen throughout this repo's node invocations) -- take
    // the LAST non-empty line, which is always this script's own printed verdict.
    const lines = result.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(JSON.parse(lines[lines.length - 1])).toEqual({ verdict: 'DISABLED' });
  });
});
