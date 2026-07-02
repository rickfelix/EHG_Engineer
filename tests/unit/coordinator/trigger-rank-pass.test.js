/**
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-4): lib/coordinator/trigger-rank-pass.mjs
 *
 * Covers: the filesystem-lockfile debounce (thundering-herd suppression across separate OS
 * processes, TS-5), the child-scoped RANK_EVENT_TRIGGER env var (TS-6 — must never leak into
 * the calling process's own process.env), and fail-soft behavior on spawn error (TR-3).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { triggerRankPass, acquireDebounceLock, DEBOUNCE_MS } from '../../../lib/coordinator/trigger-rank-pass.mjs';

function makeLockPath() {
  return path.join(os.tmpdir(), `rank-pass-trigger-test-${process.pid}-${Math.random().toString(36).slice(2)}.lock`);
}

function fakeSpawn(calls) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.unref = () => {};
    calls.push({ cmd, args, options, child });
    return child;
  };
}

describe('SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: trigger-rank-pass', () => {
  let lockPath;

  beforeEach(() => {
    lockPath = makeLockPath();
  });

  afterEach(() => {
    try { fs.unlinkSync(lockPath); } catch { /* best-effort cleanup */ }
  });

  describe('acquireDebounceLock', () => {
    it('acquires when no lock file exists', () => {
      expect(acquireDebounceLock(lockPath)).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('debounces a fresh lock held by a live process (this test process itself)', () => {
      expect(acquireDebounceLock(lockPath)).toBe(true);
      expect(acquireDebounceLock(lockPath)).toBe(false); // fresh + pid=self (alive) -> debounced
    });

    it('re-acquires once a stale lock (older than DEBOUNCE_MS) is present', () => {
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() - (DEBOUNCE_MS + 1000) }), { flag: 'wx' });
      expect(acquireDebounceLock(lockPath)).toBe(true);
    });

    it('re-acquires when the lock holder pid is dead (simulated with an unrealistic pid)', () => {
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, timestamp: Date.now() }), { flag: 'wx' });
      expect(acquireDebounceLock(lockPath)).toBe(true);
    });

    it('re-acquires past a corrupt lock file', () => {
      fs.writeFileSync(lockPath, 'not json', { flag: 'wx' });
      expect(acquireDebounceLock(lockPath)).toBe(true);
    });
  });

  describe('triggerRankPass — debounce (TS-5)', () => {
    it('5 rapid calls within the debounce window spawn at most 1 subprocess', () => {
      const calls = [];
      const spawnFn = fakeSpawn(calls);
      for (let i = 0; i < 5; i++) {
        triggerRankPass({ reason: 'burst', spawnFn, lockPath });
      }
      expect(calls.length).toBe(1);
    });
  });

  describe('triggerRankPass — RANK_EVENT_TRIGGER child-scoping (TS-6)', () => {
    it('sets RANK_EVENT_TRIGGER=1 only in the spawned child env, never on the calling process', () => {
      const calls = [];
      const spawnFn = fakeSpawn(calls);
      const before = process.env.RANK_EVENT_TRIGGER;
      const result = triggerRankPass({ reason: 'sd_created', sdKey: 'SD-TEST-001', spawnFn, lockPath });

      expect(result.triggered).toBe(true);
      expect(calls[0].options.env.RANK_EVENT_TRIGGER).toBe('1');
      expect(process.env.RANK_EVENT_TRIGGER).toBe(before); // unchanged (undefined before -> still undefined)
    });

    it('spawns the ranker as a detached, stdio-ignored child', () => {
      const calls = [];
      const spawnFn = fakeSpawn(calls);
      triggerRankPass({ spawnFn, lockPath });
      expect(calls[0].options.detached).toBe(true);
      expect(calls[0].options.stdio).toBe('ignore');
      expect(calls[0].args[0]).toMatch(/coordinator-backlog-rank\.mjs$/);
    });
  });

  describe('triggerRankPass — fail-soft (TR-3)', () => {
    it('does not throw when spawnFn itself throws', () => {
      const spawnFn = () => { throw new Error('ENOENT: node not found'); };
      expect(() => triggerRankPass({ spawnFn, lockPath })).not.toThrow();
      const result = triggerRankPass({ spawnFn, lockPath: makeLockPath() });
      expect(result.triggered).toBe(false);
    });

    it('does not throw when the spawned child emits an error event', () => {
      const calls = [];
      const spawnFn = fakeSpawn(calls);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = triggerRankPass({ reason: 'sd_created', sdKey: 'SD-X', spawnFn, lockPath });
      expect(result.triggered).toBe(true);

      // Simulate the child failing post-spawn (e.g. ENOENT) — must be swallowed, not rethrown.
      expect(() => calls[0].child.emit('error', new Error('spawn ENOENT'))).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SD-X'));
      warnSpy.mockRestore();
    });
  });
});
