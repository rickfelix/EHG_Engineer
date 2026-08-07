/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5a — window enumeration must fail LOUDLY.
 *
 * The SD's success criterion is verified by FORCING A TIMEOUT and driving the abort path.
 * Raising the timeout alone does NOT satisfy it: the measured failure mode is a ~4.9s
 * enumeration against a 5000ms ceiling, and the defect is the silent fail-soft, not the margin.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  enumerateWindows,
  enumerateWindowsStrict,
  WINDOW_ENUM_TIMEOUT_MS,
} from './window-handle.js';

/** Reproduce how execFile reports a timeout: it KILLS the child. */
function timeoutError() {
  const e = new Error('Command failed: timeout');
  e.killed = true;
  e.signal = 'SIGTERM';
  return e;
}

const OK_STDOUT = '';

describe('FR5a-LOUD: a timed-out enumeration is distinguishable from an empty desktop', () => {
  it('FORCING A TIMEOUT drives the abort path and reports GUARD_UNAVAILABLE', async () => {
    const execFn = vi.fn(async () => { throw timeoutError(); });
    const r = await enumerateWindowsStrict({ execFn });
    expect(r.ok).toBe(false);
    expect(r.windows).toBeNull();          // NOT [] — there is no observation to report
    expect(r.error.code).toBe('GUARD_UNAVAILABLE');
    expect(r.error.timedOut).toBe(true);
    expect(r.error.message).toMatch(/this is not an empty desktop/);
  });

  it('AN EMPTY DESKTOP IS A DIFFERENT ANSWER — ok:true with zero windows', async () => {
    // This is the pair that matters. Before FR-5a both cases produced [], so a caller could
    // not tell "I looked and saw nothing" from "I never got to look".
    const execFn = vi.fn(async () => ({ stdout: OK_STDOUT }));
    const r = await enumerateWindowsStrict({ execFn });
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.windows)).toBe(true);
    expect(r.error).toBeNull();
  });

  it('names a non-timeout failure differently — the operator response differs', async () => {
    const execFn = vi.fn(async () => { throw new Error('powershell refused'); });
    const r = await enumerateWindowsStrict({ execFn });
    expect(r.ok).toBe(false);
    expect(r.error.timedOut).toBe(false);
    expect(r.error.message).toMatch(/powershell refused/);
  });
});

describe('FR5a-MARGIN: the ceiling clears the measured enumeration, but is not the fix', () => {
  it('raises the timeout well past the ~4.9s measurement that was failing against 5000ms', () => {
    expect(WINDOW_ENUM_TIMEOUT_MS).toBeGreaterThan(5000);
    // A ~2% margin is what produced roughly two failures in three.
    expect(WINDOW_ENUM_TIMEOUT_MS).toBeGreaterThanOrEqual(15000);
  });
});

describe('FR5a-COMPAT: the legacy fail-soft caller contract is untouched', () => {
  it('enumerateWindows still returns [] on failure, for captureNewWindowHandle', async () => {
    // captureNewWindowHandle's contract depends on this and its tests assert it. Flipping the
    // return type here would break the capture path in order to fix the reaper.
    const execFn = vi.fn(async () => { throw timeoutError(); });
    await expect(enumerateWindows({ execFn })).resolves.toEqual([]);
  });

  it('and still returns the parsed list on success', async () => {
    const execFn = vi.fn(async () => ({ stdout: OK_STDOUT }));
    const out = await enumerateWindows({ execFn });
    expect(Array.isArray(out)).toBe(true);
  });
});
