/**
 * SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 (FR-2) — both-direction adversarial tests
 * for the hardened liveness predicate.
 *
 * PURE, no DB. ownerIsDeadByLiveness / isHeartbeatStale ARE the reap decision: the
 * claim-validity gate auto-releases an orphaned claim iff (ownerIsDead && !silenced) OR
 * sd_key drift — so proving the predicate proves the reap behavior. The two mandatory
 * directions: (a) a genuinely-dead owner IS still reaped (no claim held forever);
 * (b) a live-but-lagging owner (is_alive=false BUT fresh heartbeat) is NOT reaped (thrash stops).
 */
import { describe, it, expect } from 'vitest';
import { ownerIsDeadByLiveness, isHeartbeatStale, CLAIM_TTL_MS } from '../../lib/claim-validity-gate.js';

const NOW = 1_700_000_000_000;
const minsAgo = (m) => NOW - m * 60_000;
const secsAgo = (s) => NOW - s * 1000;

describe('isHeartbeatStale (FR-1 — heartbeat is the liveness source of truth)', () => {
  it('CLAIM_TTL_MS is the documented ~15-min claim TTL', () => {
    expect(CLAIM_TTL_MS).toBe(900_000);
  });
  it('a fresh heartbeat (within TTL) is NOT stale', () => {
    expect(isHeartbeatStale(minsAgo(5), NOW)).toBe(false);
  });
  it('a heartbeat older than the TTL IS stale', () => {
    expect(isHeartbeatStale(minsAgo(20), NOW)).toBe(true);
  });
  it('boundary: exactly at the TTL is NOT stale; one ms past IS stale (strictly greater)', () => {
    expect(isHeartbeatStale(NOW - CLAIM_TTL_MS, NOW)).toBe(false);
    expect(isHeartbeatStale(NOW - CLAIM_TTL_MS - 1, NOW)).toBe(true);
  });
  it('FAIL-OPEN: a missing/null/undefined heartbeat is treated as stale', () => {
    expect(isHeartbeatStale(null, NOW)).toBe(true);
    expect(isHeartbeatStale(undefined, NOW)).toBe(true);
  });
  it('FAIL-OPEN: an unparseable heartbeat is treated as stale', () => {
    expect(isHeartbeatStale('not-a-date', NOW)).toBe(true);
  });
  it('accepts ISO-string and Date inputs', () => {
    expect(isHeartbeatStale(new Date(minsAgo(5)).toISOString(), NOW)).toBe(false);
    expect(isHeartbeatStale(new Date(minsAgo(30)), NOW)).toBe(true);
  });
  it('a non-finite now cannot judge staleness -> NOT stale (never false-reap a live-looking owner)', () => {
    expect(isHeartbeatStale(minsAgo(999), NaN)).toBe(false);
  });
});

describe('ownerIsDeadByLiveness — both mandatory directions (FR-2)', () => {
  // ── Direction (a): genuinely-dead owner IS still reaped ──────────────────
  it('(a) is_alive=false AND stale heartbeat (>900s) => DEAD (claim reaped)', () => {
    expect(ownerIsDeadByLiveness({ is_alive: false, heartbeat_at: minsAgo(20) }, NOW)).toBe(true);
  });
  it('(a) is_alive=false AND no heartbeat => DEAD (fail-open, reaped)', () => {
    expect(ownerIsDeadByLiveness({ is_alive: false, heartbeat_at: null }, NOW)).toBe(true);
  });

  // ── Direction (b): live-but-lagging owner is NOT reaped (thrash stops) ────
  it('(b) is_alive=false BUT fresh heartbeat (30s ago) => NOT dead (thrash stops)', () => {
    expect(ownerIsDeadByLiveness({ is_alive: false, heartbeat_at: secsAgo(30) }, NOW)).toBe(false);
  });
  it('(b) is_alive=false BUT heartbeat just within the TTL (14m ago) => NOT dead', () => {
    expect(ownerIsDeadByLiveness({ is_alive: false, heartbeat_at: minsAgo(14) }, NOW)).toBe(false);
  });

  // ── Fail-open: missing owner + explicit lifecycle statuses still dead ─────
  it('a missing owner is DEAD (fail-open preserved)', () => {
    expect(ownerIsDeadByLiveness(null, NOW)).toBe(true);
    expect(ownerIsDeadByLiveness(undefined, NOW)).toBe(true);
  });
  it("status 'stale'/'released' is DEAD regardless of a fresh heartbeat (explicit lifecycle wins)", () => {
    expect(ownerIsDeadByLiveness({ status: 'stale', is_alive: true, heartbeat_at: secsAgo(1) }, NOW)).toBe(true);
    expect(ownerIsDeadByLiveness({ status: 'released', is_alive: true, heartbeat_at: secsAgo(1) }, NOW)).toBe(true);
  });

  // ── No regression: is_alive=true was never reaped and still isn't ─────────
  it('a fully-live owner (is_alive=true, fresh heartbeat) is NOT dead', () => {
    expect(ownerIsDeadByLiveness({ status: 'active', is_alive: true, heartbeat_at: minsAgo(5) }, NOW)).toBe(false);
  });
  it('is_alive=true with a stale heartbeat is still NOT dead (only is_alive=false consults heartbeat; no regression)', () => {
    expect(ownerIsDeadByLiveness({ is_alive: true, heartbeat_at: minsAgo(999) }, NOW)).toBe(false);
  });
});
