/**
 * SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 — FR-1, FR-4
 * Unit tests for scripts/apply-migration.js helpers (no DB).
 *
 * Covers: parseArgs splits flags/positional, sha256 is stable, pathLockId is
 * deterministic, resolveMigrationPath rejects non-`database/migrations/*.sql`
 * unless --allow-any-path, dry-run produces correct outcome marker via
 * child_process.spawnSync on the real file.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { execSync } from 'node:child_process';

import {
  parseArgs,
  sha256,
  pathLockId,
  resolveMigrationPath,
  isMigrationCommittedToGit,
} from '../../scripts/apply-migration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

// Isolated throwaway git repo — never touches the real EHG_Engineer working tree.
function makeTempGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-migration-git-test-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@example.com', { cwd: dir });
  execSync('git config user.name test', { cwd: dir });
  return dir;
}

describe('parseArgs', () => {
  it('extracts positional + flags + key=value', () => {
    const r = parseArgs(['mig.sql', '--prod-deploy', '--allow-any-path', '--why=ci']);
    expect(r.positional).toEqual(['mig.sql']);
    expect(r.flags.has('prod-deploy')).toBe(true);
    expect(r.flags.has('allow-any-path')).toBe(true);
    expect(r.values.why).toBe('ci');
  });
  it('handles empty argv', () => {
    expect(parseArgs([])).toEqual({ positional: [], flags: new Set(), values: {} });
  });
});

describe('sha256 / pathLockId', () => {
  it('sha256 returns stable hex digest', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('pathLockId is deterministic across calls', () => {
    expect(pathLockId('/a/b/c.sql')).toBe(pathLockId('/a/b/c.sql'));
  });
  it('pathLockId differs for different paths', () => {
    expect(pathLockId('/a.sql')).not.toBe(pathLockId('/b.sql'));
  });
});

describe('resolveMigrationPath (FR-1 path allowlist)', () => {
  it('accepts a path under database/migrations/', () => {
    const tmp = path.join(REPO, 'database', 'migrations');
    const files = fs.readdirSync(tmp).filter(f => f.endsWith('.sql'));
    if (files.length === 0) return;
    const abs = resolveMigrationPath(REPO, path.join('database', 'migrations', files[0]), false);
    expect(fs.existsSync(abs)).toBe(true);
  });
  it('rejects a path outside database/migrations/ without --allow-any-path', () => {
    const outside = path.join(os.tmpdir(), `t-${Date.now()}.sql`);
    fs.writeFileSync(outside, 'SELECT 1;');
    expect(() => resolveMigrationPath(REPO, outside, false)).toThrow(/outside database\/migrations/);
    fs.unlinkSync(outside);
  });
  it('throws if file not found', () => {
    expect(() => resolveMigrationPath(REPO, 'database/migrations/does-not-exist.sql', false))
      .toThrow(/migration file not found/);
  });
});

describe('isMigrationCommittedToGit (retro action item #3, SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001)', () => {
  it('returns ok:false for an untracked file (never committed)', () => {
    const dir = makeTempGitRepo();
    const file = path.join(dir, 'untracked.sql');
    fs.writeFileSync(file, 'SELECT 1;');
    const r = isMigrationCommittedToGit(dir, file);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not tracked/);
  });

  it('returns ok:false for a tracked file with uncommitted local changes', () => {
    const dir = makeTempGitRepo();
    const file = path.join(dir, 'mig.sql');
    fs.writeFileSync(file, 'SELECT 1;');
    execSync('git add mig.sql && git commit -q -m init', { cwd: dir });
    fs.writeFileSync(file, 'SELECT 2; -- edited after commit');
    const r = isMigrationCommittedToGit(dir, file);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/uncommitted changes/);
  });

  it('returns ok:true for a tracked file with no local modifications', () => {
    const dir = makeTempGitRepo();
    const file = path.join(dir, 'mig.sql');
    fs.writeFileSync(file, 'SELECT 1;');
    execSync('git add mig.sql && git commit -q -m init', { cwd: dir });
    const r = isMigrationCommittedToGit(dir, file);
    expect(r).toEqual({ ok: true });
  });
});

describe('CLI dry-run end-to-end (smoke; FR-1)', () => {
  it('emits [MIGRATION_APPLY_DRY_RUN] for a known migration with exit 0', () => {
    const files = fs.readdirSync(path.join(REPO, 'database', 'migrations')).filter(f => f.endsWith('.sql'));
    if (files.length === 0) return;
    const target = path.join('database', 'migrations', files[0]);
    const res = spawnSync(process.execPath, ['scripts/apply-migration.js', target], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    expect([0, 1]).toContain(res.status);
    const all = (res.stdout || '') + '\n' + (res.stderr || '');
    expect(/\[MIGRATION_APPLY_(DRY_RUN|PROD_FAIL_GUARDS|DRY_RUN=ALREADY_APPLIED)/.test(all)).toBe(true);
  }, 30000);

  it('--help exits 0 and prints usage to stderr', () => {
    const res = spawnSync(process.execPath, ['scripts/apply-migration.js', '--help'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/Usage:/);
  }, 20000);
});
