/**
 * SD-LEO-INFRA-STAGE0-EVIDENCE-GRADING-001 (spec R4): evidence-grading proofs.
 *
 * The three commission success criteria, mechanically:
 *  1. GRADES END-TO-END — ranking output exposes per-input grades + the
 *     weakest-link composite grade per candidate.
 *  2. E0 CANNOT DOMINATE — two candidates differing ONLY in an E0 revenue
 *     estimate are indistinguishable (identical composite AND no revenue tie-break).
 *  3. HONEST AT THE SOURCE — parseRevenuePotential stamps E0 at origin; a declared
 *     >E0 grade with no sources/triangulation is clamped; no LLM-only path emits >E0.
 */

import { describe, test, expect, vi } from 'vitest';
import {
  resolveInputGrades,
  weakestLink,
  gradeDistribution,
  gradeAtLeast,
  GRADE_ORDER,
  E0_NEUTRAL,
} from '../../../../lib/eva/stage-zero/evidence-grading.js';
import { parseRevenuePotential } from '../../../../lib/eva/stage-zero/utils/parse-revenue.js';
import { rankCandidates, executeDiscoveryMode } from '../../../../lib/eva/stage-zero/paths/discovery-mode.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const v2 = '2026-07-10-v3';

const WEIGHTS_P2 = { // revenue-weighted (Phase-2 shape) — where E0 revenue would bite
  monthly_revenue_potential: 0.40,
  automation_feasibility: 0.20,
  target_market_specificity: 0.15,
  strategic_fit: 0.15,
  competition_level: 0.10,
};

function cand(overrides = {}) {
  return {
    name: 'Base', prompt_version: v2,
    problem_statement: 'p', solution: 's',
    target_market: 'B2B SaaS startups with 50-200 employees',
    automation_feasibility: 7, competition_level: 'medium',
    monthly_revenue_potential: '$5K/month',
    ...overrides,
  };
}

describe('resolveInputGrades — clamp validation (FR-1 / criterion 3)', () => {
  test('all fields default E0 with no declarations', () => {
    const { grades, clamps } = resolveInputGrades(cand());
    expect(Object.values(grades).every(g => g === 'E0')).toBe(true);
    expect(clamps).toHaveLength(0);
  });

  test('declared E2 with no sources/triangulation is CLAMPED to E0 with a note', () => {
    const { grades, clamps } = resolveInputGrades(cand({ evidence: { monthly_revenue_potential: { grade: 'E2' } } }));
    expect(grades.monthly_revenue_potential).toBe('E0');
    expect(clamps).toEqual([{ field: 'monthly_revenue_potential', declared: 'E2', reason: 'unsupported_grade_declaration' }]);
  });

  test('declared E1 with a source lifts; triangulation (>=2 refs) also lifts', () => {
    const { grades: g1 } = resolveInputGrades(cand({ evidence: { monthly_revenue_potential: { grade: 'E1', sources: ['https://report'] } } }));
    expect(g1.monthly_revenue_potential).toBe('E1');
    const { grades: g2 } = resolveInputGrades(cand({ evidence: { automation_feasibility: { grade: 'E2', triangulation: ['lens-a', 'lens-b'] } } }));
    expect(g2.automation_feasibility).toBe('E2');
    // Single triangulation ref is NOT enough
    const { grades: g3, clamps } = resolveInputGrades(cand({ evidence: { automation_feasibility: { grade: 'E2', triangulation: ['lens-a'] } } }));
    expect(g3.automation_feasibility).toBe('E0');
    expect(clamps).toHaveLength(1);
  });

  test('invalid grade strings resolve to E0 without clamp-note noise', () => {
    const { grades } = resolveInputGrades(cand({ evidence: { competition_level: { grade: 'E9', sources: ['x'] } } }));
    expect(grades.competition_level).toBe('E0');
  });
});

describe('weakest-link propagation (criterion 1)', () => {
  test('one E0 input among E2s → composite grade E0', () => {
    expect(weakestLink({
      automation_feasibility: 'E2', monthly_revenue_potential: 'E2',
      target_market_specificity: 'E2', strategic_fit: 'E0', competition_level: 'E2',
    })).toBe('E0');
  });

  test('all E1 → E1; grade order sane', () => {
    expect(weakestLink({
      automation_feasibility: 'E1', monthly_revenue_potential: 'E1',
      target_market_specificity: 'E1', strategic_fit: 'E1', competition_level: 'E1',
    })).toBe('E1');
    expect(GRADE_ORDER).toEqual(['E0', 'E1', 'E2', 'E3']);
    expect(gradeAtLeast('E2', 'E1')).toBe(true);
    expect(gradeAtLeast('E0', 'E1')).toBe(false);
  });

  test('ranked output exposes grades end-to-end', () => {
    const ranked = rankCandidates([cand()], { weights: WEIGHTS_P2 });
    expect(ranked[0].evidence_grades).toBeDefined();
    expect(ranked[0].evidence_grades.monthly_revenue_potential).toBe('E0');
    expect(ranked[0].composite_evidence_grade).toBe('E0');
    expect(ranked[0].evidence_clamps).toEqual([]);
  });
});

describe('E0 cannot dominate (criterion 2)', () => {
  test('THE INDISTINGUISHABILITY PROOF: identical except E0 revenue → identical composite, no revenue tie-break', () => {
    const a = cand({ name: 'Alpha', monthly_revenue_potential: '$500K/month' });
    const b = cand({ name: 'Beta', monthly_revenue_potential: '$1K/month' });
    const ranked = rankCandidates([a, b], { weights: WEIGHTS_P2 });
    // Identical composites — the E0 revenue difference is neutral-flattened.
    expect(ranked[0].composite_score).toBe(ranked[1].composite_score);
    // The revenue tie-break did NOT separate them: parsed_revenue_high differs wildly,
    // yet order fell through to feasibility (equal) then name ASC.
    expect(ranked[0].parsed_revenue_high).not.toBe(ranked[1].parsed_revenue_high);
    expect(ranked[0].name).toBe('Alpha'); // name ASC, not HighRev-first
  });

  test('grounded E1 revenue genuinely differentiates the same pair', () => {
    const src = { grade: 'E1', sources: ['https://market-report'] };
    const a = cand({ name: 'Alpha', monthly_revenue_potential: '$500K/month', evidence: { monthly_revenue_potential: src } });
    const b = cand({ name: 'Beta', monthly_revenue_potential: '$1K/month', evidence: { monthly_revenue_potential: src } });
    const ranked = rankCandidates([a, b], { weights: WEIGHTS_P2 });
    expect(ranked[0].composite_score).toBeGreaterThan(ranked[1].composite_score);
    expect(ranked[0].name).toBe('Alpha');
    expect(ranked[0].composite_evidence_grade).toBe('E0'); // weakest link: other inputs still E0
    expect(ranked[0].evidence_grades.monthly_revenue_potential).toBe('E1');
  });

  test('E0 revenue contributes the neutral constant regardless of magnitude', () => {
    // Weight everything to revenue: E0 candidates all score round(0.5*100)=50.
    const w = { monthly_revenue_potential: 1.0, automation_feasibility: 0, target_market_specificity: 0, strategic_fit: 0, competition_level: 0 };
    const ranked = rankCandidates([cand({ name: 'A', monthly_revenue_potential: '$900K/month' }), cand({ name: 'B', monthly_revenue_potential: '$10/month' })], { weights: w });
    expect(ranked[0].composite_score).toBe(Math.round(E0_NEUTRAL * 100));
    expect(ranked[1].composite_score).toBe(Math.round(E0_NEUTRAL * 100));
  });
});

describe('honest at the source (criterion 3)', () => {
  test('parseRevenuePotential stamps grade E0 at origin', () => {
    expect(parseRevenuePotential('$10K/month')).toEqual({ low: 10000, high: 10000, currency: 'USD', grade: 'E0' });
    expect(parseRevenuePotential('garbage')).toBeNull();
  });
});

describe('run-record stamp + e0_sensitivity (FR-3)', () => {
  const POSTURE_ROW = {
    id: 'p1', phase_key: 'test_posture', version: 1,
    criteria: { weights: WEIGHTS_P2 },
    status: 'active', ratified_by: 'chairman', ratified_at: '2026-07-10T00:00:00Z',
  };
  const ENVELOPE_ROWS = [{ name: 'email delivery', capability_type: 'service', maturity_level: 'production', scope: 'platform' }];

  function fullSupabase() {
    const strategyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { strategy_key: 'trend_scanner', name: 'Trend Scanner', is_active: true }, error: null }),
      order: vi.fn().mockResolvedValue({ data: [{ strategy_key: 'trend_scanner', is_active: true }], error: null }),
    };
    return {
      from: vi.fn((table) => {
        if (table === 'selection_postures') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [POSTURE_ROW], error: null }) };
        if (table === 'v_unified_capabilities') return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: ENVELOPE_ROWS, error: null }) };
        return strategyChain;
      }),
    };
  }

  test('metadata.evidence_grading carries policy, distribution, and e0_sensitivity', async () => {
    // Winner rides an E0 feasibility margin → flattening all E0 would tie/change the top → sensitive.
    const candidates = [
      cand({ name: 'FeasWinner', automation_feasibility: 10, competition_level: 'low' }),
      cand({ name: 'Runner', automation_feasibility: 4, competition_level: 'high' }),
      cand({ name: 'Third', automation_feasibility: 5, competition_level: 'high' }),
    ];
    const llmClient = { _model: 'test-model', complete: vi.fn().mockResolvedValue(JSON.stringify(candidates)) };
    const result = await executeDiscoveryMode({ strategy: 'trend_scanner' }, { supabase: fullSupabase(), logger: silentLogger, llmClient });

    const eg = result.metadata.evidence_grading;
    expect(eg.policy).toBe('llm_emitted_defaults_E0');
    expect(eg.top_composite_grade).toBe('E0');
    expect(eg.grade_distribution.E0).toBe(3);
    expect(eg.e0_sensitivity).toBe(true);
    expect(gradeDistribution(result.raw_material.candidates).E0).toBe(3);
  });
});
