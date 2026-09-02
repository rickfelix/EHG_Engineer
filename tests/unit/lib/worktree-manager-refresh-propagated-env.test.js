// QF-20260901-296: refreshPropagatedEnv re-copies a worktree .env from root when the root
// has rotated since the marker's stored hash, leaves unmarked/venture-owned files alone,
// and never uses mtime.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { refreshPropagatedEnv } from '../../../lib/worktree-manager.js';

let repoRoot;
let worktreePath;

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qf296-root-'));
  worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'qf296-wt-'));
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
  fs.rmSync(worktreePath, { recursive: true, force: true });
});

describe('refreshPropagatedEnv (QF-20260901-296)', () => {
  it('copies with a marker when the worktree has no .env yet', () => {
    fs.writeFileSync(path.join(repoRoot, '.env'), 'FOO=bar\n');
    const result = refreshPropagatedEnv(repoRoot, worktreePath);
    expect(result).toEqual({ refreshed: true, reason: 'missing' });
    const dest = fs.readFileSync(path.join(worktreePath, '.env'), 'utf8');
    expect(dest).toContain('FOO=bar');
    expect(dest).toMatch(/^# propagated-from-root sha256=[0-9a-f]{64}$/m);
  });

  it('re-copies when the root .env content has changed since the marker was written', () => {
    fs.writeFileSync(path.join(repoRoot, '.env'), 'SECRET=old\n');
    refreshPropagatedEnv(repoRoot, worktreePath);

    fs.writeFileSync(path.join(repoRoot, '.env'), 'SECRET=rotated\n');
    const result = refreshPropagatedEnv(repoRoot, worktreePath);

    expect(result).toEqual({ refreshed: true, reason: 'stale' });
    expect(fs.readFileSync(path.join(worktreePath, '.env'), 'utf8')).toContain('SECRET=rotated');
  });

  it('is a no-op when the marked worktree .env already matches root', () => {
    fs.writeFileSync(path.join(repoRoot, '.env'), 'SECRET=same\n');
    refreshPropagatedEnv(repoRoot, worktreePath);

    const result = refreshPropagatedEnv(repoRoot, worktreePath);
    expect(result).toEqual({ refreshed: false, reason: 'current' });
  });

  it('leaves an unmarked .env alone even if root has since changed', () => {
    fs.writeFileSync(path.join(repoRoot, '.env'), 'SECRET=root\n');
    fs.writeFileSync(path.join(worktreePath, '.env'), 'VENTURE_OWN=value\n');

    const result = refreshPropagatedEnv(repoRoot, worktreePath);
    expect(result).toEqual({ refreshed: false, reason: 'unmarked' });
    expect(fs.readFileSync(path.join(worktreePath, '.env'), 'utf8')).toBe('VENTURE_OWN=value\n');
  });

  it('a stale-mtime-but-identical-content .env is never flagged as stale (never uses mtime)', () => {
    fs.writeFileSync(path.join(repoRoot, '.env'), 'SECRET=same\n');
    refreshPropagatedEnv(repoRoot, worktreePath);
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(worktreePath, '.env'), past, past);

    const result = refreshPropagatedEnv(repoRoot, worktreePath);
    expect(result).toEqual({ refreshed: false, reason: 'current' });
  });
});
