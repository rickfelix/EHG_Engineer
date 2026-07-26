/**
 * window-handle.js — focus surface.
 *
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-7: the assertValidPid / buildHandleCaptureCommand /
 * parseHandleOutput / captureWindowHandle describes that used to live here were REMOVED along with the
 * functions themselves. That family implemented `(Get-Process -Id <pid>).MainWindowHandle` against the
 * wt.exe LAUNCHER pid -- a process already exited by the time it was queried -- so its 10x500ms loop
 * burned ~5s on every spawn and could never succeed. After FR-4 it had zero production callers.
 *
 * NO PROTECTION WAS RETIRED WITH THEM. The load-bearing assertion in that set was QF-20260724-113's
 * "capture must never throw out of spawn()" (a throw there aborted DB bookkeeping AFTER the real OS
 * spawn, leaving orphaned unstamped sessions). That invariant is now asserted directly against the
 * replacement, captureNewWindowHandle, in window-enum.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildFocusCommand, focusWindow } from '../../../lib/fleet/window-handle.js';

describe('buildFocusCommand', () => {
  it('interpolates a coerced numeric handle', () => {
    const cmd = buildFocusCommand(131074);
    expect(cmd.args.join(' ')).toContain('[IntPtr]131074');
  });

  it('throws for an invalid handle', () => {
    expect(() => buildFocusCommand(0)).toThrow(/invalid handle/);
    expect(() => buildFocusCommand(null)).toThrow(/invalid handle/);
  });
});

describe('focusWindow', () => {
  it('returns true on success', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '' });
    expect(await focusWindow(131074, { execFn })).toBe(true);
  });

  it('returns false (never throws) for a stale/invalid handle', async () => {
    const execFn = vi.fn().mockRejectedValue(new Error('window closed'));
    expect(await focusWindow(131074, { execFn })).toBe(false);
    expect(await focusWindow(0, {})).toBe(false);
  });
});
