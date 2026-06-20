/**
 * SD-LEO-INFRA-CLAIM-TTL-LONG-SUBAGENT-TICK-001
 *
 * A worker's claim is reaped once claude_sessions.heartbeat_at crosses the 900s (15min) boundary
 * and the stored pid is dead. During a long tick running parallel sub-agent reviews, the original
 * claim-acquiring `node` process has exited and nothing refreshes heartbeat_at between tool calls,
 * so a >15min review tick lets the claim lapse → the next handoff trips GATE_CLAIM_VALIDITY_FAILED.
 *
 * The fix (FR-1) wires the pre-built withHeartbeat proxy into the canonical sub-agent evidence
 * writer via resolveEvidenceClient, so each evidence write refreshes the owner's heartbeat at WORK
 * frequency. These tests pin: (FR-1) the wire mechanism, (FR-2) that genuine reaping is preserved,
 * and (FR-3) that a heartbeat-refreshed long tick stays claim-valid.
 */
import { describe, it, expect } from 'vitest';
import { touchOwnerHeartbeat } from '../../lib/sub-agent-executor/results-storage.js';
import { ownerIsDeadByLiveness, isHeartbeatStale, CLAIM_TTL_MS } from '../../lib/claim-validity-gate.js';

describe('touchOwnerHeartbeat — FR-1 (refresh claim heartbeat on sub-agent evidence write)', () => {
  it('is a no-op (returns false, no ping) when no session id is provided (non-fleet, fail-soft)', async () => {
    const pinged = [];
    const spy = async (sid) => { pinged.push(sid); };
    expect(await touchOwnerHeartbeat(undefined, spy)).toBe(false);
    expect(await touchOwnerHeartbeat(null, spy)).toBe(false);
    expect(await touchOwnerHeartbeat('', spy)).toBe(false);
    expect(await touchOwnerHeartbeat('   ', spy)).toBe(false);
    expect(pinged).toEqual([]);
  });

  it('fires exactly ONE heartbeat ping for the owning session when a session id is provided', async () => {
    const pinged = [];
    const ok = await touchOwnerHeartbeat('sess-owner', async (sid) => { pinged.push(sid); });
    expect(ok).toBe(true);
    expect(pinged).toEqual(['sess-owner']);
  });

  it('is fail-soft: a ping rejection is swallowed (returns false, does not throw)', async () => {
    let returned;
    await expect(
      (async () => { returned = await touchOwnerHeartbeat('sess-owner', async () => { throw new Error('ping boom'); }); })()
    ).resolves.toBeUndefined(); // the call itself never rejects
    expect(returned).toBe(false);
  });

  it('FR-2 by construction: a session that performs no evidence write never pings (no zombie heartbeat)', async () => {
    // touchOwnerHeartbeat is only reached AFTER an evidence row lands. A dead session writes nothing,
    // so this is never called for it. We assert the guard itself never pings without a session id —
    // i.e. it cannot fabricate liveness for a session that did no work.
    const pinged = [];
    await touchOwnerHeartbeat(undefined, async (sid) => { pinged.push(sid); });
    expect(pinged).toEqual([]);
  });
});

describe('FR-3 — a heartbeat-refreshed long tick stays claim-valid', () => {
  const now = 1_000_000_000_000; // fixed reference now (ms)

  it('a claim refreshed by recent evidence writes is NOT stale even after the original 15min would have elapsed', () => {
    // The evidence writes refreshed heartbeat_at to "60s ago" — well under the 900s TTL — so the
    // claim that was ACQUIRED >15min ago is nonetheless live (the refresh reset the clock).
    const refreshedHeartbeat = new Date(now - 60_000).toISOString();
    expect(isHeartbeatStale(refreshedHeartbeat, now)).toBe(false);
  });

  it('a live-but-busy owner (is_alive=true) is never declared dead by liveness, refreshed or not', () => {
    const busyOwner = { is_alive: true, status: 'active', heartbeat_at: new Date(now - 60_000).toISOString() };
    expect(ownerIsDeadByLiveness(busyOwner, now)).toBe(false);
  });
});

describe('FR-2 — genuine stale-claim reaping is preserved', () => {
  const now = 1_000_000_000_000;

  it('a no-write session (stale heartbeat + is_alive=false) is STILL declared dead', () => {
    const deadOwner = { is_alive: false, status: 'active', heartbeat_at: new Date(now - (CLAIM_TTL_MS + 60_000)).toISOString() };
    expect(ownerIsDeadByLiveness(deadOwner, now)).toBe(true);
  });

  it('a heartbeat older than the 900s TTL is stale', () => {
    expect(isHeartbeatStale(new Date(now - (CLAIM_TTL_MS + 1)).toISOString(), now)).toBe(true);
  });

  it('a released/stale-status owner is dead regardless of heartbeat', () => {
    expect(ownerIsDeadByLiveness({ status: 'released', is_alive: true, heartbeat_at: new Date(now).toISOString() }, now)).toBe(true);
    expect(ownerIsDeadByLiveness({ status: 'stale', is_alive: true, heartbeat_at: new Date(now).toISOString() }, now)).toBe(true);
  });

  it('a null owner is dead', () => {
    expect(ownerIsDeadByLiveness(null, now)).toBe(true);
  });
});
