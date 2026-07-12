/**
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-1/FR-2
 *
 * lib/coordinator/relay-queue.cjs -- the tracked relay-request queue. Pure
 * selector mirrors receipts.cjs; enqueue/drain mirrors pending-question-timer.cjs's
 * core+tick split. No live git/gh/DB calls in these tests (all injected).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  selectUndrained,
  buildRelayRequestPayload,
  buildRelayConfirmPayload,
  enqueueRelayRequest,
  loadQueuedRelayRequests,
  assertValidConfirmTargetSafe,
  drainOne,
  drainRelayQueue,
} from '../../../lib/coordinator/relay-queue.cjs';
import { PAYLOAD_KINDS } from '../../../lib/fleet/worker-status.cjs';

// SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-3: drainOne's confirm insert now
// validates row.sender_session via assertValidTarget before use -- a real full UUID, not the
// pre-FR-3 fixtures' bare 's1', is required for the happy-path confirm-insert assertions below.
const LIVE_ASKER_SESSION = '11111111-1111-4111-8111-111111111111';

describe('selectUndrained — pure selector (TS-4)', () => {
  it('selects only undrained relay_request rows, zero IO', () => {
    const rows = [
      { id: 'r1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' }, acknowledged_at: null, created_at: '2026-07-01T00:00:00Z' },
      { id: 'r2', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c2', actioned_at: '2026-07-01T01:00:00Z' }, acknowledged_at: '2026-07-01T01:00:00Z', created_at: '2026-07-01T00:30:00Z' },
      { id: 'r3', payload: { kind: 'adam_advisory' }, acknowledged_at: null, created_at: '2026-07-01T00:00:00Z' },
    ];
    const result = selectUndrained(rows, { now: Date.parse('2026-07-01T02:00:00Z') });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('sorts oldest-first by age', () => {
    const now = Date.parse('2026-07-01T02:00:00Z');
    const rows = [
      { id: 'newer', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST }, acknowledged_at: null, created_at: '2026-07-01T01:50:00Z' },
      { id: 'older', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST }, acknowledged_at: null, created_at: '2026-07-01T00:00:00Z' },
    ];
    const result = selectUndrained(rows, { now });
    expect(result.map((r) => r.id)).toEqual(['older', 'newer']);
  });
});

describe('buildRelayRequestPayload / buildRelayConfirmPayload — pure builders', () => {
  it('builds a relay_request payload with the correct kind', () => {
    const payload = buildRelayRequestPayload({ relayTo: 'eva', body: 'hello', correlationId: 'c1' });
    expect(payload.kind).toBe(PAYLOAD_KINDS.RELAY_REQUEST);
    expect(payload.relay_to).toBe('eva');
    expect(payload.correlation_id).toBe('c1');
  });

  it('builds a relay_confirm payload correlated to the original request', () => {
    const payload = buildRelayConfirmPayload({ correlationId: 'c1', requestRowId: 'r1', relayedTo: 'eva' });
    expect(payload.kind).toBe(PAYLOAD_KINDS.RELAY_CONFIRM);
    expect(payload.correlation_id).toBe('c1');
    expect(payload.confirm_relay_of).toBe('r1');
  });
});

describe('enqueueRelayRequest — senderType provenance (adversarial-review finding, deep-tier PR review)', () => {
  function makeEnqueueStub() {
    const calls = { inserts: [] };
    return {
      calls,
      from(table) {
        return {
          insert(row) {
            calls.inserts.push({ table, row });
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'req-1', created_at: '2026-07-01T00:00:00Z' }, error: null }) }) };
          },
        };
      },
    };
  }

  it('stamps sender_type from the caller-provided senderType (adam)', async () => {
    const supabase = makeEnqueueStub();
    await enqueueRelayRequest(supabase, { senderSession: 's1', senderType: 'adam', relayTo: 'eva', body: 'hi', correlationId: 'c1' });
    expect(supabase.calls.inserts[0].row.sender_type).toBe('adam');
  });

  it('stamps sender_type from the caller-provided senderType (solomon)', async () => {
    const supabase = makeEnqueueStub();
    await enqueueRelayRequest(supabase, { senderSession: 's1', senderType: 'solomon', relayTo: 'ceo', body: 'hi', correlationId: 'c2' });
    expect(supabase.calls.inserts[0].row.sender_type).toBe('solomon');
  });

  it('falls back to "coordinator" if senderType is omitted (back-compat, not the correct value for a real caller)', async () => {
    const supabase = makeEnqueueStub();
    await enqueueRelayRequest(supabase, { senderSession: 's1', relayTo: 'eva', body: 'hi', correlationId: 'c3' });
    expect(supabase.calls.inserts[0].row.sender_type).toBe('coordinator');
  });
});

describe('loadQueuedRelayRequests — server-side undrained filter (CRITICAL, adversarial-review finding, deep-tier PR review)', () => {
  it('filters acknowledged_at IS NULL server-side, applied BEFORE order+limit', async () => {
    const calls = [];
    const supabase = {
      from(table) {
        const builder = {
          select(cols) { calls.push(['select', cols]); return builder; },
          eq(col, val) { calls.push(['eq', col, val]); return builder; },
          is(col, val) { calls.push(['is', col, val]); return builder; },
          order(col, opts) { calls.push(['order', col, opts]); return builder; },
          limit(n) { calls.push(['limit', n]); return builder; },
          then(resolve) { return Promise.resolve({ data: [] }).then(resolve); },
        };
        return builder;
      },
    };
    await loadQueuedRelayRequests(supabase);
    const isCall = calls.find((c) => c[0] === 'is');
    expect(isCall).toEqual(['is', 'acknowledged_at', null]);
    // Without this filter applied server-side (before limit), a >50-row lifetime backlog would
    // permanently hide any new relay_request once the oldest 50 rows are all drained.
    const isIdx = calls.findIndex((c) => c[0] === 'is');
    const limitIdx = calls.findIndex((c) => c[0] === 'limit');
    expect(isIdx).toBeLessThan(limitIdx);
  });
});

// targetLookup controls the claude_sessions maybeSingle() result assertValidTarget's live-session
// check queries -- default is a fresh-heartbeat row, so pre-FR-3 tests using LIVE_ASKER_SESSION
// keep confirming exactly as before FR-3 was added.
function makeSupabaseStub({
  updateError = null,
  insertError = null,
  claimMatches = true,
  targetLookup = { data: { session_id: LIVE_ASKER_SESSION, heartbeat_at: new Date().toISOString() }, error: null },
} = {}) {
  const calls = { updates: [], inserts: [] };
  return {
    calls,
    from(table) {
      if (table === 'claude_sessions') {
        return {
          select() {
            return {
              eq() {
                return {
                  limit() {
                    return { maybeSingle: () => Promise.resolve(targetLookup) };
                  },
                };
              },
            };
          },
        };
      }
      return {
        update(patch) {
          calls.updates.push({ table, patch });
          let usedSelect = false;
          const builder = {
            eq() { return builder; },
            is() { return builder; },
            select() { usedSelect = true; return builder; },
            then(resolve, reject) {
              const result = usedSelect
                ? { data: claimMatches ? [{ id: 'stub-row-id' }] : [], error: updateError }
                : { data: null, error: updateError };
              return Promise.resolve(result).then(resolve, reject);
            },
          };
          return builder;
        },
        insert(row) {
          calls.inserts.push({ table, row });
          return { error: insertError };
        },
      };
    },
  };
}

describe('drainOne — FR-2 CONFIRM-ON-RELAY (TS-7)', () => {
  it('on success, sets the same-row ACTIONED marker AND inserts a new relay_confirm row', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainOne(supabase, row, sendRelay, Date.parse('2026-07-01T00:00:00Z'));
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(true);
    // update #1 = the atomic claim (acknowledged_at only); update #2 = payload.actioned_at
    expect(supabase.calls.updates).toHaveLength(2);
    expect(supabase.calls.updates[0].patch.acknowledged_at).toBeTruthy();
    expect(supabase.calls.updates[1].patch.payload.actioned_at).toBeTruthy();
    expect(supabase.calls.inserts).toHaveLength(1);
    expect(supabase.calls.inserts[0].row.payload.kind).toBe(PAYLOAD_KINDS.RELAY_CONFIRM);
    expect(supabase.calls.inserts[0].row.payload.correlation_id).toBe('c1');
  });

  it('does not call sendRelay if the row was already claimed by another tick (Q2 race fix)', async () => {
    const supabase = makeSupabaseStub({ claimMatches: false });
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainOne(supabase, row, sendRelay);
    expect(sendRelay).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('claims the row BEFORE calling sendRelay (ordering, Q2 race fix)', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockImplementation(async () => {
      // At the moment sendRelay runs, the claim update must already have been recorded.
      expect(supabase.calls.updates).toHaveLength(1);
      expect(supabase.calls.updates[0].patch.acknowledged_at).toBeTruthy();
      return { ok: true };
    });
    await drainOne(supabase, row, sendRelay);
    expect(sendRelay).toHaveBeenCalledTimes(1);
  });

  it('un-claims the row (resets acknowledged_at to null) if sendRelay fails, so a future tick retries', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: false, error: 'delivery failed' });
    const result = await drainOne(supabase, row, sendRelay);
    expect(result.ok).toBe(false);
    expect(supabase.calls.updates).toHaveLength(2); // claim, then un-claim
    expect(supabase.calls.updates[1].patch.acknowledged_at).toBeNull();
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('un-claims the row if sendRelay THROWS instead of resolving {ok:false} (adversarial-review finding, deep-tier PR review)', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockRejectedValue(new Error('unexpected throw'));
    const result = await drainOne(supabase, row, sendRelay);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sendRelay threw/);
    expect(supabase.calls.updates).toHaveLength(2); // claim, then un-claim
    expect(supabase.calls.updates[1].patch.acknowledged_at).toBeNull();
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('does not insert a confirm row if sendRelay fails', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: false, error: 'delivery failed' });
    const result = await drainOne(supabase, row, sendRelay);
    expect(result.ok).toBe(false);
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('(Q3) still drains a row with a malformed/missing payload.relay_to -- confirm payload carries relayed_to:undefined rather than throwing', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' } }; // relay_to absent
    const sendRelay = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainOne(supabase, row, sendRelay);
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(supabase.calls.inserts[0].row.payload.relayed_to).toBeUndefined();
    expect(supabase.calls.inserts[0].row.subject).toContain('relayed to undefined');
  });

  it('(FR-3 pin) the atomic claim update never touches sender_session/created_at -- the original row provenance survives the claim step unchanged', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', created_at: '2026-07-01T00:00:00Z', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: true });
    await drainOne(supabase, row, sendRelay);
    const claimPatch = supabase.calls.updates[0].patch;
    expect(Object.keys(claimPatch)).toEqual(['acknowledged_at']);
    expect(claimPatch.sender_session).toBeUndefined();
    expect(claimPatch.created_at).toBeUndefined();
  });
});

describe('assertValidConfirmTargetSafe — FR-3 target validation, never throws (SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001)', () => {
  it('resolves ok:true for a full-UUID target with a fresh claude_sessions heartbeat', async () => {
    const supabase = makeSupabaseStub();
    const result = await assertValidConfirmTargetSafe(supabase, LIVE_ASKER_SESSION);
    expect(result).toEqual({ ok: true });
  });

  it('resolves ok:false (never throws) for a non-UUID, non-sentinel target', async () => {
    const supabase = makeSupabaseStub();
    const result = await assertValidConfirmTargetSafe(supabase, 's1');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not a full UUID/);
  });

  it('resolves ok:false for a full UUID matching no claude_sessions row (dead/unknown asker)', async () => {
    const supabase = makeSupabaseStub({ targetLookup: { data: null, error: null } });
    const result = await assertValidConfirmTargetSafe(supabase, LIVE_ASKER_SESSION);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/matches no claude_sessions row/);
  });

  it('resolves ok:false for a full UUID with a stale heartbeat (row exists but dead)', async () => {
    const staleHeartbeat = new Date(Date.now() - 20 * 60_000).toISOString(); // 20min > 10min cutoff
    const supabase = makeSupabaseStub({ targetLookup: { data: { session_id: LIVE_ASKER_SESSION, heartbeat_at: staleHeartbeat }, error: null } });
    const result = await assertValidConfirmTargetSafe(supabase, LIVE_ASKER_SESSION);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/heartbeat is stale/);
  });
});

describe('drainOne — FR-3 skips (never blocks) the confirm insert on an invalid/dead asker target', () => {
  it('drains successfully (relay already sent) but confirmed:false when the asker session is dead', async () => {
    const supabase = makeSupabaseStub({ targetLookup: { data: null, error: null } });
    const row = { id: 'r1', sender_session: LIVE_ASKER_SESSION, target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainOne(supabase, row, sendRelay);
    expect(sendRelay).toHaveBeenCalledTimes(1); // the relay itself still went out
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(result.error).toMatch(/confirm target invalid, insert skipped/);
    expect(supabase.calls.inserts).toHaveLength(0); // no confirm row attempted against a dead target
  });
});

describe('drainRelayQueue — tick entry point, fail-open', () => {
  it('never throws even if the supabase client itself throws', async () => {
    const throwingSupabase = { from() { throw new Error('DB unavailable'); } };
    const result = await drainRelayQueue(throwingSupabase, vi.fn());
    expect(result).toEqual({ drained: 0, failed: 0, errors: expect.any(Array) });
  });
});
