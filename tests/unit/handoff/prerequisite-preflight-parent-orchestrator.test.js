/**
 * QF-20260906-480: Orchestrator parent PLAN-TO-EXEC preflight was refused by
 * construction. The Orchestrator Parent Lifecycle (SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001)
 * defines a REDUCED gate set for a parent's PLAN-TO-EXEC (PARENT_PRD_EXISTS +
 * CHILDREN_STRUCTURE_VALID, no DESIGN/DATABASE/TESTING sub-agents) which the full
 * gate pipeline (parent-orchestrator.js) already implements — but this quick
 * preflight, which runs BEFORE the full pipeline, applied the STANDALONE
 * requirements (PRD 'approved' status + TESTING sub-agent evidence) regardless of
 * parent status, rejecting every parent's PLAN-TO-EXEC with PRD_NOT_APPROVED and
 * SUBAGENT_EVIDENCE_MISSING.
 */
import { describe, it, expect } from 'vitest';
import { runPrerequisitePreflight } from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

function makeMockSupabase({ sdRow, prdRow, childRows = [], storyRows = [], evidenceRows = [] }) {
  return {
    from: (table) => {
      if (table === 'user_stories') {
        return { select: () => ({ eq: async () => ({ data: storyRows, error: null }) }) };
      }
      if (table === 'sub_agent_execution_results') {
        return {
          select: () => ({ eq: () => ({ gte: () => ({ order: () => ({ limit: async () => ({ data: evidenceRows, error: null }) }) }) }) })
        };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: prdRow || null, error: null }) }) }) };
      }
      if (table === 'strategic_directives_v2') {
        // Two roles share this table: lookupSdIdForFk/full-row-load terminate in
        // .single() (always resolves sdRow); isParentOrchestrator()'s children
        // lookup terminates in .limit(1) (resolves childRows). Both chains pass
        // through the same generic select/eq/or, so both terminals live on one
        // self-returning builder.
        const builder = {
          select: () => builder,
          eq: () => builder,
          or: () => builder,
          single: async () => ({ data: sdRow, error: null }),
          limit: async () => ({ data: childRows, error: null })
        };
        return builder;
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
    }
  };
}

describe('QF-20260906-480: parent-orchestrator PLAN-TO-EXEC reduced preflight set', () => {
  it('bypasses PRD_NOT_APPROVED for a parent orchestrator with an unapproved (draft) PRD', async () => {
    const sd = { id: 'SD-PARENT-001', sd_key: 'SD-PARENT-001', sd_type: 'feature', metadata: { is_parent: true } };
    const prd = { id: 'PRD-1', status: 'draft', executive_summary: 'short' };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, childRows: [{ id: 'child-1' }] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-PARENT-001');
    const codes = result.issues.map((i) => i.code);

    expect(codes).not.toContain('PRD_NOT_APPROVED');
    expect(codes).not.toContain('PRD_SUMMARY_SHORT');
    expect(codes).toContain('PARENT_PRD_APPROVAL_BYPASSED');
  });

  it('bypasses SUBAGENT_EVIDENCE_MISSING for a parent orchestrator with no TESTING evidence', async () => {
    const sd = { id: 'SD-PARENT-002', sd_key: 'SD-PARENT-002', sd_type: 'feature', metadata: { is_parent: true } };
    const prd = { id: 'PRD-1', status: 'draft', executive_summary: 'short' };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, childRows: [{ id: 'child-1' }], evidenceRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-PARENT-002');
    const codes = result.issues.map((i) => i.code);

    expect(codes).not.toContain('SUBAGENT_EVIDENCE_MISSING');
    expect(codes).toContain('PARENT_SUBAGENT_EVIDENCE_BYPASSED');
  });

  it('bypasses USER_STORIES_MISSING for a parent orchestrator even on a non-exempt sd_type', async () => {
    const sd = { id: 'SD-PARENT-003', sd_key: 'SD-PARENT-003', sd_type: 'feature', metadata: { is_parent: true } };
    const prd = { id: 'PRD-1', status: 'draft', executive_summary: 'short' };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, childRows: [{ id: 'child-1' }], storyRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-PARENT-003');
    const codes = result.issues.map((i) => i.code);

    expect(codes).not.toContain('USER_STORIES_MISSING');
    expect(codes).toContain('USER_STORIES_BYPASSED');
  });

  it('passes overall (passed=true) for a parent orchestrator with only info-severity bypass entries', async () => {
    const sd = { id: 'SD-PARENT-004', sd_key: 'SD-PARENT-004', sd_type: 'feature', metadata: { is_parent: true } };
    const prd = { id: 'PRD-1', status: 'draft', executive_summary: 'short' };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, childRows: [{ id: 'child-1' }], storyRows: [], evidenceRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-PARENT-004');

    expect(result.passed).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('still requires PRD_MISSING (blocking) for a parent orchestrator with no PRD at all', async () => {
    const sd = { id: 'SD-PARENT-005', sd_key: 'SD-PARENT-005', sd_type: 'feature', metadata: { is_parent: true } };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: null, childRows: [{ id: 'child-1' }] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-PARENT-005');
    const codes = result.issues.map((i) => i.code);

    expect(codes).toContain('PRD_MISSING');
    expect(result.passed).toBe(false);
  });

  it('detects a parent via DB children even without metadata.is_parent', async () => {
    const sd = { id: 'SD-PARENT-006', sd_key: 'SD-PARENT-006', sd_type: 'feature', metadata: {} };
    const prd = { id: 'PRD-1', status: 'draft', executive_summary: 'short' };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, childRows: [{ id: 'child-1' }] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-PARENT-006');
    const codes = result.issues.map((i) => i.code);

    expect(codes).not.toContain('PRD_NOT_APPROVED');
    expect(codes).toContain('PARENT_PRD_APPROVAL_BYPASSED');
  });

  it('does NOT bypass for a standalone (non-parent, no children) SD with the same unapproved PRD', async () => {
    const sd = { id: 'SD-LEAF-001', sd_key: 'SD-LEAF-001', sd_type: 'feature', metadata: {} };
    const prd = { id: 'PRD-1', status: 'draft', executive_summary: 'short' };
    const supabase = makeMockSupabase({ sdRow: sd, prdRow: prd, childRows: [], storyRows: [], evidenceRows: [] });

    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', 'SD-LEAF-001');
    const codes = result.issues.map((i) => i.code);

    expect(codes).toContain('PRD_NOT_APPROVED');
    expect(codes).not.toContain('PARENT_PRD_APPROVAL_BYPASSED');
    expect(result.passed).toBe(false);
  });
});
