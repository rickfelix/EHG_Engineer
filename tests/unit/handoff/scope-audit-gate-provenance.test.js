// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-4: SCOPE_AUDIT must not count a
// post-cutover, producer-less "completed" deliverable toward coverage.
import { describe, it, expect } from 'vitest';
import { createScopeAuditGate } from '../../../scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js';
import { DELIVERABLES_PROVENANCE_CUTOVER } from '../../../scripts/modules/handoff/validation/semantic-gate-utils.js';

const AFTER = new Date(new Date(DELIVERABLES_PROVENANCE_CUTOVER).getTime() + 86400000).toISOString();
const BEFORE = new Date(new Date(DELIVERABLES_PROVENANCE_CUTOVER).getTime() - 86400000).toISOString();

function mockSupabase({ sd, deliverables, prd }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: sd, error: null }) }) }) };
      }
      if (table === 'sd_scope_deliverables') {
        return { select: () => ({ eq: async () => ({ data: deliverables, error: null }) }) };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: prd, error: null }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const baseSd = { scope: '', key_changes: [], success_criteria: [] };
const ctx = { sd: { id: 'SD-TEST-001', sd_type: 'feature' }, sdId: 'SD-TEST-001' };

describe('SCOPE_AUDIT provenance enforcement', () => {
  it('fails when a deliverable is completed post-cutover with no metadata.producer', async () => {
    const deliverables = [
      { deliverable_name: 'Hand-typed UPDATE', completion_status: 'completed', completed_at: AFTER, metadata: {} },
      { deliverable_name: 'Trigger-completed A', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'sd_completion_trigger' } },
      { deliverable_name: 'Trigger-completed B', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'subagent_pass_trigger' } },
    ];
    const result = await createScopeAuditGate(mockSupabase({ sd: baseSd, deliverables, prd: null })).validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.details.incompleteDeliverables.some((m) => m.includes('unproven'))).toBe(true);
  });

  it('passes when every completion carries metadata.producer, including hand_completed', async () => {
    const deliverables = [
      { deliverable_name: 'Hand-completed', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'hand_completed', producer_actor: 'Golf' } },
      { deliverable_name: 'Trigger-completed A', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'sd_completion_trigger' } },
      { deliverable_name: 'Trigger-completed B', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'subagent_pass_trigger' } },
    ];
    const result = await createScopeAuditGate(mockSupabase({ sd: baseSd, deliverables, prd: null })).validator(ctx);

    expect(result.passed).toBe(true);
  });

  it('exempts rows that predate the FR-4 migration', async () => {
    const deliverables = [
      { deliverable_name: 'Pre-migration A', completion_status: 'completed', completed_at: null, metadata: {} },
      { deliverable_name: 'Pre-migration B', completion_status: 'completed', completed_at: BEFORE, metadata: {} },
      { deliverable_name: 'Pre-migration C', completion_status: 'done', completed_at: null, metadata: {} },
    ];
    const result = await createScopeAuditGate(mockSupabase({ sd: baseSd, deliverables, prd: null })).validator(ctx);

    expect(result.passed).toBe(true);
  });
});
