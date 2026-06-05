/**
 * Unit tests for scripts/hooks/auto-learning-capture.cjs — missing-engine guard.
 * QF-20260604-006
 *
 * The hook spawns the capture engine DETACHED with stdio:'ignore'. When the engine
 * script is missing (it is currently archived to scripts/archive/one-time/), the
 * broken spawn used to fail SILENTLY — the hook appeared to fire but captured nothing.
 * These tests pin the guard: missing engine => log + skip (no spawn); present => spawn.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const fs = require('fs');
const cp = require('child_process');
const hookPath = resolve(process.cwd(), 'scripts/hooks/auto-learning-capture.cjs');
const { spawnLearningCapture } = require(hookPath);

describe('auto-learning-capture: missing-engine guard (QF-20260604-006)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exports spawnLearningCapture (hook is require-able without running main)', () => {
    expect(typeof spawnLearningCapture).toBe('function');
  });

  it('skips the spawn and surfaces the dormancy when the engine is missing', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const spawnSpy = vi.spyOn(cp, 'spawn');
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

    expect(() => spawnLearningCapture('123')).not.toThrow();

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/Engine missing/i);
  });

  it('spawns the engine (detached, unref) when it exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fakeChild = { unref: vi.fn() };
    const spawnSpy = vi.spyOn(cp, 'spawn').mockReturnValue(fakeChild);
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

    spawnLearningCapture('123');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnSpy.mock.calls[0];
    expect(cmd).toBe('node');
    expect(args[0]).toMatch(/auto-learning-capture\.js$/);
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore' });
    expect(fakeChild.unref).toHaveBeenCalled();
    expect(logs.join('\n')).not.toMatch(/Engine missing/i);
  });
});
