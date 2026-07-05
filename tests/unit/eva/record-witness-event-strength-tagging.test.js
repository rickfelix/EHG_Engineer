/**
 * SD-LEO-INFRA-GATE-WITNESS-STRENGTH-001: unit tests for the gate_witness_registry
 * lookup-and-stamp behavior added to recordWitnessEvent(). Mocked supabase client --
 * no DB access (that's covered by the live integration test).
 */
import { describe, it, expect, vi } from 'vitest';
import { recordWitnessEvent } from '../../../lib/eva/record-witness-event.js';

function makeSupabase({ registryRow, registryError, insertedRow }) {
  const registryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: registryRow ?? null, error: registryError ?? null }),
  };
  const eventsChain = {
    insert: vi.fn().mockImplementation((payload) => ({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: insertedRow ?? { id: 'evt-1', ...payload }, error: null }),
    })),
  };
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'gate_witness_registry') return registryChain;
      if (table === 'gate_witness_events') return eventsChain;
      throw new Error(`unexpected table: ${table}`);
    }),
    _eventsChain: eventsChain,
  };
}

describe('recordWitnessEvent() -- strength tagging', () => {
  it('stamps enforcement_strength=convention/witness_mechanism=cross_actor/is_downgrade=true for a convention-tier gate', async () => {
    const supabase = makeSupabase({
      registryRow: { enforcement_strength: 'convention', witness_mechanism: 'cross_actor' },
    });

    await recordWitnessEvent(supabase, {
      gateId: 'RETROSPECTIVE_EXISTS',
      witnessSessionId: 'gate-harness',
      judgedSessionId: 'session-a',
      verdict: 'witnessed',
    });

    const insertCall = supabase._eventsChain.insert.mock.calls[0][0];
    expect(insertCall.enforcement_strength).toBe('convention');
    expect(insertCall.witness_mechanism).toBe('cross_actor');
    expect(insertCall.is_downgrade).toBe(true);
  });

  it('stamps enforcement_strength=structural/is_downgrade=false for a structural-tier gate', async () => {
    const supabase = makeSupabase({
      registryRow: { enforcement_strength: 'structural', witness_mechanism: 'external_system' },
    });

    await recordWitnessEvent(supabase, {
      gateId: 'PR_PRECHECK',
      witnessSessionId: 'gate-harness',
      judgedSessionId: 'session-a',
      verdict: 'witnessed',
    });

    const insertCall = supabase._eventsChain.insert.mock.calls[0][0];
    expect(insertCall.enforcement_strength).toBe('structural');
    expect(insertCall.witness_mechanism).toBe('external_system');
    expect(insertCall.is_downgrade).toBe(false);
  });

  it('stamps all 3 fields null/false for an unregistered gate_id, without throwing', async () => {
    const supabase = makeSupabase({ registryRow: null, registryError: { message: 'not found' } });

    await recordWitnessEvent(supabase, {
      gateId: 'SOME_UNREGISTERED_GATE',
      witnessSessionId: 'gate-harness',
      judgedSessionId: 'session-a',
      verdict: 'witnessed',
    });

    const insertCall = supabase._eventsChain.insert.mock.calls[0][0];
    expect(insertCall.enforcement_strength).toBeNull();
    expect(insertCall.witness_mechanism).toBeNull();
    expect(insertCall.is_downgrade).toBe(false);
  });

  it('still throws on the pre-existing self-judge guard, before any registry lookup matters', async () => {
    const supabase = makeSupabase({ registryRow: { enforcement_strength: 'convention', witness_mechanism: 'cross_actor' } });

    await expect(recordWitnessEvent(supabase, {
      gateId: 'RETROSPECTIVE_EXISTS',
      witnessSessionId: 'same-session',
      judgedSessionId: 'same-session',
      verdict: 'witnessed',
    })).rejects.toThrow('must differ');
  });

  it('still throws on the pre-existing verdict validation guard', async () => {
    const supabase = makeSupabase({ registryRow: { enforcement_strength: 'convention', witness_mechanism: 'cross_actor' } });

    await expect(recordWitnessEvent(supabase, {
      gateId: 'RETROSPECTIVE_EXISTS',
      witnessSessionId: 'gate-harness',
      judgedSessionId: 'session-a',
      verdict: 'maybe',
    })).rejects.toThrow("must be 'witnessed' or 'rejected'");
  });
});
