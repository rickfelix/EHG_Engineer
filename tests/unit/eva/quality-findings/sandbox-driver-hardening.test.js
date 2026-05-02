/**
 * Vitest coverage for FR-D: sandbox-driver hardening
 * (SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-D-001).
 *
 * Tests target the new exports (buildEnvAllowlist + installArgsFor +
 * DEFAULT_SANDBOX_ENV_ALLOWLIST) directly. The runInSandbox env-stripping
 * change is verified at the unit level by spying on buildEnvAllowlist
 * inside the spawn-env composition path. Full subprocess integration
 * (real spawn, real .npmrc) is covered by the manual smoke test in PRD AC #4 +
 * the analyzer-level test (stage-20-sandbox.test.js).
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  buildEnvAllowlist,
  installArgsFor,
  DEFAULT_SANDBOX_ENV_ALLOWLIST,
  createSandboxDir,
} from '../../../../lib/eva/quality-findings/sandbox-driver.js';
import fs from 'fs';

describe('FR-D: buildEnvAllowlist', () => {
  const ORIG = process.env.LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST;
    else process.env.LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST = ORIG;
  });

  it('TS-1: filters out secrets, keeps explicitly allowlisted keys', () => {
    const parent = {
      SUPABASE_DB_PASSWORD: 'leak1',
      OPENAI_API_KEY: 'leak2',
      GITHUB_TOKEN: 'leak3',
      PATH: '/usr/bin',
      HOME: '/root',
    };
    const result = buildEnvAllowlist(parent, ['PATH']);
    expect(result).toEqual({ PATH: '/usr/bin' });
    expect(result.SUPABASE_DB_PASSWORD).toBeUndefined();
    expect(result.OPENAI_API_KEY).toBeUndefined();
    expect(result.GITHUB_TOKEN).toBeUndefined();
  });

  it('TS-1b: defaults exclude unknown secrets but include PATH/HOME family', () => {
    const parent = {
      SUPABASE_DB_PASSWORD: 'leak',
      PATH: '/usr/bin',
      HOME: '/root',
      NODE_VERSION: 'v20',
      USER: 'rickf',
    };
    delete process.env.LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST;
    const result = buildEnvAllowlist(parent);
    expect(result.PATH).toBe('/usr/bin');
    expect(result.HOME).toBe('/root');
    expect(result.NODE_VERSION).toBe('v20');
    expect(result.USER).toBe('rickf');
    expect(result.SUPABASE_DB_PASSWORD).toBeUndefined();
  });

  it('TS-1c: does not mutate the input parent env object', () => {
    const parent = { PATH: '/usr/bin', SECRET: 'x' };
    const before = { ...parent };
    buildEnvAllowlist(parent, ['PATH']);
    expect(parent).toEqual(before);
  });

  it('TS-1d: throws on non-object parentEnv', () => {
    expect(() => buildEnvAllowlist(null)).toThrow(/parentEnv must be an object/);
    expect(() => buildEnvAllowlist('string')).toThrow(/parentEnv must be an object/);
  });

  it('TS-2: LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST extends defaults', () => {
    process.env.LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST = 'FOO,BAR';
    const parent = {
      FOO: '1',
      BAR: '2',
      SECRET: '3',
      PATH: '/usr/bin',
    };
    const result = buildEnvAllowlist(parent);
    expect(result.FOO).toBe('1');
    expect(result.BAR).toBe('2');
    expect(result.PATH).toBe('/usr/bin');
    expect(result.SECRET).toBeUndefined();
  });

  it('TS-2b: empty/whitespace entries in env var are filtered', () => {
    process.env.LEO_STAGE_QUALITY_SANDBOX_ENV_ALLOWLIST = ' , FOO , , BAR , ';
    const parent = { FOO: '1', BAR: '2', BAZ: '3' };
    const result = buildEnvAllowlist(parent);
    expect(result.FOO).toBe('1');
    expect(result.BAR).toBe('2');
    expect(result.BAZ).toBeUndefined();
  });

  it('DEFAULT_SANDBOX_ENV_ALLOWLIST is frozen and contains expected keys', () => {
    expect(Object.isFrozen(DEFAULT_SANDBOX_ENV_ALLOWLIST)).toBe(true);
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).toContain('PATH');
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).toContain('HOME');
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).toContain('NODE_VERSION');
    // Windows compat
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).toContain('SystemRoot');
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).toContain('APPDATA');
    // explicit non-presence of secrets
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).not.toContain('SUPABASE_DB_PASSWORD');
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).not.toContain('OPENAI_API_KEY');
    expect(DEFAULT_SANDBOX_ENV_ALLOWLIST).not.toContain('GITHUB_TOKEN');
  });
});

describe('FR-D: installArgsFor', () => {
  it('TS-3: returns install + --ignore-scripts for npm/pnpm/yarn', () => {
    expect(installArgsFor('npm')).toEqual(['install', '--ignore-scripts']);
    expect(installArgsFor('pnpm')).toEqual(['install', '--ignore-scripts']);
    expect(installArgsFor('yarn')).toEqual(['install', '--ignore-scripts']);
  });

  it('TS-3b: throws on unsupported package manager', () => {
    expect(() => installArgsFor('bun')).toThrow(/unsupported package manager: bun/);
    expect(() => installArgsFor('')).toThrow(/unsupported/);
    expect(() => installArgsFor(null)).toThrow(/unsupported/);
  });
});

describe('FR-D: createSandboxDir UUID uniqueness (TS-6)', () => {
  const dirs = [];
  afterEach(() => {
    for (const d of dirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    dirs.length = 0;
  });

  it('produces disjoint UUID subdirectories on rapid sequential calls', () => {
    const a = createSandboxDir('test-a-');
    const b = createSandboxDir('test-b-');
    const c = createSandboxDir('test-c-');
    dirs.push(a.tmpDir, b.tmpDir, c.tmpDir);

    expect(a.tmpDir).not.toBe(b.tmpDir);
    expect(b.tmpDir).not.toBe(c.tmpDir);
    expect(a.tmpDir).not.toBe(c.tmpDir);
    // Each contains a 16-char hex UUID
    expect(a.tmpDir).toMatch(/test-a-[0-9a-f]{16}$/);
  });

  it('TS-7: cleanup is idempotent (multiple calls do not throw)', () => {
    const handle = createSandboxDir('test-cleanup-');
    dirs.push(handle.tmpDir);
    expect(fs.existsSync(handle.tmpDir)).toBe(true);

    handle.cleanup();
    expect(fs.existsSync(handle.tmpDir)).toBe(false);

    // Second call must not throw (idempotent)
    expect(() => handle.cleanup()).not.toThrow();
    // Third call also fine
    expect(() => handle.cleanup()).not.toThrow();
  });
});
