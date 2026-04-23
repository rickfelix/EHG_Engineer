/**
 * Unit tests for lib/session-writer.cjs
 * Part of SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sessionWriter = require('../../../lib/session-writer.cjs');
const { resolveCurrentBranch, stampBranch } = sessionWriter;

function makeGitRepoWithBranch(branchName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-writer-test-'));
  execSync('git init --initial-branch=' + branchName, { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email test@test && git config user.name test', { cwd: dir, stdio: 'pipe' });
  // Need at least one commit for abbrev-ref to report the branch name reliably on some git versions
  fs.writeFileSync(path.join(dir, 'x.txt'), 'seed');
  execSync('git add x.txt && git commit -m seed', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('resolveCurrentBranch', () => {
  let tmpDir;
  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('returns branch name when cwd is inside a git working tree', () => {
    tmpDir = makeGitRepoWithBranch('feat/example');
    expect(resolveCurrentBranch(tmpDir)).toBe('feat/example');
  });

  it('returns null for a directory that is not a git working tree', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-writer-nongit-'));
    expect(resolveCurrentBranch(tmpDir)).toBeNull();
  });

  it('returns null for detached HEAD (maps literal "HEAD" to null)', () => {
    tmpDir = makeGitRepoWithBranch('main');
    const sha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf8' }).trim();
    execSync(`git checkout ${sha} --detach`, { cwd: tmpDir, stdio: 'pipe' });
    expect(resolveCurrentBranch(tmpDir)).toBeNull();
  });
});

describe('stampBranch', () => {
  let tmpDir;
  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('adds current_branch when resolvable and payload omits it', () => {
    tmpDir = makeGitRepoWithBranch('feat/stamp');
    const out = stampBranch({ heartbeat_at: 'now' }, tmpDir);
    expect(out.current_branch).toBe('feat/stamp');
    expect(out.heartbeat_at).toBe('now');
  });

  it('preserves explicitly-set current_branch — does not overwrite', () => {
    tmpDir = makeGitRepoWithBranch('feat/git-branch');
    const out = stampBranch({ current_branch: 'caller-chose-this', heartbeat_at: 'now' }, tmpDir);
    expect(out.current_branch).toBe('caller-chose-this');
  });

  it('leaves payload unchanged when resolution fails', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-writer-nongit-'));
    const out = stampBranch({ heartbeat_at: 'now' }, tmpDir);
    expect(out).not.toHaveProperty('current_branch');
    expect(out.heartbeat_at).toBe('now');
  });

  it('returns a new object (does not mutate input)', () => {
    tmpDir = makeGitRepoWithBranch('main');
    const input = { heartbeat_at: 'now' };
    const out = stampBranch(input, tmpDir);
    expect(input).not.toHaveProperty('current_branch');
    expect(out).not.toBe(input);
  });

  it('tolerates null or non-object payload', () => {
    tmpDir = makeGitRepoWithBranch('main');
    expect(stampBranch(null, tmpDir).current_branch).toBe('main');
    expect(stampBranch(undefined, tmpDir).current_branch).toBe('main');
    expect(stampBranch('not-an-object', tmpDir).current_branch).toBe('main');
  });
});
