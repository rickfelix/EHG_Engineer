/**
 * worktree-reaper.mjs loadDotenvFromDir regression test
 * QF-20260511-866 — closes feedback 04db6c20
 *
 * Verifies the fix: when `--repo <path>` chdir's to a target repo that has no
 * `.env`, the script's own repo `.env` must still be loaded (called BEFORE
 * chdir in main()) so SUPABASE_* creds remain available. First-loader-wins
 * semantics let later loadDotenv() calls override per-key when the target
 * repo does have its own `.env`.
 *
 * Strategy: synthesize two tmp "repos" with .env files containing distinct
 * KEY=value pairs. Call loadDotenvFromDir(repoA) then loadDotenvFromDir(repoB)
 * with overlapping + non-overlapping keys; assert that:
 *   - keys unique to repoA are loaded (proves script-repo .env is read)
 *   - keys unique to repoB are loaded (proves cwd .env is read)
 *   - overlapping keys keep repoA's value (proves first-loader-wins)
 *
 * No real Supabase, no chdir, no git worktrees — exercises only the env-load
 * helper.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { loadDotenvFromDir } from '../../scripts/worktree-reaper.mjs';

function makeFakeRepo(envContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf866-fake-repo-'));
  // findRepoRoot looks for .git directory or file
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.env'), envContent, 'utf8');
  return dir;
}

describe('worktree-reaper loadDotenvFromDir (QF-20260511-866)', () => {
  const TEST_KEYS = [
    'QF866_KEY_FROM_SCRIPT_REPO',
    'QF866_KEY_FROM_TARGET_REPO',
    'QF866_KEY_OVERLAP'
  ];
  let scriptRepo, targetRepo;

  beforeEach(() => {
    // Each test starts with the test keys cleared so process.env state from
    // prior tests doesn't leak.
    for (const k of TEST_KEYS) delete process.env[k];
    scriptRepo = makeFakeRepo(
      'QF866_KEY_FROM_SCRIPT_REPO=from-script\nQF866_KEY_OVERLAP=script-wins\n'
    );
    targetRepo = makeFakeRepo(
      'QF866_KEY_FROM_TARGET_REPO=from-target\nQF866_KEY_OVERLAP=target-should-not-win\n'
    );
  });

  afterEach(() => {
    for (const k of TEST_KEYS) delete process.env[k];
    fs.rmSync(scriptRepo, { recursive: true, force: true });
    fs.rmSync(targetRepo, { recursive: true, force: true });
  });

  it('loads keys from a specified directory walking up to repo root', () => {
    loadDotenvFromDir(scriptRepo);
    expect(process.env.QF866_KEY_FROM_SCRIPT_REPO).toBe('from-script');
    expect(process.env.QF866_KEY_FROM_TARGET_REPO).toBeUndefined();
  });

  it('walks up from a subdirectory to find the .env at repo root', () => {
    const sub = path.join(scriptRepo, 'scripts');
    fs.mkdirSync(sub);
    loadDotenvFromDir(sub);
    expect(process.env.QF866_KEY_FROM_SCRIPT_REPO).toBe('from-script');
  });

  it('preserves first-loader-wins when called twice with overlapping keys', () => {
    // Simulates the --repo flow: script-repo first (before chdir), target second (after chdir).
    loadDotenvFromDir(scriptRepo);
    loadDotenvFromDir(targetRepo);
    expect(process.env.QF866_KEY_FROM_SCRIPT_REPO).toBe('from-script');
    expect(process.env.QF866_KEY_FROM_TARGET_REPO).toBe('from-target');
    expect(process.env.QF866_KEY_OVERLAP).toBe('script-wins');
  });

  it('is a no-op when the start directory has no enclosing repo root', () => {
    const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'qf866-orphan-'));
    try {
      loadDotenvFromDir(orphan);
      expect(process.env.QF866_KEY_FROM_SCRIPT_REPO).toBeUndefined();
    } finally {
      fs.rmSync(orphan, { recursive: true, force: true });
    }
  });
});
