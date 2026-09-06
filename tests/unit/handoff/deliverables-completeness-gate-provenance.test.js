// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-4: DELIVERABLES_COMPLETENESS must fail a
// deliverable marked completed post-cutover with no metadata.producer, and must not
// penalize a legitimately hand-completed (markDeliverableHandCompleted-stamped) row.
import { describe, it, expect } from 'vitest';
import { createDeliverablesCompletenessGate } from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js';
import { DELIVERABLES_PROVENANCE_CUTOVER } from '../../../scripts/modules/handoff/validation/semantic-gate-utils.js';

const AFTER = new Date(new Date(DELIVERABLES_PROVENANCE_CUTOVER).getTime() + 86400000).toISOString();
const BEFORE = new Date(new Date(DELIVERABLES_PROVENANCE_CUTOVER).getTime() - 86400000).toISOString();

function mockSupabase(deliverables) {
  return {
    from(table) {
      if (table !== 'sd_scope_deliverables') throw new Error(`unexpected table: ${table}`);
      return { select: () => ({ eq: async () => ({ data: deliverables, error: null }) }) };
    },
  };
}

const ctx = { sd: { id: 'SD-TEST-001', sd_type: 'feature' }, sdId: 'SD-TEST-001' };

describe('DELIVERABLES_COMPLETENESS provenance enforcement', () => {
  it('fails when a deliverable is completed post-cutover with no metadata.producer', async () => {
    const deliverables = [
      { id: '1', deliverable_name: 'Hand-typed UPDATE', completion_status: 'completed', completed_at: AFTER, metadata: {} },
      { id: '2', deliverable_name: 'Trigger-completed A', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'sd_completion_trigger' } },
      { id: '3', deliverable_name: 'Trigger-completed B', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'subagent_pass_trigger' } },
    ];
    const result = await createDeliverablesCompletenessGate(mockSupabase(deliverables)).validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.details.missing.some((m) => m.includes('unproven'))).toBe(true);
  });

  it('passes when every completion carries metadata.producer, including hand_completed', async () => {
    const deliverables = [
      { id: '1', deliverable_name: 'Hand-completed', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'hand_completed', producer_actor: 'Golf' } },
      { id: '2', deliverable_name: 'Trigger-completed A', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'sd_completion_trigger' } },
      { id: '3', deliverable_name: 'Trigger-completed B', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'subagent_pass_trigger' } },
    ];
    const result = await createDeliverablesCompletenessGate(mockSupabase(deliverables)).validator(ctx);

    expect(result.passed).toBe(true);
  });

  it('exempts rows that predate the FR-4 migration (no completed_at, or completed_at before cutover)', async () => {
    const deliverables = [
      { id: '1', deliverable_name: 'Pre-migration A', completion_status: 'completed', completed_at: null, metadata: {} },
      { id: '2', deliverable_name: 'Pre-migration B', completion_status: 'completed', completed_at: BEFORE, metadata: {} },
      { id: '3', deliverable_name: 'Pre-migration C', completion_status: 'done', completed_at: null, metadata: {} },
    ];
    const result = await createDeliverablesCompletenessGate(mockSupabase(deliverables)).validator(ctx);

    expect(result.passed).toBe(true);
  });
});
