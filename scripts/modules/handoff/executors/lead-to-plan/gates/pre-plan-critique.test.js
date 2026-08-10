/**
 * Unit tests for the promoted (verdict-bearing) Pre-PLAN Adversarial Critique Gate
 * SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-1, FR-3, FR-4)
 *
 * Mutation both directions:
 *  - the gate BLOCKS on block-severity without an override (it could never block before —
 *    217 persisted critiques, 213 BLOCK, zero blocked handoffs), and
 *  - it still PASSES on clean runs, downgrades on an audited override, and degrades (not
 *    fails, not silently passes) on COULD_NOT_CHECK.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../lib/eva/devils-advocate.js', () => ({
  COULD_NOT_CHECK: 'could_not_check',
  critiquePlanProposal: vi.fn(),
}));

import { critiquePlanProposal } from '../../../../../../lib/eva/devils-advocate.js';
import { createPrePlanCritiqueGate, validatePrePlanCritique } from './pre-plan-critique.js';

// Neutral PRD content: no invariant-library trigger vocabulary, so only the mocked LLM
// findings drive the verdict unless a test opts in.
const NEUTRAL_PRD = {
  id: 'PRD-TEST-001',
  executive_summary: 'Improve the dashboard widget copy',
  functional_requirements: [{ id: 'FR-1', description: 'Reword the empty-state text' }],
  acceptance_criteria: ['Empty state shows the new copy'],
  test_scenarios: [],
  risks: [],
};

function makeSupabase({ prd = NEUTRAL_PRD, prdError = null, overrideRows = [], insertError = null } = {}) {
  const inserted = [];
  const client = {
    _inserted: inserted,
    from(table) {
      if (table === 'product_requirements_v2') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: prd, error: prdError }),
            }),
          }),
        };
      }
      if (table === 'plan_critiques') {
        return {
          insert: async (row) => {
            inserted.push(row);
            return { error: insertError };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                not: () => ({
                  not: () => ({
                    gte: () => ({
                      order: () => ({
                        limit: async () => ({ data: overrideRows, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'eva_architecture_plans') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return client;
}

const SD = { id: 'sd-uuid-1', sd_key: 'SD-FIXTURE-001', title: 'Fixture', metadata: {} };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('gate promotion (FR-1)', () => {
  it('is verdict-bearing: required=true, weight=1.0', () => {
    const gate = createPrePlanCritiqueGate(makeSupabase());
    expect(gate.name).toBe('PRE_PLAN_ADVERSARIAL_CRITIQUE');
    expect(gate.required).toBe(true);
    expect(gate.weight).toBe(1.0);
  });

  it('FAILS on block severity with no override (direction 1: it can now block)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'missing_criteria', message: 'untestable', location: 'PRD' }],
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.join(' ')).toMatch(/critique-override\.js/);
    // FR-4: the block was persisted BEFORE the verdict returned
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0].overall_severity).toBe('block');
  });

  it('DOWNGRADES on an audited override bound to the SAME findings — passes with the override cited, findings still persisted', async () => {
    const blockFindings = [{ severity: 'block', category: 'missing_criteria', message: 'untestable', location: 'PRD' }];
    critiquePlanProposal.mockResolvedValue({
      findings: blockFindings,
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
    });
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-1', findings: blockFindings, override_reason: 'AC covered by parent SD', override_by: 'chairman', created_at: '2026-08-09T00:00:00Z' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(60);
    expect(result.warnings.join(' ')).toMatch(/audited override.*chairman/);
    expect(supabase._inserted).toHaveLength(1); // downgrade, not silence
  });

  it('an override for DIFFERENT findings does NOT downgrade — the block stands (SECURITY MEDIUM-1 binding)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'contradiction', message: 'a NEW, different planning gap', location: 'PRD' }],
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
    });
    const supabase = makeSupabase({
      overrideRows: [{
        id: 'crit-1',
        findings: [{ severity: 'block', category: 'missing_criteria', message: 'the OLD excused finding', location: 'PRD' }],
        override_reason: 'excused the old finding only',
        override_by: 'chairman',
        created_at: '2026-08-09T00:00:00Z',
      }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it('still PASSES clean at 100 (direction 2: promotion did not break the pass path)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });
});

describe('coverage, never completeness (FR-3)', () => {
  it('reports which invariant classes were checked and never claims completeness', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase: makeSupabase() });
    const coverage = result.warnings.find((w) => w.startsWith('COVERAGE:'));
    expect(coverage).toBeTruthy();
    expect(coverage).toMatch(/INV-001/);
    expect(coverage).toMatch(/No claim of completeness|require tier-2\/human review/);
  });

  it('merges deterministic invariant findings with the LLM pass', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
    });
    // PRD text that trips INV-001: introduces a "gate" with no could-not-run behavior.
    const prd = { ...NEUTRAL_PRD, executive_summary: 'Add a new drift monitor and quality gate' };
    const supabase = makeSupabase({ prd });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(75); // warn from the invariant, despite LLM pass
    expect(supabase._inserted[0].findings.some((f) => f.invariant_id === 'INV-001-control-without-could-not-check-path')).toBe(true);
  });
});

describe('could-not-check honesty (FR-3/FR-4)', () => {
  it('passes DEGRADED (50) when the LLM could not run and invariants found nothing — and persists the blindness', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'could_not_check', model_used: null, token_usage: null,
      fallback_reason: 'OPENAI_API_KEY not configured',
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(50); // never a silent 100
    expect(result.warnings.join(' ')).toMatch(/COULD_NOT_CHECK/);
    // FR-4: the blindness itself is persisted (the old code returned before persisting)
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0].overall_severity).toBe('could_not_check');
  });

  it('invariant findings still bear the verdict when the LLM is blind', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'could_not_check', model_used: null, token_usage: null,
      fallback_reason: 'LLM timeout',
    });
    const prd = { ...NEUTRAL_PRD, executive_summary: 'Add a new drift monitor and quality gate' };
    const supabase = makeSupabase({ prd });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(75); // warn finding outranks the blindness
    expect(supabase._inserted[0].overall_severity).toBe('warn');
  });

  it('reports the KNOWN LIMITATION loudly when the constraint refuses could_not_check (23514)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'could_not_check', model_used: null, token_usage: null,
      fallback_reason: 'LLM timeout',
    });
    const supabase = makeSupabase({ insertError: { code: '23514', message: 'violates check constraint' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(50);
    expect(result.warnings.join(' ')).toMatch(/20260810_plan_critiques_could_not_check\.sql/);
    expect(result.warnings.join(' ')).toMatch(/NOT persisted/);
  });
});

describe('verdict cannot be laundered through findings shape (adversarial review, PR #6927)', () => {
  it('FAILS when the LLM says block with EMPTY findings — the verdict seeds combined severity', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'block', model_used: 'test-model', token_usage: null,
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(supabase._inserted[0].overall_severity).toBe('block'); // never persisted as 'pass'
  });

  it('off-vocabulary finding severities rank as warn, never below pass', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'critical', category: 'contradiction', message: 'x', location: 'PRD' }],
      overall_severity: 'pass', // LLM aggregation also broken
      model_used: 'test-model', token_usage: null,
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase: makeSupabase() });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(75); // warn, not a silent 100
  });
});

describe('PRD read failure is could-not-check, not absence (adversarial review, PR #6927)', () => {
  it('degrades to score 50 on a non-PGRST116 read error', async () => {
    const supabase = makeSupabase({ prd: null, prdError: { code: '57014', message: 'statement timeout' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(50);
    expect(result.warnings.join(' ')).toMatch(/COULD_NOT_CHECK/);
    expect(critiquePlanProposal).not.toHaveBeenCalled();
  });
});

describe('not-applicable is neither clean nor blind', () => {
  it('passes with NOT_APPLICABLE when no PRD exists yet (normal for a fresh SD at LEAD-TO-PLAN)', async () => {
    const supabase = makeSupabase({ prd: null, prdError: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/NOT_APPLICABLE/);
    expect(supabase._inserted).toHaveLength(0);
    expect(critiquePlanProposal).not.toHaveBeenCalled();
  });
});
