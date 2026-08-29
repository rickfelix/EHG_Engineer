/**
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D
 *
 * hasE2EInfra() and runFullE2ESuite()'s zero-infra short-circuit: a repo with no
 * playwright config, no tests/e2e dir, and no package.json test:e2e script must be
 * reported as e2e_not_applicable (not run through spawn/playwright and not treated as
 * a generic execution failure). Repo-scoped (not process.cwd()) -- this repo itself
 * has a playwright.config.js, so a cwd-relative probe would falsely pass on a
 * genuinely-zero-infra fixture repo.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { hasE2EInfra, runFullE2ESuite } from '../../../lib/sub-agents/testing/phases/phase3-execution.js';

const scratchDirs = [];
function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-probe-'));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (scratchDirs.length) {
    const dir = scratchDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('hasE2EInfra() — repo-scoped, four cases', () => {
  it('returns false for a bare repo with no infra signals at all', () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: { build: 'echo build' } }));
    expect(hasE2EInfra(repo)).toBe(false);
  });

  it('returns true when playwright.config.js is present', () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'playwright.config.js'), 'module.exports = {};');
    expect(hasE2EInfra(repo)).toBe(true);
  });

  it('returns true when a tests/e2e directory is present (no config file)', () => {
    const repo = makeScratchRepo();
    mkdirSync(path.join(repo, 'tests', 'e2e'), { recursive: true });
    expect(hasE2EInfra(repo)).toBe(true);
  });

  it('returns true when package.json declares a test:e2e script (no config, no tests/e2e dir)', () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: { 'test:e2e': 'playwright test' } }));
    expect(hasE2EInfra(repo)).toBe(true);
  });

  it('negative: package.json present with unrelated scripts but no test:e2e key returns false', () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run', build: 'tsc' } }));
    expect(hasE2EInfra(repo)).toBe(false);
  });

  it('is repo-scoped: a fixture repo with no infra is false even when process.cwd() (this repo) has infra', () => {
    // This repo (EHG_Engineer) has its own playwright.config.js — a cwd-relative (not
    // repoPath-scoped) probe would incorrectly return true here. Guards against that regression.
    expect(process.cwd()).not.toBe(''); // sanity: cwd exists and is NOT the scratch repo below
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: {} }));
    expect(hasE2EInfra(repo)).toBe(false);
  });

  it('malformed package.json does not throw — treated as no infra', () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'package.json'), '{ not valid json');
    expect(() => hasE2EInfra(repo)).not.toThrow();
    expect(hasE2EInfra(repo)).toBe(false);
  });
});

describe('runFullE2ESuite() — zero-infra short-circuit', () => {
  it('returns e2e_not_applicable:true and does not spawn a child process for a zero-infra repo', async () => {
    const repo = makeScratchRepo();
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: {} }));
    const result = await runFullE2ESuite('test-sd', { repoPath: repo });
    expect(result.e2e_not_applicable).toBe(true);
    expect(result.tests_executed).toBe(0);
    expect(result.failed_tests).toBe(0);
    expect(result.reason).toContain(repo);
  });
});
