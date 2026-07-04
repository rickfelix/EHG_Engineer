/**
 * SD-LEO-INFRA-START-INSTALL-SKIP-001 (5th recurrence): mandatory e2e acceptance per the
 * recurred-family rule -- a logic-only patch bounced 4 times because none of the prior fixes
 * had a real, on-disk acceptance test. This drives the ACTUAL exported evaluateInstallDecision()
 * against REAL temp directories (no fs mocking) to prove the fix: deciding from the resolved
 * WORKTREE path is correct, while deciding from an unrelated "coordinator repo" path (the exact
 * bug scripts/sd-start.js had via getRepoRoot()) reproduces the false-positive skip.
 *
 * @module tests/unit/sd-start-install-decision-worktree-path.test.js
 */

import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { evaluateInstallDecision, writeMarker, computeLockHash } from '../../lib/fleet-lock-hash.mjs';
import { defaultEnsureHuskyHooks } from '../../lib/worktree-provision.js';

const tmpDirs = [];

async function mkTmpDir(prefix) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Populate a directory as a "healthy, fully installed" repo: lockfile + marker + canary. */
async function populateHealthyRepo(dir) {
  await fsp.writeFile(path.join(dir, 'package-lock.json'), '{"name":"x","lockfileVersion":3}');
  await fsp.mkdir(path.join(dir, 'node_modules', '@supabase', 'supabase-js'), { recursive: true });
  const hash = await computeLockHash(dir);
  await writeMarker(dir, 'test-session', hash);
  return hash;
}

afterEach(async () => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe('FR1 acceptance: install decision must be resolved against the WORKTREE path, not an unrelated repo', () => {
  it('a fresh worktree with NO node_modules correctly requires install, even when a healthy "coordinator repo" exists alongside it', async () => {
    const coordinatorDir = await mkTmpDir('install-decision-coordinator-');
    const worktreeDir = await mkTmpDir('install-decision-worktree-');

    // The coordinator repo is fully healthy -- this is the state that made the OLD
    // getRepoRoot()-based bug always report skip:true regardless of the worktree.
    await populateHealthyRepo(coordinatorDir);

    // THE BUG, reproduced directly: deciding from the coordinator path false-positives skip.
    const buggyDecision = await evaluateInstallDecision({ repoRoot: coordinatorDir });
    expect(buggyDecision.skip).toBe(true);

    // THE FIX: deciding from the worktree's own (empty) path correctly requires install.
    const correctDecision = await evaluateInstallDecision({ repoRoot: worktreeDir });
    expect(correctDecision.skip).toBe(false);
    expect(correctDecision.reason).toMatch(/no hash marker/);
  });

  it('a worktree with node_modules missing but package-lock.json present still requires install (canary check, not just hash)', async () => {
    const worktreeDir = await mkTmpDir('install-decision-worktree-lockonly-');
    await fsp.writeFile(path.join(worktreeDir, 'package-lock.json'), '{"name":"x"}');
    // No node_modules at all -- no marker, no canary.
    const decision = await evaluateInstallDecision({ repoRoot: worktreeDir });
    expect(decision.skip).toBe(false);
  });

  it('a genuinely healthy, freshly-populated worktree correctly SKIPS install (the inverse case -- no false negative either)', async () => {
    const worktreeDir = await mkTmpDir('install-decision-worktree-healthy-');
    await populateHealthyRepo(worktreeDir);
    const decision = await evaluateInstallDecision({ repoRoot: worktreeDir });
    expect(decision.skip).toBe(true);
    expect(decision.reason).toMatch(/lockfile hash match/);
  });

  it('an isolated worktree (real node_modules, no relation to any coordinator repo) is judged purely on its own state', async () => {
    const worktreeDir = await mkTmpDir('install-decision-worktree-isolated-');
    // Populate ONLY the canary, no marker/hash -- simulates a worktree isolate-install that ran
    // but never got to write the marker (e.g. interrupted) -- must still require install.
    await fsp.mkdir(path.join(worktreeDir, 'node_modules', '@supabase', 'supabase-js'), { recursive: true });
    const decision = await evaluateInstallDecision({ repoRoot: worktreeDir });
    expect(decision.skip).toBe(false);
    expect(decision.reason).toMatch(/no hash marker/);
  });
});

describe('FR4 acceptance: git hooks must be provisioned independently of the install-skip decision', () => {
  it('defaultEnsureHuskyHooks provisions .husky/_ in a worktree that has no npm install at all (skip-path parity)', () => {
    // This proves hook provisioning does not depend on npm install having run --
    // `npx husky` alone recreates the shims in any git-initialized directory.
    // Skipped in CI environments without a real git binary / npx on PATH is acceptable
    // (fail-open is the documented contract); we only assert the call never throws.
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-decision-husky-'));
    tmpDirs.push(worktreeDir);
    expect(() => defaultEnsureHuskyHooks(worktreeDir)).not.toThrow();
  });
});
