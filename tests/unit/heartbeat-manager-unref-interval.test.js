/**
 * SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001 — the heartbeat interval must be UNREF'd so that on Windows
 * libuv does not force-close the timer's async handle while it is already closing on process exit
 * ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c line 76"), and so a
 * short-lived CLI does not hang to exit-143 waiting on a ref'd timer. We assert the property directly
 * via Node's Timeout.hasRef(): an unref'd timer reports hasRef() === false.
 */
import { describe, it, expect } from 'vitest';
import { armUnrefInterval } from '../../lib/heartbeat-manager.mjs';

describe('armUnrefInterval (SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001)', () => {
  it('returns a timer that is NOT keeping the event loop alive (hasRef() === false)', () => {
    const t = armUnrefInterval(() => {}, 1_000_000);
    try {
      expect(typeof t.hasRef).toBe('function');
      expect(t.hasRef()).toBe(false); // unref'd: does not hold the loop open / not in the force-close path
    } finally {
      clearInterval(t);
    }
  });

  it('contrast: a plain ref\'d setInterval DOES keep the loop alive (hasRef() === true)', () => {
    const t = setInterval(() => {}, 1_000_000);
    try {
      expect(t.hasRef()).toBe(true);
    } finally {
      clearInterval(t);
    }
  });

  it('still returns a working, clearable timer handle', () => {
    let fired = 0;
    const t = armUnrefInterval(() => { fired++; }, 1_000_000);
    expect(t).toBeDefined();
    clearInterval(t); // must not throw
    expect(fired).toBe(0); // long period → never fired in this synchronous test
  });
});
