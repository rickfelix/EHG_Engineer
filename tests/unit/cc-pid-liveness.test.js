/**
 * SD-REFILL-00IO6NQJ — the shared CC-PID liveness SSOT.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isProcessRunning, getAliveCcPids, getMarkerSessionIds, MARKER_DIR } = require('../../lib/fleet/cc-pid-liveness.cjs');

describe('SD-REFILL-00IO6NQJ: cc-pid-liveness', () => {
  it('isProcessRunning is true for the current process', () => {
    expect(isProcessRunning(process.pid)).toBe(true);
  });

  it('isProcessRunning is false for invalid pids', () => {
    expect(isProcessRunning(0)).toBe(false);
    expect(isProcessRunning(null)).toBe(false);
    expect(isProcessRunning(undefined)).toBe(false);
    expect(isProcessRunning('123')).toBe(false); // non-number
  });

  it('isProcessRunning is false for a pid that does not exist', () => {
    // 2^30 is well above any live PID on these boxes → ESRCH (not EPERM).
    expect(isProcessRunning(1073741823)).toBe(false);
  });

  it('getMarkerSessionIds / getAliveCcPids return safe empties for a missing marker dir', () => {
    expect(getMarkerSessionIds('/no/such/marker/dir/xyz')).toEqual({});
    expect(getAliveCcPids('/no/such/marker/dir/xyz')).toBeInstanceOf(Set);
    expect(getAliveCcPids('/no/such/marker/dir/xyz').size).toBe(0);
  });

  it('exposes the canonical marker dir', () => {
    expect(typeof MARKER_DIR).toBe('string');
    expect(MARKER_DIR.replace(/\\/g, '/')).toMatch(/\.claude\/session-identity$/);
  });
});
