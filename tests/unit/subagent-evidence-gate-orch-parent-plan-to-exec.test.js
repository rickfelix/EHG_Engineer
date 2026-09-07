/**
 * QF-20260905-822 — validateSubagentEvidence's PLAN-TO-EXEC parent-orchestrator branch.
 *
 * leo_protocol_sections 439 (Orchestrator Parent Lifecycle) documents a REDUCED set at
 * PLAN-TO-EXEC for a parent orchestrator: PARENT_PRD_EXISTS + CHILDREN_STRUCTURE_VALID, checked
 * by OTHER gates, no DESIGN/DATABASE/TESTING sub-agent demand (delegated to children). This gate
 * previously demanded REQUIRED_SUBAGENTS['PLAN-TO-EXEC'] (['TESTING']) unconditionally, hard-
 * failing a parent's PLAN-TO-EXEC with SUBAGENT_EVIDENCE_MISSING until a TESTING row was
 * manufactured for a phase whose implementation lives entirely in child branches — witnessed live
 * on parent ad1115a4 (rejected, then accepted only after a TESTING sub-agent run).
 */
import { describe, it, expect } from 'vitest';
import { validateSubagentEvidence } from '../../scripts/modules/handoff/gates/subagent-evidence-gate.js';

const PARENT_UUID = 'parent-0000-0000-0000-000000000001';
const CHILD_UUID = 'child-0000-0000-0000-000000000002';
const LEAF_UUID = 'leaf-0000-0000-0000-000000000003';

/** Minimal stub covering the 3 query shapes validateSubagentEvidence + isParentOrchestrator use.
 *  Distinguishes strategic_directives_v2's TWO shapes by which .eq() column was last called:
 *    - .eq('parent_sd_id', X).limit(1)  -> isParentOrchestrator's children-existence check
 *    - .eq('id', X).single()            -> phase-start-at fallback (SD created_at)
 */
function makeSupabase({ childrenRows = [], evidenceRows = [] } = {}) {
  return {
    from(table) {
      if (table === 'sd_phase_handoffs') {
        const q = { select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }) };
        return q;
      }
      if (table === 'strategic_directives_v2') {
        let lastEqCol = null;
        const q = {
          select: () => q,
          eq(col) { lastEqCol = col; return q; },
          limit: () => Promise.resolve({ data: lastEqCol === 'parent_sd_id' ? childrenRows : [], error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
        };
        return q;
      }
      if (table === 'sub_agent_execution_results') {
        const q = { select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => Promise.resolve({ data: evidenceRows, error: null }) };
        return q;
      }
      return { select: () => ({}) };
    },
  };
}

const parentSDByFlag = () => ({ id: PARENT_UUID, sd_key: 'SD-PARENT-001', sd_type: 'orchestrator', current_phase: 'PLAN', metadata: { is_parent: true } });
const parentSDByDBChild = () => ({ id: CHILD_UUID, sd_key: 'SD-PARENT-002', sd_type: 'orchestrator', current_phase: 'PLAN', metadata: {} });
const leafSD = () => ({ id: LEAF_UUID, sd_key: 'SD-LEAF-001', sd_type: 'feature', current_phase: 'PLAN', metadata: {} });

describe('QF-20260905-822: PLAN-TO-EXEC reduced set for a parent orchestrator (metadata.is_parent)', () => {
  it('a parent (metadata.is_parent=true) at PLAN-TO-EXEC passes with an empty required set — no evidence needed', async () => {
    const sd = parentSDByFlag();
    // isParentOrchestrator downgrades a metadata.is_parent=true flag with ZERO DB-confirmed
    // children to non-parent (QF-20260816-550 stale-flag safety check) — a real parent always
    // has at least one child row, so the stub must reflect that for a realistic scenario.
    const supabase = makeSupabase({ childrenRows: [{ id: 'child-1' }], evidenceRows: [] }); // deliberately NO TESTING evidence
    const result = await validateSubagentEvidence({ sd, handoffType: 'PLAN-TO-EXEC', supabase }, supabase);
    expect(result.passed).toBe(true);
    expect(result.details.required).toEqual([]);
  });

  it('ANTI-VACUITY: the SAME parent at a DIFFERENT handoff type (EXEC-TO-PLAN) is unaffected — standard set still applies', async () => {
    const sd = parentSDByFlag();
    const supabase = makeSupabase({ evidenceRows: [] });
    const result = await validateSubagentEvidence({ sd, handoffType: 'EXEC-TO-PLAN', supabase }, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.required).toEqual(['TESTING', 'SECURITY']);
  });

  it('ANTI-VACUITY: a non-parent leaf SD at PLAN-TO-EXEC is unaffected — standard TESTING requirement still applies', async () => {
    const sd = leafSD();
    const supabase = makeSupabase({ evidenceRows: [] });
    const result = await validateSubagentEvidence({ sd, handoffType: 'PLAN-TO-EXEC', supabase }, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.required).toEqual(['TESTING']);
  });
});

describe('QF-20260905-822: parent detection via the DB children query (not just the metadata flag)', () => {
  it('a parent detected ONLY via a real child row in strategic_directives_v2 also gets the reduced set', async () => {
    const sd = parentSDByDBChild();
    const supabase = makeSupabase({ childrenRows: [{ id: 'grandchild-1' }], evidenceRows: [] });
    const result = await validateSubagentEvidence({ sd, handoffType: 'PLAN-TO-EXEC', supabase }, supabase);
    expect(result.passed).toBe(true);
    expect(result.details.required).toEqual([]);
  });

  it('the SAME sd_type=orchestrator SD with ZERO children in the DB and no metadata flag is NOT reduced', async () => {
    const sd = parentSDByDBChild(); // metadata: {} — no is_parent flag
    const supabase = makeSupabase({ childrenRows: [], evidenceRows: [] }); // no children found
    const result = await validateSubagentEvidence({ sd, handoffType: 'PLAN-TO-EXEC', supabase }, supabase);
    expect(result.passed).toBe(false);
    expect(result.details.required).toEqual(['TESTING']);
  });
});
