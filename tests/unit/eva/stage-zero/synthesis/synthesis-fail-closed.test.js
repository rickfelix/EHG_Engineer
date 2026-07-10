/**
 * Unit Tests: Synthesis Engine — Fail-Closed Policy
 *
 * SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001
 *
 * lib/eva/stage-zero/synthesis/index.js previously fail-soft every component to a zeroed
 * fallback object with components_run/components_total HARDCODED to 15/15 regardless of real
 * outcomes, and a maturity derivation that fell through to 'ready' when chairman_constraints
 * itself failed (its catch sets verdict:'review', not 'fail'). Bravo ledger finding 1
 * (docs/audit/stage-zero-flaw-ledger-bravo.md) confirmed a total-failure run still stamped
 * maturity:'ready'. This is the seeded-defect canary the spec's own R10.2 acceptance test
 * requires (docs/design/stage-zero-greenfield-spec.md).
 *
 * Test Coverage:
 * - Seeded-defect canary: all 15 components fail -> maturity != 'ready', components_run === 0
 * - Partial failure: subset fails -> components_run reduced by exactly that count, maturity != 'ready'
 * - Zero failure: baseline behavior unchanged (components_run === components_total === 15)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/eva/stage-zero/synthesis/cross-reference.js', () => ({
  crossReferenceIntellectualCapital: vi.fn().mockResolvedValue({ component: 'cross_reference', matches: [], lessons: [], relevance_score: 7, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/portfolio-evaluation.js', () => ({
  evaluatePortfolioFit: vi.fn().mockResolvedValue({ component: 'portfolio_evaluation', dimensions: {}, composite_score: 8, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/problem-reframing.js', () => ({
  reframeProblem: vi.fn().mockResolvedValue({ component: 'problem_reframing', reframings: [{ framing: 'Better framing' }], recommended_framing: { framing: 'Better framing' }, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/moat-architecture.js', () => ({
  designMoat: vi.fn().mockResolvedValue({ component: 'moat_architecture', primary_moat: 'data', secondary_moats: [], moat_score: 7, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/chairman-constraints.js', () => ({
  applyChairmanConstraints: vi.fn().mockResolvedValue({ component: 'chairman_constraints', verdict: 'pass', score: 80, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/time-horizon.js', () => ({
  assessTimeHorizon: vi.fn().mockResolvedValue({ component: 'time_horizon', position: 'build_now', confidence: 0.8, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/archetypes.js', () => ({
  classifyArchetype: vi.fn().mockResolvedValue({ component: 'archetypes', primary_archetype: 'automator', primary_confidence: 0.9, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/build-cost-estimation.js', () => ({
  estimateBuildCost: vi.fn().mockResolvedValue({ component: 'build_cost', complexity: 'moderate', summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/virality.js', () => ({
  analyzeVirality: vi.fn().mockResolvedValue({ component: 'virality_analysis', virality_score: 6, summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/design-evaluation.js', () => ({
  evaluateDesignPotential: vi.fn().mockResolvedValue({ component: 'design_evaluation', dimensions: {}, composite_score: 66, recommendation: 'design_standard', summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/narrative-risk.js', () => ({
  analyzeNarrativeRisk: vi.fn().mockResolvedValue({ component: 'narrative_risk', nr_score: 35, nr_band: 'NR-Moderate', nr_interpretation: 'Watch assumptions', component_scores: { decision_sensitivity: 40, demand_distortion: 30, hype_persistence: 25, influence_exposure: 20 }, narrative_flags: [], confidence: 0.7, confidence_caveat: '', summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/tech-trajectory.js', () => ({
  analyzeTechTrajectory: vi.fn().mockResolvedValue({ component: 'tech_trajectory', trajectory_score: 67, axes: { reasoning_autonomy: { current: 65, bull_6m: 85, base_6m: 75, bear_6m: 68, venture_impact: 'test' }, cost_deflation: { current: 50, bull_6m: 80, base_6m: 65, bear_6m: 45, venture_impact: 'test' }, multimodal_expansion: { current: 40, bull_6m: 70, base_6m: 55, bear_6m: 42, venture_impact: 'test' } }, competitive_timing: { signal: 'opening', confidence: 0.7, window_months: 6, rationale: 'test' }, next_disruption_event: { event: 'Test', estimated_months: 4, invalidation_scope: 'test' }, gap_windows: [], confidence_caveat: '', summary: 'ok', data_feed_active: false }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/attention-capital.js', () => ({
  analyzeAttentionCapital: vi.fn().mockResolvedValue({ component: 'attention_capital', ac_score: 55, ac_band: 'AC-Moderate', ac_interpretation: 'ok', component_scores: { organic_search_momentum: 50, engagement_depth: 50, earned_media_ratio: 50, advocacy_signal: 50, return_engagement: 50 }, confidence: 0.6, confidence_caveat: '', summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/agentic-fit.js', () => ({
  analyzeAgenticFit: vi.fn().mockResolvedValue({ component: 'agentic_fit', agentic_fit_score: 72, fit_composite: 70, queue_jump_score: 80, dimension_scores: { agent_leverage: 80, compounding: 70, kill_speed: 65, attention_economy: 60 }, machine_improvement: 40, machine_improvement_bonus: 0.2, disadvantage_flags: [], disadvantage_down_weight: 1, hardest_disadvantage_flags: [], chairman_review_required: false, af_band: 'AF-High', af_interpretation: 'ok', confidence: 0.7, summary: 'ok' }),
  buildAgenticFitAdvisory: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/mental-model-analysis.js', () => ({
  runMentalModelAnalysis: vi.fn().mockResolvedValue({ component: 'mental_model_analysis', models: [], summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/profile-service.js', () => ({
  resolveProfile: vi.fn().mockResolvedValue(null),
  calculateWeightedScore: vi.fn().mockReturnValue({ total_score: 75, breakdown: {} }),
}));

import { runSynthesis } from '../../../../../lib/eva/stage-zero/synthesis/index.js';
import { crossReferenceIntellectualCapital } from '../../../../../lib/eva/stage-zero/synthesis/cross-reference.js';
import { evaluatePortfolioFit } from '../../../../../lib/eva/stage-zero/synthesis/portfolio-evaluation.js';
import { reframeProblem } from '../../../../../lib/eva/stage-zero/synthesis/problem-reframing.js';
import { designMoat } from '../../../../../lib/eva/stage-zero/synthesis/moat-architecture.js';
import { applyChairmanConstraints } from '../../../../../lib/eva/stage-zero/synthesis/chairman-constraints.js';
import { assessTimeHorizon } from '../../../../../lib/eva/stage-zero/synthesis/time-horizon.js';
import { classifyArchetype } from '../../../../../lib/eva/stage-zero/synthesis/archetypes.js';
import { estimateBuildCost } from '../../../../../lib/eva/stage-zero/synthesis/build-cost-estimation.js';
import { analyzeVirality } from '../../../../../lib/eva/stage-zero/synthesis/virality.js';
import { evaluateDesignPotential } from '../../../../../lib/eva/stage-zero/synthesis/design-evaluation.js';
import { analyzeNarrativeRisk } from '../../../../../lib/eva/stage-zero/synthesis/narrative-risk.js';
import { analyzeTechTrajectory } from '../../../../../lib/eva/stage-zero/synthesis/tech-trajectory.js';
import { analyzeAttentionCapital } from '../../../../../lib/eva/stage-zero/synthesis/attention-capital.js';
import { analyzeAgenticFit } from '../../../../../lib/eva/stage-zero/synthesis/agentic-fit.js';
import { runMentalModelAnalysis } from '../../../../../lib/eva/stage-zero/synthesis/mental-model-analysis.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

const validPathOutput = {
  origin_type: 'discovery',
  raw_material: { data: true },
  suggested_name: 'Test Venture',
  suggested_problem: 'A real problem',
  suggested_solution: 'An automated solution',
  target_market: 'SMBs',
  competitor_urls: [],
  blueprint_id: null,
  discovery_strategy: 'trend_scanner',
  metadata: { path: 'discovery_mode' },
};

// The 14 Promise.all mocked functions, in the same order runSynthesis destructures them.
const ALL_14_MOCKS = [
  crossReferenceIntellectualCapital,
  evaluatePortfolioFit,
  reframeProblem,
  designMoat,
  assessTimeHorizon,
  classifyArchetype,
  estimateBuildCost,
  analyzeVirality,
  evaluateDesignPotential,
  analyzeNarrativeRisk,
  analyzeTechTrajectory,
  analyzeAttentionCapital,
  analyzeAgenticFit,
  runMentalModelAnalysis,
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runSynthesis — fail-closed policy (SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001)', () => {
  test('FR-4 seeded-defect canary: all 15 components fail -> maturity is never ready, components_run is 0', async () => {
    // Force every one of the 14 Promise.all components to reject.
    for (const fn of ALL_14_MOCKS) {
      fn.mockRejectedValueOnce(new Error('seeded defect'));
    }
    // Force chairman_constraints to reject too (the 15th, run separately).
    applyChairmanConstraints.mockRejectedValueOnce(new Error('seeded defect'));

    const result = await runSynthesis(validPathOutput, { logger: silentLogger });

    // The run must resolve (never throw) — the engine is fail-soft at the component level,
    // fail-closed at the maturity level.
    expect(result).toBeDefined();
    expect(result.maturity).not.toBe('ready');
    expect(result.metadata.synthesis.components_run).toBe(0);
    expect(result.metadata.synthesis.components_total).toBe(15);
  });

  test('FR-5 partial failure: 5 of 15 components fail -> components_run is exactly 10, maturity is never ready', async () => {
    // Fail exactly 5 of the 14 Promise.all components; leave chairman_constraints and the
    // remaining 9 succeeding, so neither pre-existing branch (constraints fail /
    // park_and_build_later) is what blocks 'ready' — only the NEW weakest-link rule can.
    crossReferenceIntellectualCapital.mockRejectedValueOnce(new Error('seeded defect'));
    evaluatePortfolioFit.mockRejectedValueOnce(new Error('seeded defect'));
    designMoat.mockRejectedValueOnce(new Error('seeded defect'));
    analyzeVirality.mockRejectedValueOnce(new Error('seeded defect'));
    analyzeAttentionCapital.mockRejectedValueOnce(new Error('seeded defect'));

    const result = await runSynthesis(validPathOutput, { logger: silentLogger });

    expect(result.metadata.synthesis.components_run).toBe(10);
    expect(result.metadata.synthesis.components_total).toBe(15);
    expect(result.maturity).not.toBe('ready');
    // Prove the NEW branch fired, not a pre-existing one.
    expect(result.metadata.synthesis.chairman_constraints.verdict).not.toBe('fail');
    expect(result.metadata.synthesis.time_horizon.position).not.toBe('park_and_build_later');
  });

  test('FR-6 zero-failure baseline: all 15 components succeed -> components_run equals components_total equals 15, maturity unchanged', async () => {
    const result = await runSynthesis(validPathOutput, { logger: silentLogger });

    expect(result.metadata.synthesis.components_run).toBe(15);
    expect(result.metadata.synthesis.components_total).toBe(15);
    expect(result.maturity).toBe('ready');
  });
});
