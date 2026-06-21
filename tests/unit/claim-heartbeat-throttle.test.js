// SD-LEO-INFRA-CLAIM-TTL-EXEC-HEARTBEAT-001 — pure throttle decision for the time-based claim heartbeat.
// shouldRefreshHeartbeat gates how often the PostToolUse hook touches claude_sessions.heartbeat_at:
// refresh when never-touched or aged >= throttle, and ALWAYS fail toward refreshing (the safe direction —
// a missed refresh costs a reap+steal; an extra write costs nothing).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { shouldRefreshHeartbeat, DEFAULT_THROTTLE_MS } = require('../../lib/claim/heartbeat-throttle.cjs');

describe('shouldRefreshHeartbeat', () => {
  const T = 120_000;

  it('refreshes when never touched (null/undefined/NaN)', () => {
    expect(shouldRefreshHeartbeat(null, 1_000_000, T)).toBe(true);
    expect(shouldRefreshHeartbeat(undefined, 1_000_000, T)).toBe(true);
    expect(shouldRefreshHeartbeat(NaN, 1_000_000, T)).toBe(true);
  });

  it('does NOT refresh inside the throttle window', () => {
    const now = 1_000_000;
    expect(shouldRefreshHeartbeat(now - 1, now, T)).toBe(false);           // 1ms ago
    expect(shouldRefreshHeartbeat(now - (T - 1), now, T)).toBe(false);     // just under the window
  });

  it('refreshes at and beyond the throttle boundary (>=)', () => {
    const now = 1_000_000;
    expect(shouldRefreshHeartbeat(now - T, now, T)).toBe(true);            // exactly at the window
    expect(shouldRefreshHeartbeat(now - (T + 5_000), now, T)).toBe(true);  // well aged
  });

  it('refreshes on clock skew / future stamp (safe direction)', () => {
    const now = 1_000_000;
    expect(shouldRefreshHeartbeat(now + 50_000, now, T)).toBe(true);       // last touch in the future
  });

  it('respects a custom throttleMs and exposes a sane default', () => {
    const now = 1_000_000;
    expect(shouldRefreshHeartbeat(now - 30_000, now, 20_000)).toBe(true);  // aged past a tighter window
    expect(shouldRefreshHeartbeat(now - 10_000, now, 20_000)).toBe(false); // inside a tighter window
    expect(DEFAULT_THROTTLE_MS).toBe(120_000);
    // default is comfortably inside the 900s claim TTL
    expect(DEFAULT_THROTTLE_MS).toBeLessThan(900_000);
  });
});
