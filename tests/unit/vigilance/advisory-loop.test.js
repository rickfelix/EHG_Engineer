/**
 * FR-2 reprioritization advisory loop — pure unit tests (DB-free chainable stub).
 * Advice only — never auto-reprioritization: this suite proves the loop WRITES a typed advisory
 * row (never mutates any lane/routing/priority field directly).
 */
import { describe, it, expect } from 'vitest';
import { sendReprioritizationAdvisory, GATE_TYPE } from '../../../lib/vigilance/advisory-loop.js';
import { LANE } from '../../../lib/sourcing-engine/lane.js';

const upsertStub = () => {
  const upserts = [];
  return {
    upserts,
    supabase: {
      from(table) {
        return {
          upsert(row, opts) {
            upserts.push({ table, row, opts });
            return { select: () => Promise.resolve({ data: [{ id: 'q_' + upserts.length }], error: null }) };
          },
        };
      },
    },
  };
};

describe('vigilance advisory loop (FR-2)', () => {
  it('sends a typed, idempotent advisory for a vigilance observation — advice only, distinct gate_type from router-originated rows', async () => {
    const { supabase, upserts } = upsertStub();
    const observation = { id: 'ev_1', subject_type: 'competitor', subject_id: 'Acme Rival', payload: { thesis: 'pricing_pressure', summary: 'price drop' } };

    const result = await sendReprioritizationAdvisory(observation, { supabase });

    expect(result.escalated).toBe(true);
    expect(upserts).toHaveLength(1);
    const row = upserts[0].row;
    expect(row.source_id).toBe('ev_1');
    expect(row.lane).toBe(LANE.OUTCOME_GATED);
    expect(row.gate_type).toBe('vigilance_reprioritization');
    expect(row.gate_type).toBe(GATE_TYPE);
    expect(row.escalation_type).toBe('vigilance_reprioritization');
    expect(row.context.observation_id).toBe('ev_1');
    expect(row.context.source_module).toBe('vigilance_loop');
    // idempotency key matches escalator.js's own convention (never a raw insert)
    expect(upserts[0].opts.onConflict).toBe('source_id,gate_type');
  });

  it('is fail-soft (never throws) with no observation id', async () => {
    const { supabase } = upsertStub();
    const result = await sendReprioritizationAdvisory({}, { supabase });
    expect(result.escalated).toBe(false);
    expect(result.reason).toBe('no_observation_id');
  });

  it('never writes to any lane/routing/priority table directly — only sourcing_chairman_queue', async () => {
    const { supabase, upserts } = upsertStub();
    await sendReprioritizationAdvisory({ id: 'ev_2' }, { supabase });
    expect(upserts.every((u) => u.table === 'sourcing_chairman_queue')).toBe(true);
  });
});
