/**
 * Regression coverage for SD-LEO-FIX-FIX-STAGE-CODE-001 (FR-2).
 *
 * sandbox-driver.detectPackageManager(repoDir) maps a cloned repo's lockfile to
 * a package manager, and installArgsFor() now supports 'bun' while keeping
 * --ignore-scripts for EVERY manager (the supply-chain guard must never drop).
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  detectPackageManager,
  installArgsFor,
} from '../../../../lib/eva/quality-findings/sandbox-driver.js';

const dirs = [];
function makeRepoWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-detect-'));
  dirs.push(dir);
  for (const f of files) {
    fs.writeFileSync(path.join(dir, f), '');
  }
  return dir;
}

afterEach(() => {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  dirs.length = 0;
});

describe('FR-2: detectPackageManager — lockfile → manager mapping', () => {
  it('package-lock.json → npm', () => {
    expect(detectPackageManager(makeRepoWith(['package-lock.json']))).toBe('npm');
  });

  it('npm-shrinkwrap.json → npm', () => {
    expect(detectPackageManager(makeRepoWith(['npm-shrinkwrap.json']))).toBe('npm');
  });

  it('yarn.lock → yarn', () => {
    expect(detectPackageManager(makeRepoWith(['yarn.lock']))).toBe('yarn');
  });

  it('pnpm-lock.yaml → pnpm', () => {
    expect(detectPackageManager(makeRepoWith(['pnpm-lock.yaml']))).toBe('pnpm');
  });

  it('bun.lock → bun', () => {
    expect(detectPackageManager(makeRepoWith(['bun.lock']))).toBe('bun');
  });

  it('bun.lockb (older binary lockfile) → bun', () => {
    expect(detectPackageManager(makeRepoWith(['bun.lockb']))).toBe('bun');
  });

  it('bunfig.toml → bun', () => {
    expect(detectPackageManager(makeRepoWith(['bunfig.toml']))).toBe('bun');
  });

  it('no lockfile → npm (safe default)', () => {
    expect(detectPackageManager(makeRepoWith(['package.json']))).toBe('npm');
  });

  it('empty dir → npm (safe default)', () => {
    expect(detectPackageManager(makeRepoWith([]))).toBe('npm');
  });

  it('a more-specific manager wins over a co-present package-lock.json', () => {
    // A repo that carries both npm + bun lockfiles resolves to the more specific
    // bun (mirrors detection order); never silently mis-detects as npm.
    expect(detectPackageManager(makeRepoWith(['package-lock.json', 'bun.lock']))).toBe('bun');
  });

  it('returns npm for non-string / empty input (no throw)', () => {
    expect(detectPackageManager(null)).toBe('npm');
    expect(detectPackageManager(undefined)).toBe('npm');
    expect(detectPackageManager('')).toBe('npm');
  });
});

describe('FR-2: installArgsFor preserves --ignore-scripts for every manager (incl. bun)', () => {
  it('npm/pnpm/yarn/bun all return install + --ignore-scripts', () => {
    for (const mgr of ['npm', 'pnpm', 'yarn', 'bun']) {
      const args = installArgsFor(mgr);
      expect(args).toEqual(['install', '--ignore-scripts']);
      expect(args).toContain('--ignore-scripts');
    }
  });

  it('still throws on a genuinely unsupported manager', () => {
    expect(() => installArgsFor('cnpm')).toThrow(/unsupported package manager: cnpm/);
  });
});
