/**
 * Vitest specs for parent-exec-gate.
 * QF-20260906-901.
 *
 * Specimens replayed: SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A and
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A both passed LEAD-TO-PLAN while their orchestrator
 * parent sat draft/LEAD with zero sd_phase_handoffs rows.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isParentReadyForChildren, isBindingEnabled, createParentExecGate } from './parent-exec-gate.js';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makeSupabase({ parent, handoffs = [] }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: parent, error: null }),
            }),
          }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ data: handoffs, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('isParentReadyForChildren', () => {
  it('is ready when status=in_progress AND current_phase=EXEC', () => {
    expect(isParentReadyForChildren({ status: 'in_progress', current_phase: 'EXEC' }, false)).toBe(true);
  });

  it('is ready when an accepted PLAN-TO-EXEC handoff exists, even if columns have not caught up yet', () => {
    expect(isParentReadyForChildren({ status: 'in_progress', current_phase: 'PLAN_EXEC_TRANSITION' }, true)).toBe(true);
  });

  it('is NOT ready for draft/LEAD (the live specimen shape)', () => {
    expect(isParentReadyForChildren({ status: 'draft', current_phase: 'LEAD' }, false)).toBe(false);
  });

  it('is NOT ready for in_progress/LEAD (status alone is not sufficient -- the AND/OR bug this QF also fixes in phase-preflight.js)', () => {
    expect(isParentReadyForChildren({ status: 'in_progress', current_phase: 'LEAD' }, false)).toBe(false);
  });

  it('is NOT ready for draft/EXEC (phase alone is not sufficient)', () => {
    expect(isParentReadyForChildren({ status: 'draft', current_phase: 'EXEC' }, false)).toBe(false);
  });

  it('treats a missing parent as not ready, not a crash', () => {
    expect(isParentReadyForChildren(null, false)).toBe(false);
    expect(isParentReadyForChildren(undefined, true)).toBe(false);
  });
});

describe('isBindingEnabled', () => {
  it('is false by default (observe-only)', () => {
    expect(isBindingEnabled({})).toBe(false);
  });

  it('is true only for the exact string "true"', () => {
    expect(isBindingEnabled({ PARENT_EXEC_GATE_BINDING: 'true' })).toBe(true);
    expect(isBindingEnabled({ PARENT_EXEC_GATE_BINDING: 'yes' })).toBe(false);
  });
});

describe('createParentExecGate', () => {
  it('is not applicable to an SD with no parent_sd_id', async () => {
    const gate = createParentExecGate(makeSupabase({ parent: null }));
    const result = await gate.validator({ sd: { parent_sd_id: null } });
    expect(result.passed).toBe(true);
    expect(result.details.applicable).toBe(false);
  });

  it('passes cleanly when the parent is in_progress/EXEC', async () => {
    const sb = makeSupabase({ parent: { id: 'parent-uuid', sd_key: 'SD-PARENT-001', status: 'in_progress', current_phase: 'EXEC' } });
    const gate = createParentExecGate(sb);
    const result = await gate.validator({ sd: { parent_sd_id: 'parent-uuid' } });
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.details.parent_sd_key).toBe('SD-PARENT-001');
  });

  it('SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A specimen shape: parent draft/LEAD, zero handoffs -- warns (observe-only default)', async () => {
    const sb = makeSupabase({ parent: { id: 'parent-uuid', sd_key: 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003', status: 'draft', current_phase: 'LEAD' }, handoffs: [] });
    const gate = createParentExecGate(sb);
    const result = await gate.validator({ sd: { parent_sd_id: 'parent-uuid' } });
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.details.reason_code).toBe('PARENT_NOT_IN_EXEC');
    expect(result.details.bound).toBe(false);
  });

  it('SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A specimen shape: refuses when PARENT_EXEC_GATE_BINDING=true', async () => {
    process.env.PARENT_EXEC_GATE_BINDING = 'true';
    const sb = makeSupabase({ parent: { id: 'parent-uuid', sd_key: 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001', status: 'draft', current_phase: 'LEAD' }, handoffs: [] });
    const gate = createParentExecGate(sb);
    const result = await gate.validator({ sd: { parent_sd_id: 'parent-uuid' } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details.reason_code).toBe('PARENT_NOT_IN_EXEC');
    expect(result.details.bound).toBe(true);
  });

  it('passes when the parent has an accepted PLAN-TO-EXEC handoff even if status/current_phase have not caught up', async () => {
    const sb = makeSupabase({
      parent: { id: 'parent-uuid', sd_key: 'SD-PARENT-002', status: 'in_progress', current_phase: 'PLAN_EXEC_TRANSITION' },
      handoffs: [{ id: 'h1', handoff_type: 'PLAN-TO-EXEC', status: 'accepted' }],
    });
    const gate = createParentExecGate(sb);
    const result = await gate.validator({ sd: { parent_sd_id: 'parent-uuid' } });
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('fails open when the parent row cannot be found', async () => {
    const sb = makeSupabase({ parent: null });
    const gate = createParentExecGate(sb);
    const result = await gate.validator({ sd: { parent_sd_id: 'missing-parent' } });
    expect(result.passed).toBe(true);
    expect(result.details.reason_code).toBe('PARENT_NOT_FOUND');
  });

  it('fails open when no supabase client is provided', async () => {
    const gate = createParentExecGate(null);
    const result = await gate.validator({ sd: { parent_sd_id: 'some-parent' } });
    expect(result.passed).toBe(true);
    expect(result.details.reason_code).toBe('MISSING_CONTEXT');
  });
});
