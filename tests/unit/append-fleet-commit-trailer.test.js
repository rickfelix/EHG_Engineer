/**
 * Regression test for QF-20260703-311: fleet commits are unattributable because
 * every session shares the same git author identity. This script appends a
 * Fleet-Worker/Claude-Session trailer to the commit message so peer commits are
 * attributable without changing the author identity GitHub uses.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const SCRIPT = join(process.cwd(), 'scripts', 'append-fleet-commit-trailer.js');

describe('append-fleet-commit-trailer.js (QF-20260703-311)', () => {
  let dir;
  let msgFile;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fleet-trailer-test-'));
    msgFile = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(msgFile, 'test commit message\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('leaves the message unchanged when CLAUDE_SESSION_ID is unset (fail-open)', () => {
    const env = { ...process.env };
    delete env.CLAUDE_SESSION_ID;
    execFileSync('node', [SCRIPT, msgFile], { env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result).toBe('test commit message\n');
  });

  it('leaves the message unchanged when the session lookup finds nothing (fail-open, bad session id)', () => {
    const env = { ...process.env, CLAUDE_SESSION_ID: 'nonexistent-session-id-00000000' };
    execFileSync('node', [SCRIPT, msgFile], { env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result).toBe('test commit message\n');
  });

  it('is idempotent: running twice never double-stamps', () => {
    writeFileSync(msgFile, 'test commit message\n\nFleet-Worker: Alpha\nClaude-Session: abc-123\n');
    const env = { ...process.env, CLAUDE_SESSION_ID: 'abc-123' };
    execFileSync('node', [SCRIPT, msgFile], { env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result.match(/Fleet-Worker:/g).length).toBe(1);
  });
});
