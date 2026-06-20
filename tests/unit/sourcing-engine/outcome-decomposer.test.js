/**
 * SD-LEO-INFRA-SOURCING-ENGINE-OUTCOME-DECOMPOSER-001 (child 7/10) — FR-6 unit tests.
 *
 * The outcome-gated decomposer: PROPOSE a fleet-buildable enabler list + PAUSE for chairman review.
 *   FR-1: pure decomposeOutcome maps the candidate's enabler hints -> proposed enablers with rationale.
 *   FR-2: propose-and-pause writes ONE pending chairman-queue row (gate_type='outcome_decomposition');
 *         NO enabler SD is auto-created.
 *   FR-3: reuses routeCandidate (lane guard) + the shipped escalator (one queue-writer SSOT).
 *   FR-4: idempotent — a re-run upserts on (source_id, 'outcome_decomposition'), no duplicate.
 */
import { describe, it, expect } from 'vitest';
import {
  decomposeOutcome,
  proposeOutcomeDecomposition,
  DECOMPOSITION_GATE_TYPE,
} from '../../../lib/sourcing-engine/outcome-decomposer.js';
import { LANE } from '../../../lib/sourcing-engine/lane.js';
import { routeCandidate } from '../../../lib/sourcing-engine/router.js';

// A recording supabase stub: from().upsert().select() resolves to `result`; records every call+table.
function recordingSupabase(result = { data: [{ id: 'q1' }], error: null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table };
      const api = {
        upsert(row, opts) { q.op = 'upsert'; q.row = row; q.opts = opts; calls.push(q); return api; },
        insert(row) { q.op = 'insert'; q.row = row; calls.push(q); return api; },
        select(cols) { q.select = cols; return api; },
        then(resolve) { return resolve(result); },
      };
      return api;
    },
  };
}

describe('FR-1: decomposeOutcome (pure)', () => {
  it('maps string enabler hints to proposed enablers with an outcome-linked rationale', () => {
    const d = decomposeOutcome({
      title: 'Venture is EARNING real revenue',
      enablers: ['Payment rail integration', 'Revenue instrumentation surface'],
      targetRung: 'V2',
    });
    expect(d.outcome).toBe('Venture is EARNING real revenue');
    expect(d.target_rung).toBe('V2');
    expect(d.proposed_count).toBe(2);
    expect(d.enablers[0]).toMatchObject({ capability: 'Payment rail integration', buildable: true, target_rung: 'V2' });
    expect(d.enablers[0].rationale).toContain('Venture is EARNING real revenue');
  });

  it('accepts object hints (capability/title + per-enabler rung + rationale)', () => {
    const d = decomposeOutcome({
      title: '>=90% breakage caught',
      enablers: [{ capability: 'Breakage detector', target_rung: 'V1', rationale: 'Detects breaks to measure the rate' }],
    });
    expect(d.enablers[0]).toMatchObject({ capability: 'Breakage detector', target_rung: 'V1', rationale: 'Detects breaks to measure the rate' });
  });

  it('proposes nothing (safe) when there are no enabler hints, and records a reason', () => {
    const d = decomposeOutcome({ title: 'Distance-to-quit instrumented' });
    expect(d.proposed_count).toBe(0);
    expect(d.enablers).toEqual([]);
    expect(d.reason).toBe('no_enabler_hints');
  });

  it('skips empty/malformed hints rather than emitting a blank enabler', () => {
    const d = decomposeOutcome({ title: 'O', enablers: ['', '   ', {}, { capability: '' }, 'Real enabler'] });
    expect(d.proposed_count).toBe(1);
    expect(d.enablers[0].capability).toBe('Real enabler');
  });

  it('is crash-safe on null/undefined input (house-style pure primitive)', () => {
    for (const bad of [null, undefined]) {
      const d = decomposeOutcome(bad);
      expect(d).toMatchObject({ outcome: null, target_rung: null, enablers: [], proposed_count: 0, reason: 'no_enabler_hints' });
    }
  });
});

describe('FR-2/FR-3/FR-4: proposeOutcomeDecomposition (propose-and-pause)', () => {
  const outcomeCandidate = { source_id: 'led-7', title: 'Venture is EARNING', needsOutcome: true, targetRung: 'V2', enablers: ['Payment rail'] };

  it('writes ONE pending chairman-queue row with the decomposition gate_type + proposed enablers', async () => {
    const sb = recordingSupabase({ data: [{ id: 'qid' }], error: null });
    const res = await proposeOutcomeDecomposition(outcomeCandidate, null, { supabase: sb, nowIso: '2026-06-20T00:00:00.000Z' });
    expect(res.proposed).toBe(true);
    expect(sb.calls).toHaveLength(1);
    const call = sb.calls[0];
    expect(call.table).toBe('sourcing_chairman_queue');
    expect(call.op).toBe('upsert');
    expect(call.row.gate_type).toBe('outcome_decomposition');
    expect(call.row.state).toBe('pending');
    expect(call.row.context.proposed_enablers[0]).toMatchObject({ capability: 'Payment rail', buildable: true });
    expect(call.row.context.decomposition_source).toBe('outcome-decomposer');
  });

  it('does NOT auto-create any enabler SD (no insert into strategic_directives_v2)', async () => {
    const sb = recordingSupabase();
    await proposeOutcomeDecomposition(outcomeCandidate, null, { supabase: sb });
    expect(sb.calls.every((c) => c.table === 'sourcing_chairman_queue')).toBe(true);
    expect(sb.calls.some((c) => c.table === 'strategic_directives_v2')).toBe(false);
    expect(sb.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('is idempotent — upserts on (source_id, gate_type); a conflict returns proposed:true without duplicating', async () => {
    const sb = recordingSupabase({ data: [], error: null }); // ignoreDuplicates => empty on conflict
    const res = await proposeOutcomeDecomposition(outcomeCandidate, null, { supabase: sb });
    expect(res.proposed).toBe(true);
    expect(res.queue.deduped).toBe(true);
    expect(sb.calls[0].opts).toMatchObject({ onConflict: 'source_id,gate_type', ignoreDuplicates: true });
  });

  it('skips a non-outcome-gated candidate (reuses routeCandidate lane verdict)', async () => {
    const sb = recordingSupabase();
    const beltReady = { source_id: 'b', title: 'plain buildable' };
    expect(routeCandidate(beltReady).lane).toBe(LANE.BELT_READY);
    const res = await proposeOutcomeDecomposition(beltReady, null, { supabase: sb });
    expect(res).toMatchObject({ proposed: false, reason: 'not_outcome_gated' });
    expect(sb.calls).toHaveLength(0);
  });

  it('the decomposition gate_type constant is distinct from the lane-named gate', () => {
    expect(DECOMPOSITION_GATE_TYPE).toBe('outcome_decomposition');
    expect(DECOMPOSITION_GATE_TYPE).not.toBe(LANE.OUTCOME_GATED);
  });
});
