/**
 * killProcessOnly — the graceful/forced distinction must be REAL, not decorative.
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 (US-002 / AC-2-4).
 *
 * WHAT WENT WRONG BEFORE, and why these assertions are shaped this way. graceful-kill called
 * killProcess -> tree-kill, which on win32 is `taskkill /pid N /T /F`. The signal argument is
 * ignored there and /F is unconditional, so "SIGTERM, then escalate to SIGKILL" was two identical
 * forced kills; and `/T` took every descendant of the seat with it. Both defects are invisible to
 * any test that asserts only "kill was called with SIGTERM" — the caller's intent was recorded
 * faithfully while the platform did something else entirely.
 *
 * So these tests assert the ARGV actually handed to the OS. That is the layer where the two
 * defects lived, and the only layer at which their absence can be witnessed.
 *
 * No process is ever signalled: execFile is injected.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const REAL_PLATFORM = process.platform;
function setPlatform(p) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}
afterEach(() => {
  setPlatform(REAL_PLATFORM);
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Capture the argv taskkill would receive, without running it. */
async function runWin32(pid, signal) {
  const calls = [];
  vi.doMock('node:child_process', () => ({
    execFile: (cmd, args, cb) => { calls.push({ cmd, args }); cb(null, '', ''); },
  }));
  setPlatform('win32');
  vi.resetModules();
  const { killProcessOnly } = await import('./process-utils.js');
  await killProcessOnly(pid, signal);
  return calls;
}

describe('AC-2-4: one process, never the tree', () => {
  it('does NOT pass /T — descendants of the seat are not collateral', async () => {
    // The seat's claude process routinely parents a dev server, a leo-stack and background
    // shells. /T killed all of them, which is far wider than "stop this session".
    const calls = await runWin32(4321, 'SIGKILL');
    expect(calls).toHaveLength(1);
    expect(calls[0].args).not.toContain('/T');
    expect(calls[0].args).toEqual(['/PID', '4321', '/F']);
  });
});

describe('AC-2-4: the escalation is real, not decorative', () => {
  it('a graceful request omits /F, so the process can run its exit path', async () => {
    // `taskkill /PID n` without /F is the genuine win32 analogue of SIGTERM. This is the whole
    // difference between a module named "graceful kill" and one that merely says so.
    const calls = await runWin32(4321, 'SIGTERM');
    expect(calls[0].args).toEqual(['/PID', '4321']);
    expect(calls[0].args).not.toContain('/F');
  });

  it('THE DISCRIMINATOR — graceful and forced produce DIFFERENT argv', async () => {
    // Before this fix both spellings produced the identical forced command. A test that only
    // checked "SIGTERM was requested" passed throughout. Comparing the two argvs to each other is
    // what makes the regression impossible to reintroduce silently.
    const term = await runWin32(9, 'SIGTERM');
    const kill = await runWin32(9, 'SIGKILL');
    expect(term[0].args).not.toEqual(kill[0].args);
  });
});

describe('already gone is success, not an error', () => {
  it('swallows a not-found failure without warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.doMock('node:child_process', () => ({
      execFile: (_c, _a, cb) => cb(Object.assign(new Error('The process "9" not found.'), { code: 128 })),
    }));
    setPlatform('win32');
    vi.resetModules();
    const { killProcessOnly } = await import('./process-utils.js');
    await expect(killProcessOnly(9, 'SIGKILL')).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('NEGATIVE CONTROL — an unrecognised failure IS surfaced', async () => {
    // Swallowing everything would turn a broken kill into a silent success, which is the failure
    // mode this SD exists to remove. Only "already gone" may be quiet.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.doMock('node:child_process', () => ({
      execFile: (_c, _a, cb) => cb(new Error('Access is denied.')),
    }));
    setPlatform('win32');
    vi.resetModules();
    const { killProcessOnly } = await import('./process-utils.js');
    await killProcessOnly(9, 'SIGKILL');
    expect(warn).toHaveBeenCalled();
  });
});
