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
import { resolveEvidenceClient } from '../../lib/sub-agent-executor/results-storage.js';
import { ownerIsDeadByLiveness, isHeartbeatStale, CLAIM_TTL_MS } from '../../lib/claim-validity-gate.js';

/** A minimal PostgREST-like chainable thenable returning a fixed result. */
function fakeBuilder(result = { data: [{ id: 'evt-1' }], error: null }) {
  const b = {
    insert() { return b; },
    update() { return b; },
    upsert() { return b; },
    delete() { return b; },
    select() { return b; },
    eq() { return b; },
    single() { return b; },
    maybeSingle() { return b; },
    then(onF, onR) { return Promise.resolve(result).then(onF, onR); },
    catch(onR) { return Promise.resolve(result).catch(onR); },
  };
  return b;
}

/** A fake supabase client recording which tables were touched. */
function fakeClient() {
  const touched = [];
  return {
    touched,
    from(table) { touched.push(table); return fakeBuilder(); },
  };
}

describe('resolveEvidenceClient — FR-1 wire (heartbeat on sub-agent evidence write)', () => {
  it('returns the RAW client unchanged when no session id is provided (fail-soft, non-fleet)', () => {
    const raw = fakeClient();
    expect(resolveEvidenceClient(raw, undefined)).toBe(raw);
    expect(resolveEvidenceClient(raw, null)).toBe(raw);
    expect(resolveEvidenceClient(raw, '')).toBe(raw);
    expect(resolveEvidenceClient(raw, '   ')).toBe(raw);
  });

  it('returns a WRAPPED client (not the raw one) when a session id is provided', () => {
    const raw = fakeClient();
    const wrapped = resolveEvidenceClient(raw, 'sess-123', { heartbeatFn: async () => {} });
    expect(wrapped).not.toBe(raw);
    expect(typeof wrapped.from).toBe('function');
  });

  it('fires exactly ONE heartbeat ping for the owner after a sub_agent_execution_results insert', async () => {
    const raw = fakeClient();
    const pinged = [];
    const wrapped = resolveEvidenceClient(raw, 'sess-owner', { heartbeatFn: async (sid) => { pinged.push(sid); } });
    await wrapped.from('sub_agent_execution_results').insert({ verdict: 'PASS' });
    // ping is fire-and-forget (microtask) — flush the queue before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(pinged).toEqual(['sess-owner']);
  });

  it('does NOT fire a heartbeat ping when writing a non-trigger table', async () => {
    const raw = fakeClient();
    const pinged = [];
    const wrapped = resolveEvidenceClient(raw, 'sess-owner', { heartbeatFn: async (sid) => { pinged.push(sid); } });
    await wrapped.from('some_other_table').insert({ x: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(pinged).toEqual([]);
  });

  it('is fail-soft: a heartbeat ping rejection never breaks the caller write', async () => {
    const raw = fakeClient();
    const wrapped = resolveEvidenceClient(raw, 'sess-owner', { heartbeatFn: async () => { throw new Error('ping boom'); } });
    const res = await wrapped.from('sub_agent_execution_results').insert({ verdict: 'PASS' });
    await new Promise((r) => setTimeout(r, 0));
    expect(res.error).toBeNull(); // the insert still resolved fine
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
