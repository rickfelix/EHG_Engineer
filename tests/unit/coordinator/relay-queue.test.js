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
  drainOne,
  drainRelayQueue,
} from '../../../lib/coordinator/relay-queue.cjs';
import { PAYLOAD_KINDS } from '../../../lib/fleet/worker-status.cjs';

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

function makeSupabaseStub({ updateError = null, insertError = null, claimMatches = true } = {}) {
  const calls = { updates: [], inserts: [] };
  return {
    calls,
    from(table) {
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
    const row = { id: 'r1', sender_session: 's1', target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
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
    const row = { id: 'r1', sender_session: 's1', target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainOne(supabase, row, sendRelay);
    expect(sendRelay).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('claims the row BEFORE calling sendRelay (ordering, Q2 race fix)', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: 's1', target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
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
    const row = { id: 'r1', sender_session: 's1', target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: false, error: 'delivery failed' });
    const result = await drainOne(supabase, row, sendRelay);
    expect(result.ok).toBe(false);
    expect(supabase.calls.updates).toHaveLength(2); // claim, then un-claim
    expect(supabase.calls.updates[1].patch.acknowledged_at).toBeNull();
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('does not insert a confirm row if sendRelay fails', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: 's1', target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1', relay_to: 'eva' } };
    const sendRelay = vi.fn().mockResolvedValue({ ok: false, error: 'delivery failed' });
    const result = await drainOne(supabase, row, sendRelay);
    expect(result.ok).toBe(false);
    expect(supabase.calls.inserts).toHaveLength(0);
  });

  it('(Q3) still drains a row with a malformed/missing payload.relay_to -- confirm payload carries relayed_to:undefined rather than throwing', async () => {
    const supabase = makeSupabaseStub();
    const row = { id: 'r1', sender_session: 's1', target_session: 'coord1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' } }; // relay_to absent
    const sendRelay = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainOne(supabase, row, sendRelay);
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(supabase.calls.inserts[0].row.payload.relayed_to).toBeUndefined();
    expect(supabase.calls.inserts[0].row.subject).toContain('relayed to undefined');
  });
});

describe('drainRelayQueue — tick entry point, fail-open', () => {
  it('never throws even if the supabase client itself throws', async () => {
    const throwingSupabase = { from() { throw new Error('DB unavailable'); } };
    const result = await drainRelayQueue(throwingSupabase, vi.fn());
    expect(result).toEqual({ drained: 0, failed: 0, errors: expect.any(Array) });
  });
});
