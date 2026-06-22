/**
 * Tests for node-modules-autoheal.cjs (SD-REFILL-00RXDLKM).
 *
 * Exercises the pure, dependency-injected decision logic without running a real
 * npm install: detection (needsHeal), the single-healer lock (acquireHealLock /
 * isStaleLock), and the additive-only command (buildHealCommand). The hook gates
 * main() behind `require.main === module`, so a plain require() yields the exports
 * with no SessionStart side-effects.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HOOK_PATH = path.resolve(__dirname, '../node-modules-autoheal.cjs');

function loadHook() {
  delete require.cache[require.resolve(HOOK_PATH)];
  return require(HOOK_PATH);
}

const ROOT = '/repo';

describe('needsHeal (FR-1 detection)', () => {
  const NM = path.join(ROOT, 'node_modules');
  const DEP_PKG = path.join(NM, '@supabase', 'supabase-js', 'package.json');

  it('TS-1: heals when the sentinel dep package.json is absent from THIS store', () => {
    const { needsHeal } = loadHook();
    // node_modules dir exists, but the sentinel's package.json does not.
    const existsSync = (p) => p === NM;
    expect(needsHeal(ROOT, { existsSync })).toBe(true);
  });

  it('TS-2: fast-exits (false) when the sentinel dep is present', () => {
    const { needsHeal } = loadHook();
    const existsSync = (p) => p === NM || p === DEP_PKG;
    expect(needsHeal(ROOT, { existsSync })).toBe(false);
  });

  it('heals when node_modules is entirely missing', () => {
    const { needsHeal } = loadHook();
    expect(needsHeal(ROOT, { existsSync: () => false })).toBe(true);
  });

  it('does NOT use require.resolve (no upward walk to a parent store) — exact-path only', () => {
    const { needsHeal } = loadHook();
    // Sentinel exists ONLY in a parent node_modules, not this store → must still heal.
    const parentDepPkg = path.join(ROOT, '..', 'node_modules', '@supabase', 'supabase-js', 'package.json');
    const existsSync = (p) => p === NM || p === parentDepPkg; // parent has it, this store does not
    expect(needsHeal(ROOT, { existsSync })).toBe(true);
  });

  it('TS-3: never auto-installs on an unexpected fs error', () => {
    const { needsHeal } = loadHook();
    const existsSync = () => { throw new Error('EACCES'); };
    expect(needsHeal(ROOT, { existsSync })).toBe(false);
  });
});

describe('isStaleLock (FR-2 TTL)', () => {
  it('TS-5: a lock older than the TTL is stale (reclaimable)', () => {
    const { isStaleLock } = loadHook();
    expect(isStaleLock(1000, 1000 + 200000, 180000)).toBe(true);
  });

  it('a fresh lock is NOT stale', () => {
    const { isStaleLock } = loadHook();
    expect(isStaleLock(1000, 1000 + 5000, 180000)).toBe(false);
  });

  it('an unreadable mtime is treated as stale (reclaim rather than wedge)', () => {
    const { isStaleLock } = loadHook();
    expect(isStaleLock(NaN, 5000, 180000)).toBe(true);
  });
});

describe('acquireHealLock (FR-2 single-healer)', () => {
  it('first caller acquires the lock (mkdir succeeds)', () => {
    const { acquireHealLock } = loadHook();
    const got = acquireHealLock('/repo/.lock', { mkdir: () => {}, statMtimeMs: () => 0, rmdir: () => {} });
    expect(got).toBe(true);
  });

  it('TS-4: a second concurrent caller skips while a fresh lock is held', () => {
    const { acquireHealLock } = loadHook();
    const eexist = () => { const e = new Error('exists'); e.code = 'EEXIST'; throw e; };
    const got = acquireHealLock('/repo/.lock', {
      mkdir: eexist,
      statMtimeMs: () => 1000,
      nowMs: 1000 + 5000,   // 5s old → fresh
      ttlMs: 180000,
      rmdir: () => { throw new Error('should not reclaim a fresh lock'); },
    });
    expect(got).toBe(false);
  });

  it('reclaims a STALE lock then re-acquires', () => {
    const { acquireHealLock } = loadHook();
    let calls = 0;
    const mkdir = () => { calls++; if (calls === 1) { const e = new Error('exists'); e.code = 'EEXIST'; throw e; } /* 2nd: succeeds */ };
    let reclaimed = false;
    const got = acquireHealLock('/repo/.lock', {
      mkdir,
      statMtimeMs: () => 1000,
      nowMs: 1000 + 200000,  // 200s old → stale
      ttlMs: 180000,
      rmdir: () => { reclaimed = true; },
    });
    expect(reclaimed).toBe(true);
    expect(got).toBe(true);
  });

  it('an unexpected mkdir error (not EEXIST) fails closed (no heal)', () => {
    const { acquireHealLock } = loadHook();
    const got = acquireHealLock('/repo/.lock', {
      mkdir: () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; },
      statMtimeMs: () => 0, rmdir: () => {},
    });
    expect(got).toBe(false);
  });
});

describe('buildHealCommand (FR-3 additive-only)', () => {
  it('TS-6: is `npm install` with safe flags — never npm ci / never destructive', () => {
    const { buildHealCommand } = loadHook();
    const { cmd, args } = buildHealCommand();
    expect(cmd).toBe('npm');
    expect(args).toEqual(['install', '--ignore-scripts', '--no-audit', '--no-fund']);
    expect(args).not.toContain('ci');
    expect(args.join(' ')).not.toMatch(/rm|ci|prune|--force/);
  });
});
