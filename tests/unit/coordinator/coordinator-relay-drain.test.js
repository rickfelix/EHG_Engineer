/**
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-1/FR-2, TS-7
 *
 * scripts/coordinator-relay-drain.cjs's makeSendRelay -- previously untested (VALIDATION,
 * PLAN_VERIFICATION): the ONLY production callers of enqueueRelayRequest (adam-advisory.cjs /
 * solomon-advisory.cjs) enqueue exclusively relay-class peers (eva/ceo), yet the original
 * sendRelay unconditionally failed whenever resolvePeerTarget returned kind:'relay' -- meaning
 * every real relay-request ever queued would perpetually fail to drain and get wrongly flagged
 * by the FR-3 drop gauge as a real drop. These tests pin the fixed contract: a relay-class peer
 * (no live session ever exists, per peer-target.cjs's PEER_KINDS registry) is drained
 * successfully WITHOUT attempting a live-session insert.
 */
import { describe, it, expect } from 'vitest';
import { makeSendRelay } from '../../../scripts/coordinator-relay-drain.cjs';

function makeSupabaseSpy() {
  const inserts = [];
  return {
    inserts,
    from(table) {
      return {
        insert(row) {
          inserts.push({ table, row });
          return { error: null };
        },
      };
    },
  };
}

describe('makeSendRelay — relay-class peers (TS-7 fix)', () => {
  it('eva: returns ok:true without attempting a live-session insert', async () => {
    const supabase = makeSupabaseSpy();
    const sendRelay = makeSendRelay(supabase);
    const row = { id: 'r1', sender_session: 's1', target_session: 'coord1', payload: { relay_to: 'eva', body: 'hello', correlation_id: 'c1' } };
    const result = await sendRelay(row);
    expect(result).toEqual({ ok: true });
    expect(supabase.inserts).toHaveLength(0);
  });

  it('ceo: same contract as eva (both relay-class)', async () => {
    const supabase = makeSupabaseSpy();
    const sendRelay = makeSendRelay(supabase);
    const row = { id: 'r2', sender_session: 's1', target_session: 'coord1', payload: { relay_to: 'ceo', body: 'hi', correlation_id: 'c2' } };
    const result = await sendRelay(row);
    expect(result).toEqual({ ok: true });
    expect(supabase.inserts).toHaveLength(0);
  });
});

describe('makeSendRelay — malformed rows', () => {
  it('missing payload.relay_to fails loud (no silent success)', async () => {
    const supabase = makeSupabaseSpy();
    const sendRelay = makeSendRelay(supabase);
    const row = { id: 'r3', sender_session: 's1', target_session: 'coord1', payload: {} };
    const result = await sendRelay(row);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/relay_to/);
  });

  it('an unknown peer (resolvePeerTarget throws) is caught, not propagated', async () => {
    const supabase = makeSupabaseSpy();
    const sendRelay = makeSendRelay(supabase);
    const row = { id: 'r4', sender_session: 's1', target_session: 'coord1', payload: { relay_to: 'not-a-real-peer', correlation_id: 'c4' } };
    const result = await sendRelay(row);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown peer/i);
    expect(supabase.inserts).toHaveLength(0);
  });
});
