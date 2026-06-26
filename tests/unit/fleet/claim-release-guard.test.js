import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { shouldHoldClaim } = require('../../../lib/fleet/claim-release-guard.cjs');

// SD-LEO-INFRA-STALE-SWEEP-PID-LIVENESS-GUARD-001: the release guard must HOLD a stale-heartbeat
// claim whose holder PID is alive, and RELEASE one whose PID is genuinely dead.

const STALE_HB = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min stale

describe('shouldHoldClaim (PID-liveness release guard)', () => {
  it('HOLDS a stale-heartbeat claim whose PID is ALIVE (parked /loop worker)', () => {
    const alive = new Set(['12345']);
    const session = { session_id: 's1', terminal_id: 'win-cc-3000-12345', heartbeat_at: STALE_HB, is_alive: false };
    const r = shouldHoldClaim(session, { aliveCcPids: alive });
    expect(r.hold).toBe(true);
    expect(r.reason).toBe('pid_alive');
  });

  it('RELEASES a stale-heartbeat claim whose PID is DEAD', () => {
    const alive = new Set(['99999']); // holder's PID 12345 not in the alive set
    const session = { session_id: 's2', terminal_id: 'win-cc-3000-12345', heartbeat_at: STALE_HB, is_alive: false };
    const r = shouldHoldClaim(session, { aliveCcPids: alive });
    expect(r.hold).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('HOLDS when the raw is_alive flag is true (regardless of heartbeat)', () => {
    const session = { session_id: 's3', terminal_id: 'win-cc-3000-12345', heartbeat_at: STALE_HB, is_alive: true };
    const r = shouldHoldClaim(session, { aliveCcPids: new Set() });
    expect(r.hold).toBe(true);
    expect(r.reason).toBe('raw_is_alive');
  });

  it('HOLDS on a fresh heartbeat even when PID is unknown', () => {
    const session = { session_id: 's4', terminal_id: 'uuid-no-pid', heartbeat_at: new Date().toISOString(), is_alive: false };
    const r = shouldHoldClaim(session, { aliveCcPids: new Set() });
    expect(r.hold).toBe(true);
    expect(r.reason).toBe('fresh_heartbeat');
  });

  it('RELEASES a dead session with no liveness signal at all', () => {
    const session = { session_id: 's5', terminal_id: 'win-cc-3000-12345', heartbeat_at: STALE_HB, is_alive: false };
    const r = shouldHoldClaim(session, { aliveCcPids: new Set() });
    expect(r.hold).toBe(false);
  });

  it('RELEASES a null/absent session (nothing to protect)', () => {
    expect(shouldHoldClaim(null).hold).toBe(false);
  });
});
