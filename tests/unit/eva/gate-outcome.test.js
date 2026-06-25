/**
 * FR-5 — recordGateOutcome (verdict+outcome data foundation)
 * SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001
 */
import { describe, it, expect } from 'vitest';
import { recordGateOutcome } from '../../../lib/eva/artifact-persistence-service.js';

function mockSb({ updateResult }) {
  const calls = { update: null, eqs: [] };
  const chain = {
    update: (vals) => { calls.update = vals; return chain; },
    eq: (k, v) => { calls.eqs.push([k, v]); return chain; },
    select: () => chain,
    maybeSingle: async () => updateResult,
  };
  return { sb: { from: () => chain }, calls };
}

describe('recordGateOutcome (FR-5)', () => {
  it('updates the gate row with resolved_outcome + outcome_resolved_at and returns the id', async () => {
    const { sb, calls } = mockSb({ updateResult: { data: { id: 'gate-1' }, error: null } });
    const id = await recordGateOutcome(sb, { ventureId: 'v1', stageNumber: 3, gateType: 'kill', outcome: 'survived' });
    expect(id).toBe('gate-1');
    expect(calls.update.resolved_outcome).toBe('survived');
    expect(calls.update.outcome_resolved_at).toBeTruthy();
    expect(calls.eqs).toContainEqual(['venture_id', 'v1']);
    expect(calls.eqs).toContainEqual(['stage_number', 3]);
    expect(calls.eqs).toContainEqual(['gate_type', 'kill']);
  });

  it('is non-blocking: returns null (no throw) when the additive columns are not yet migrated', async () => {
    const { sb } = mockSb({ updateResult: { data: null, error: { message: 'column "resolved_outcome" does not exist' } } });
    const id = await recordGateOutcome(sb, { ventureId: 'v1', stageNumber: 3, gateType: 'kill', outcome: 'survived' });
    expect(id).toBe(null);
  });

  it('maps code gate types to the DB constraint value', async () => {
    const { sb, calls } = mockSb({ updateResult: { data: { id: 'g2' }, error: null } });
    await recordGateOutcome(sb, { ventureId: 'v1', stageNumber: 5, gateType: 'stage_gate', outcome: 'killed' });
    expect(calls.eqs).toContainEqual(['gate_type', 'exit']);
  });

  it('honours an explicit resolvedAt timestamp', async () => {
    const { sb, calls } = mockSb({ updateResult: { data: { id: 'g3' }, error: null } });
    await recordGateOutcome(sb, { ventureId: 'v1', stageNumber: 5, gateType: 'kill', outcome: 'false_kill', resolvedAt: '2026-06-25T00:00:00.000Z' });
    expect(calls.update.outcome_resolved_at).toBe('2026-06-25T00:00:00.000Z');
  });
});
