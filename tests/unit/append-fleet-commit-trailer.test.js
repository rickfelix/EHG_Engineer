/**
 * Regression test for QF-20260703-311: fleet commits are unattributable because
 * every session shares the same git author identity. This script appends a
 * Fleet-Worker/Claude-Session trailer to the commit message so peer commits are
 * attributable without changing the author identity GitHub uses.
 *
 * SD-LEO-INFRA-STALE-INDEX-LOCK-001: the script no longer queries Supabase
 * (Promise.race + setTimeout, the measured root cause of a recurring Windows
 * libuv UV_HANDLE_CLOSING crash on process.exit(0)) -- it reads the
 * coordinator-maintained local fleet-identity cache
 * (<sharedRoot>/.claude/fleet-identity-<sessionId>.json) synchronously
 * instead. Tests below use real child_process spawns against real fixture
 * identity files (not mocks) so they measure the actual observable outcome
 * (exit code, commit-message content, wall-clock time), per prospective
 * TESTING review's explicit requirement that these tests not merely pin an
 * implementation detail.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
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

  it('leaves the message unchanged when no identity file exists for the session (fail-open, bad session id)', () => {
    const env = { ...process.env, CLAUDE_SESSION_ID: 'nonexistent-session-id-00000000' };
    execFileSync('node', [SCRIPT, msgFile], { env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result).toBe('test commit message\n');
  });

});

/**
 * FR-1/FR-4 (SD-LEO-INFRA-STALE-INDEX-LOCK-001): a real disposable git repo + worktree,
 * so shared-root resolution is exercised from a genuine worktree cwd, not simulated.
 * Identity fixtures are written into THIS temp repo's .claude/, never the real shared
 * .claude/ (which holds 530 live production identity files).
 */
describe('append-fleet-commit-trailer.js worktree-aware identity resolution', () => {
  let repoDir;
  let worktreeDir;
  let msgFile;
  const SESSION_ID = 'test-session-worktree-resolution-0001';

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'fleet-trailer-repo-'));
    execFileSync('git', ['init', '-q'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
    writeFileSync(join(repoDir, 'README.md'), 'init\n');
    execFileSync('git', ['add', '.'], { cwd: repoDir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repoDir });

    worktreeDir = join(tmpdir(), `fleet-trailer-worktree-${Date.now()}`);
    execFileSync('git', ['worktree', 'add', '-q', worktreeDir, '-b', 'test-wt-branch'], { cwd: repoDir });

    msgFile = join(worktreeDir, 'COMMIT_EDITMSG');
    writeFileSync(msgFile, 'test commit message\n');
  });

  afterEach(() => {
    try { execFileSync('git', ['worktree', 'remove', '--force', worktreeDir], { cwd: repoDir }); } catch { /* best-effort */ }
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(worktreeDir, { recursive: true, force: true, maxRetries: 3 });
  });

  function writeIdentity(identity) {
    const identityDir = join(repoDir, '.claude');
    mkdirSync(identityDir, { recursive: true });
    writeFileSync(join(identityDir, `fleet-identity-${SESSION_ID}.json`), JSON.stringify(identity));
  }

  it('is idempotent: running twice against an already-stamped message never double-stamps (real identity file, genuinely reaches the guard)', () => {
    writeIdentity({ color: 'cyan', callsign: 'Alpha', display_name: 'Alpha' });
    writeFileSync(msgFile, 'test commit message\n\nFleet-Worker: Alpha\nClaude-Session: test-session-worktree-resolution-0001\n');
    const env = { ...process.env, CLAUDE_SESSION_ID: SESSION_ID };
    execFileSync('node', [SCRIPT, msgFile], { cwd: worktreeDir, env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result.match(/Fleet-Worker:/g).length).toBe(1);
  });

  it('resolves the SHARED ROOT identity file when invoked from a worktree cwd, not the worktree\'s own (empty) .claude/', () => {
    writeIdentity({ color: 'cyan', callsign: 'Golf-3', display_name: 'Golf-3' });
    const env = { ...process.env, CLAUDE_SESSION_ID: SESSION_ID };
    execFileSync('node', [SCRIPT, msgFile], { cwd: worktreeDir, env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result).toContain('Fleet-Worker: Golf-3');
    expect(result).toContain(`Claude-Session: ${SESSION_ID}`);
  });

  it('still stamps correctly when invoked from the shared checkout directly (non-worktree regression check)', () => {
    writeIdentity({ color: 'cyan', callsign: 'Golf-3', display_name: 'Golf-3' });
    const env = { ...process.env, CLAUDE_SESSION_ID: SESSION_ID };
    const sharedMsgFile = join(repoDir, 'COMMIT_EDITMSG');
    writeFileSync(sharedMsgFile, 'test commit message\n');
    execFileSync('node', [SCRIPT, sharedMsgFile], { cwd: repoDir, env });
    const result = readFileSync(sharedMsgFile, 'utf8');
    expect(result).toContain('Fleet-Worker: Golf-3');
  });

  it('stamps a role-seat identity (role:true) unchanged from original behavior — no new exclusion', () => {
    writeIdentity({ color: 'purple', callsign: 'Coordinator', display_name: 'Coordinator', role: true });
    const env = { ...process.env, CLAUDE_SESSION_ID: SESSION_ID };
    execFileSync('node', [SCRIPT, msgFile], { cwd: worktreeDir, env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result).toContain('Fleet-Worker: Coordinator');
  });

  it('fails open (unmodified, exit 0) when the identity file is malformed JSON', () => {
    const identityDir = join(repoDir, '.claude');
    mkdirSync(identityDir, { recursive: true });
    writeFileSync(join(identityDir, `fleet-identity-${SESSION_ID}.json`), '{not valid json');
    const env = { ...process.env, CLAUDE_SESSION_ID: SESSION_ID };
    execFileSync('node', [SCRIPT, msgFile], { cwd: worktreeDir, env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result).toBe('test commit message\n');
  });

  it('fails open when the identity file exists but has no callsign field', () => {
    writeIdentity({ color: 'cyan', display_name: 'no callsign here' });
    const env = { ...process.env, CLAUDE_SESSION_ID: SESSION_ID };
    execFileSync('node', [SCRIPT, msgFile], { cwd: worktreeDir, env });
    const result = readFileSync(msgFile, 'utf8');
    expect(result).toBe('test commit message\n');
  });

  it('completes in well under 1 second wall-clock (no network round-trip) -- catches any future reintroduction of a network call', () => {
    writeIdentity({ color: 'cyan', callsign: 'Golf-3', display_name: 'Golf-3' });
    const env = { ...process.env, CLAUDE_SESSION_ID: SESSION_ID };
    const start = Date.now();
    execFileSync('node', [SCRIPT, msgFile], { cwd: worktreeDir, env });
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(1000);
  });

  it('grep-verified: the script source contains no reference to supabase, setTimeout, or Promise.race in live code (FR-1)', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    // Strip block comments (the doc header legitimately narrates the removed mechanism)
    // before asserting on the remaining live code.
    const codeOnly = source.replace(/\/\*\*[\s\S]*?\*\//g, '');
    expect(codeOnly.toLowerCase()).not.toContain('supabase');
    expect(codeOnly).not.toContain('setTimeout');
    expect(codeOnly).not.toContain('Promise.race');
  });
});
