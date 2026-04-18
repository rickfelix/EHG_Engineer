/**
 * Cross-Repo Build Check Gate -- Unit Tests
 * SD-CROSSREPO-BUILD-VERIFICATION-GATE-ORCH-001-B
 *
 * Tests the advisory cross-repo build verification gate that checks
 * whether the ehg frontend repo builds successfully.
 *
 * Exports under test:
 *   - checkEhgBuild(options) -- runs npm build in ehg, returns {pass, output, duration}
 *   - createCrossRepoBuildGate() -- returns gate definition object
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../lib/multi-repo/index.js', () => ({
  getPrimaryRepos: vi.fn(),
}));

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { getPrimaryRepos } from '../../../lib/multi-repo/index.js';

const MODULE_PATH = '../../../lib/gates/cross-repo-build-check.js';

// ---- checkEhgBuild ---------------------------------------------------------

describe('checkEhgBuild', () => {
  let checkEhgBuild;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Re-apply mocks after restoreAllMocks
    vi.mocked(getPrimaryRepos).mockReturnValue({
      ehg: { path: '/mock/ehg', name: 'ehg' },
      EHG_Engineer: { path: '/mock/EHG_Engineer', name: 'EHG_Engineer' },
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockReturnValue('Build completed successfully');

    // Dynamic import to pick up fresh mocks
    const mod = await import(MODULE_PATH);
    checkEhgBuild = mod.checkEhgBuild;
  });

  it('should return { pass: true } when build succeeds', () => {
    const result = checkEhgBuild();

    expect(result.pass).toBe(true);
    expect(typeof result.output).toBe('string');
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should return correct shape (pass: boolean, output: string, duration: number)', () => {
    const result = checkEhgBuild();

    expect(result).toHaveProperty('pass');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('duration');
    expect(typeof result.pass).toBe('boolean');
    expect(typeof result.output).toBe('string');
    expect(typeof result.duration).toBe('number');
  });

  it('should return { pass: false } when ehg repo path does not exist', () => {
    vi.mocked(getPrimaryRepos).mockReturnValue({
      ehg: { path: '/nonexistent/ehg', name: 'ehg' },
    });
    vi.mocked(existsSync).mockReturnValue(false);

    const result = checkEhgBuild();

    expect(result.pass).toBe(false);
    expect(result.output).toContain('not found');
    expect(typeof result.duration).toBe('number');
  });

  it('should return { pass: false } when ehg is missing from repos', () => {
    vi.mocked(getPrimaryRepos).mockReturnValue({
      EHG_Engineer: { path: '/mock/EHG_Engineer', name: 'EHG_Engineer' },
    });

    const result = checkEhgBuild();

    expect(result.pass).toBe(false);
    expect(typeof result.duration).toBe('number');
  });

  it('should return { pass: false } when package.json does not exist', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('package.json')) return false;
      return true; // ehg path exists
    });

    const result = checkEhgBuild();

    expect(result.pass).toBe(false);
    expect(result.output).toContain('No package.json');
  });

  it('should return { pass: false } when build command fails', () => {
    const buildError = new Error('Build failed');
    buildError.stderr = 'Error: Cannot find module ./missing-component';
    vi.mocked(execSync).mockImplementation(() => {
      throw buildError;
    });

    const result = checkEhgBuild();

    expect(result.pass).toBe(false);
    expect(result.output).toContain('Cannot find module');
    expect(typeof result.duration).toBe('number');
  });

  it('should return timeout message when build is killed', () => {
    const timeoutError = new Error('TIMEOUT');
    timeoutError.killed = true;
    vi.mocked(execSync).mockImplementation(() => {
      throw timeoutError;
    });

    const result = checkEhgBuild();

    expect(result.pass).toBe(false);
    expect(result.output).toContain('timed out');
  });

  it('should truncate long build output to 500 chars', () => {
    const longOutput = 'x'.repeat(1000);
    vi.mocked(execSync).mockReturnValue(longOutput);

    const result = checkEhgBuild();

    expect(result.pass).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(500);
  });

  it('should pass timeout option to execSync', () => {
    checkEhgBuild({ timeout: 60000 });

    expect(execSync).toHaveBeenCalledWith(
      'npm run build',
      expect.objectContaining({ timeout: 60000 })
    );
  });

  it('should use default 120s timeout when not specified', () => {
    checkEhgBuild();

    expect(execSync).toHaveBeenCalledWith(
      'npm run build',
      expect.objectContaining({ timeout: 120000 })
    );
  });

  it('should run build in the ehg repo directory', () => {
    checkEhgBuild();

    expect(execSync).toHaveBeenCalledWith(
      'npm run build',
      expect.objectContaining({ cwd: '/mock/ehg' })
    );
  });

  it('should handle error with no stderr gracefully', () => {
    const err = new Error('Something went wrong');
    // No stderr property
    vi.mocked(execSync).mockImplementation(() => {
      throw err;
    });

    const result = checkEhgBuild();

    expect(result.pass).toBe(false);
    expect(result.output).toContain('Something went wrong');
  });
});

// ---- createCrossRepoBuildGate -----------------------------------------------

describe('createCrossRepoBuildGate', () => {
  let createCrossRepoBuildGate;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.mocked(getPrimaryRepos).mockReturnValue({
      ehg: { path: '/mock/ehg', name: 'ehg' },
      EHG_Engineer: { path: '/mock/EHG_Engineer', name: 'EHG_Engineer' },
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockReturnValue('Build completed successfully');

    const mod = await import(MODULE_PATH);
    createCrossRepoBuildGate = mod.createCrossRepoBuildGate;
  });

  it('should return a valid gate definition object', () => {
    const gate = createCrossRepoBuildGate();

    expect(gate).toHaveProperty('name');
    expect(gate).toHaveProperty('validator');
    expect(gate).toHaveProperty('required');
    expect(gate).toHaveProperty('weight');
    expect(gate).toHaveProperty('remediation');
  });

  it('should have gate name CROSS_REPO_BUILD_CHECK', () => {
    const gate = createCrossRepoBuildGate();
    expect(gate.name).toBe('CROSS_REPO_BUILD_CHECK');
  });

  it('should be advisory (required: false)', () => {
    const gate = createCrossRepoBuildGate();
    expect(gate.required).toBe(false);
  });

  it('should have weight 0.5', () => {
    const gate = createCrossRepoBuildGate();
    expect(gate.weight).toBe(0.5);
  });

  it('should have a remediation string', () => {
    const gate = createCrossRepoBuildGate();
    expect(typeof gate.remediation).toBe('string');
    expect(gate.remediation.length).toBeGreaterThan(0);
    expect(gate.remediation).toContain('npm run build');
  });

  it('should have an async validator function', () => {
    const gate = createCrossRepoBuildGate();
    expect(typeof gate.validator).toBe('function');
  });

  // ---- validator() behavior ------------------------------------------------

  it('validator should always return pass: true (advisory gate)', async () => {
    const gate = createCrossRepoBuildGate();
    const result = await gate.validator();

    // Advisory gate -- never blocks
    expect(result.pass).toBe(true);
  });

  it('validator should return score 100 when build succeeds', async () => {
    const gate = createCrossRepoBuildGate();
    const result = await gate.validator();

    expect(result.score).toBe(100);
    expect(result.max_score).toBe(100);
    expect(result.warnings).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('validator should return score 50 with warning when build fails', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error('Build failed');
      err.stderr = 'TypeScript error in Component.tsx';
      throw err;
    });

    const gate = createCrossRepoBuildGate();
    const result = await gate.validator();

    // Advisory: still passes
    expect(result.pass).toBe(true);
    // But reduced score
    expect(result.score).toBe(50);
    expect(result.max_score).toBe(100);
    // Warning recorded
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('ehg build failed');
  });

  it('validator should include metadata with duration and buildPassed', async () => {
    const gate = createCrossRepoBuildGate();
    const result = await gate.validator();

    expect(result.metadata).toBeDefined();
    expect(typeof result.metadata.duration).toBe('number');
    expect(typeof result.metadata.buildPassed).toBe('boolean');
  });

  it('validator metadata.buildPassed should be true when build succeeds', async () => {
    const gate = createCrossRepoBuildGate();
    const result = await gate.validator();
    expect(result.metadata.buildPassed).toBe(true);
  });

  it('validator metadata.buildPassed should be false when build fails', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error('fail');
      err.stderr = 'error';
      throw err;
    });

    const gate = createCrossRepoBuildGate();
    const result = await gate.validator();
    expect(result.metadata.buildPassed).toBe(false);
  });

  it('validator should return standard gate result shape', async () => {
    const gate = createCrossRepoBuildGate();
    const result = await gate.validator();

    expect(result).toHaveProperty('pass');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('max_score');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('metadata');
    expect(typeof result.pass).toBe('boolean');
    expect(typeof result.score).toBe('number');
    expect(typeof result.max_score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
