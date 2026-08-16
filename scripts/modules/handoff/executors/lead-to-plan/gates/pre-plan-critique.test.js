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

function makeSupabase({ prd = NEUTRAL_PRD, prdError = null, overrideRows = [], insertError = null, overrideError = null } = {}) {
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
        // TR-7: a self-chaining query builder (not a fixed-depth .eq().eq().not()... shape) so
        // findActiveOverride's content_hash filter (a 3rd .eq(), added by FR-4/FR-5) — or any
        // future filter — never breaks this mock's shape again. Fully argument-blind: it returns
        // overrideRows regardless of what was filtered on, matching this file's existing
        // discipline that content_hash-EQUALITY correctness itself belongs to the real-DB
        // integration harness (TS-8/TS-9's own routing note), not this mocked unit suite.
        const chain = {
          eq: () => chain,
          not: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: async () => ({ data: overrideError ? null : overrideRows, error: overrideError }),
        };
        return {
          insert: async (row) => {
            inserted.push(row);
            return { error: insertError };
          },
          select: () => chain,
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

  it('DOWNGRADES on an audited override bound to the SAME content_hash — passes with the override cited, findings still persisted (FR-4/FR-5 binding predicate)', async () => {
    const blockFindings = [{ severity: 'block', category: 'missing_criteria', message: 'untestable', location: 'PRD' }];
    critiquePlanProposal.mockResolvedValue({
      findings: blockFindings,
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
      contentHash: 'hash-abc123',
    });
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-1', content_hash: 'hash-abc123', override_reason: 'AC covered by parent SD', override_by: 'chairman', created_at: '2026-08-09T00:00:00Z' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(60);
    expect(result.warnings.join(' ')).toMatch(/audited override.*chairman/);
    expect(supabase._inserted).toHaveLength(1); // downgrade, not silence
    expect(supabase._inserted[0].content_hash).toBe('hash-abc123'); // the block row also persists its own hash
  });

  // FR-4/FR-5, testing-agent T1/T12: content_hash REPLACES findingsFingerprint as the binding
  // predicate — an override is scoped to WHAT WAS REVIEWED (content), not to a specific LLM
  // call's non-deterministic findings composition. This test's mock is argument-blind (it cannot
  // itself enforce that a real content_hash mismatch is filtered out in Postgres — that's the
  // real-DB integration harness's job, TS-8/TS-9), so it asserts the CALLER-SIDE half of the
  // contract instead: the gate calls findActiveOverride with the CURRENT run's own contentHash,
  // never with a stale or borrowed value, and returns no rows when the mock reports none (a
  // real content_hash filter would return none for a genuine mismatch).
  it('an override with no matching content_hash does NOT downgrade — the block stands', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'contradiction', message: 'a NEW, different planning gap', location: 'PRD' }],
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
      contentHash: 'hash-new-content',
    });
    // overrideRows empty: simulates Postgres's content_hash equality filter finding no match for
    // 'hash-new-content' (a real DB never returns a row whose content_hash differs from the filter).
    const supabase = makeSupabase({ overrideRows: [] });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  // TR-5: a could-not-check block (contentHash never computed — the prompt was never built) must
  // never bind to ANY override, including one that happens to carry content_hash IS NULL in the
  // DB. findActiveOverride's own guard returns null WITHOUT querying when currentContentHash is
  // falsy — this pins that the gate-level verdict reflects that (block stands, not overridden).
  it('a could-not-check block (no computed content_hash) never binds to an override, even one with content_hash NULL', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'contradiction', message: 'invariant-only block, LLM was blind', location: 'PRD' }],
      overall_severity: 'block', // combined can still reach 'block' via invariant escalation
      model_used: null,
      token_usage: null,
      contentHash: null,
    });
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-old', content_hash: null, override_reason: 'stale null-hash override', override_by: 'chairman', created_at: '2026-08-09T00:00:00Z' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  // VALIDATION (PLAN_VERIFICATION evidence, VAL-1, HIGH): a schema-missing error on the OVERRIDE
  // LOOKUP itself (not the insert) must be distinguishable from "no override was ever recorded" —
  // the block still correctly stands (fail-closed), but the gate must say WHY, loudly, matching
  // FR-6's own precedent at persistCritique. Before this fix, `if (error || ...) return null` made
  // this indistinguishable from a genuine absence.
  it('a schema-missing error on the override lookup itself is reported loudly, distinct from "no override recorded"', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'missing_criteria', message: 'untestable', location: 'PRD' }],
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
      contentHash: 'hash-abc123',
    });
    const supabase = makeSupabase({ overrideError: { code: '42703', message: 'column plan_critiques.content_hash does not exist' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false); // still fail-closed — no override CAN apply
    expect(result.score).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/SCHEMA MISSING on override lookup/);
    expect(result.warnings.join(' ')).toMatch(/NOT evidence that no override was ever recorded/);
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
    // TESTING (EXEC-phase evidence, HIGH finding #2): metadata.llm_result is the RAW pre-merge
    // LLM output — it must NOT carry the invariant finding that only entered the top-level,
    // COMBINED findings column above. A future cache hit reads llm_result and lets
    // validatePrePlanCritique freshly re-merge invariant findings on its own next run; if
    // llm_result already contained the merge, that re-merge would duplicate it.
    expect(supabase._inserted[0].metadata.llm_result).toEqual({ findings: [], overall_severity: 'pass' });
  });

  // VALIDATION (PLAN_VERIFICATION evidence, VAL-4): FR-1 AC-4 requires a persisted
  // metadata.truncated row, not just critiquePlanProposal's own return value — the gate-level
  // WRITE was previously unasserted.
  it('persists metadata.truncated with literal booleans and side-qualified counts (FR-1 AC-4)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
      truncated: {
        prd: { truncated: true, charsRead: 60000, charsTotal: 70000 },
        arch: { truncated: false, charsRead: 500, charsTotal: 500 },
      },
    });
    const supabase = makeSupabase();
    await validatePrePlanCritique({ sd: SD, supabase });
    expect(supabase._inserted[0].metadata.truncated).toEqual({
      prd: true, arch: false, shownPrd: 60000, totalPrd: 70000, shownArch: 500, totalArch: 500,
    });
  });

  // VALIDATION (PLAN_VERIFICATION evidence, VAL-4): FR-4 AC-5 requires a cache-hit row to persist
  // metadata.cache_hit=true + cache_source_id — likewise only asserted at the return-value level
  // before this test, never at the gate's actual INSERT payload.
  it('persists metadata.cache_hit and cache_source_id when the critique was a cache hit (FR-4 AC-5)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
      cacheHit: true, cacheSourceId: 'cached-row-xyz',
    });
    const supabase = makeSupabase();
    await validatePrePlanCritique({ sd: SD, supabase });
    expect(supabase._inserted[0].metadata.cache_hit).toBe(true);
    expect(supabase._inserted[0].metadata.cache_source_id).toBe('cached-row-xyz');
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

  it('reports a CHECK constraint violation loudly, distinct from a generic insert failure (23514)', async () => {
    // The 20260810 migration widening this constraint to permit could_not_check is confirmed live
    // (verified 2026-08-16) — the old could_not_check-specific "KNOWN LIMITATION" framing (TR-4)
    // is stale and removed. This pins the current, general behavior: ANY 23514 gets its own named
    // branch, distinct from the generic 'plan_critiques insert failed' message.
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'could_not_check', model_used: null, token_usage: null,
      fallback_reason: 'LLM timeout',
    });
    const supabase = makeSupabase({ insertError: { code: '23514', message: 'violates check constraint' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(50);
    expect(result.warnings.join(' ')).toMatch(/CHECK constraint violation/);
    expect(result.warnings.join(' ')).toMatch(/NOT persisted/);
  });

  it('reports a SCHEMA MISSING error loudly, distinct from a generic insert failure (FR-6: PGRST204/42703)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null, truncated: null,
    });
    const supabase = makeSupabase({ insertError: { code: 'PGRST204', message: "Could not find the 'content_hash' column of 'plan_critiques' in the schema cache" } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/SCHEMA MISSING/);
    expect(result.warnings.join(' ')).toMatch(/shipped ahead of its migration/);
    expect(result.warnings.join(' ')).not.toMatch(/plan_critiques insert failed:/);
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
