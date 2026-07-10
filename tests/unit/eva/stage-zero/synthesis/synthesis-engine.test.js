/**
 * Unit Tests: Synthesis Engine
 *
 * Test Coverage:
 * - Runs all synthesis components
 * - Handles component failure gracefully (logs, continues)
 * - Resolves evaluation profile
 * - Falls back to legacy defaults when no profile
 * - Calculates weighted venture score
 * - Returns enriched brief with all results
 * - Handles empty pathOutput
 * - Determines maturity based on constraints/time-horizon
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock all synthesis component modules
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
  analyzeNarrativeRisk: vi.fn().mockResolvedValue({ component: 'narrative_risk', nr_score: 35, nr_band: 'NR-Moderate', nr_interpretation: 'Watch assumptions', component_scores: { decision_sensitivity: 40, demand_distortion: 30, hype_persistence: 25, influence_exposure: 20 }, narrative_flags: [], confidence: 0.7, confidence_caveat: 'Test caveat', summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/tech-trajectory.js', () => ({
  analyzeTechTrajectory: vi.fn().mockResolvedValue({ component: 'tech_trajectory', trajectory_score: 67, axes: { reasoning_autonomy: { current: 65, bull_6m: 85, base_6m: 75, bear_6m: 68, venture_impact: 'test' }, cost_deflation: { current: 50, bull_6m: 80, base_6m: 65, bear_6m: 45, venture_impact: 'test' }, multimodal_expansion: { current: 40, bull_6m: 70, base_6m: 55, bear_6m: 42, venture_impact: 'test' } }, competitive_timing: { signal: 'opening', confidence: 0.7, window_months: 6, rationale: 'test' }, next_disruption_event: { event: 'Test', estimated_months: 4, invalidation_scope: 'test' }, gap_windows: [], confidence_caveat: 'Test caveat', summary: 'ok', data_feed_active: false }),
}));
// SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001: 15th synthesis component
vi.mock('../../../../../lib/eva/stage-zero/synthesis/agentic-fit.js', () => ({
  analyzeAgenticFit: vi.fn().mockResolvedValue({ component: 'agentic_fit', agentic_fit_score: 72, fit_composite: 70, queue_jump_score: 80, dimension_scores: { agent_leverage: 80, compounding: 70, kill_speed: 65, attention_economy: 60 }, machine_improvement: 40, machine_improvement_bonus: 0.2, disadvantage_flags: [], disadvantage_down_weight: 1, hardest_disadvantage_flags: [], chairman_review_required: false, af_band: 'AF-High', af_interpretation: 'ok', confidence: 0.7, summary: 'ok' }),
  buildAgenticFitAdvisory: vi.fn().mockReturnValue(null),
}));
// SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001: these two were previously unmocked, so this suite
// silently ran their REAL implementations (which reject with no DB/LLM client in a test env).
// That was invisible under the old hardcoded components_run:15 stamp; the fail-closed fix now
// correctly counts every real failure, so proper isolation is required for the "all succeed"
// fixtures below to actually represent an all-succeeding run.
vi.mock('../../../../../lib/eva/stage-zero/synthesis/attention-capital.js', () => ({
  analyzeAttentionCapital: vi.fn().mockResolvedValue({ component: 'attention_capital', ac_score: 55, ac_band: 'AC-Moderate', ac_interpretation: 'ok', component_scores: { organic_search_momentum: 50, engagement_depth: 50, earned_media_ratio: 50, advocacy_signal: 50, return_engagement: 50 }, confidence: 0.6, confidence_caveat: '', summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/synthesis/mental-model-analysis.js', () => ({
  runMentalModelAnalysis: vi.fn().mockResolvedValue({ component: 'mental_model_analysis', models: [], summary: 'ok' }),
}));
vi.mock('../../../../../lib/eva/stage-zero/profile-service.js', () => ({
  resolveProfile: vi.fn().mockResolvedValue(null),
  calculateWeightedScore: vi.fn().mockReturnValue({ total_score: 75, breakdown: {} }),
}));

vi.mock('../../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
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
import { resolveProfile, calculateWeightedScore } from '../../../../../lib/eva/stage-zero/profile-service.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

const validPathOutput = {
  origin_type: 'discovery',
  // SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001: PRODUCTION shape — discovery-mode emits the
  // ranked winner at raw_material.top_candidate (paths/discovery-mode.js), which carries
  // the thesis derivation sources (revenue_model/monthly_revenue_potential -> price_point).
  raw_material: { data: true, top_candidate: { revenue_model: 'subscription', monthly_revenue_potential: '$5K/month', automation_approach: 'communities + SEO' } },
  suggested_name: 'Test Venture',
  suggested_problem: 'A real problem',
  suggested_solution: 'An automated solution',
  target_market: 'SMBs',
  competitor_urls: [],
  blueprint_id: null,
  discovery_strategy: 'trend_scanner',
  metadata: { path: 'discovery_mode' },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock implementations
  resolveProfile.mockResolvedValue(null);
});

describe('runSynthesis', () => {
  test('runs all 15 synthesis components', async () => {
    const result = await runSynthesis(validPathOutput, { logger: silentLogger });

    expect(crossReferenceIntellectualCapital).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(evaluatePortfolioFit).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(reframeProblem).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(designMoat).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(applyChairmanConstraints).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(assessTimeHorizon).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(classifyArchetype).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(estimateBuildCost).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(analyzeVirality).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(evaluateDesignPotential).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(analyzeNarrativeRisk).toHaveBeenCalledWith(validPathOutput, expect.anything());
    expect(analyzeTechTrajectory).toHaveBeenCalledWith(validPathOutput, expect.anything());

    expect(result.metadata.synthesis.components_run).toBe(15);
    expect(result.metadata.synthesis.components_total).toBe(15);
  });

  test('handles component failure gracefully', async () => {
    crossReferenceIntellectualCapital.mockRejectedValueOnce(new Error('DB down'));
    const logger = { log: vi.fn(), warn: vi.fn() };

    const result = await runSynthesis(validPathOutput, { logger });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cross-reference failed'));
    // Still returns a result with fallback data
    expect(result).toBeDefined();
    expect(result.metadata.synthesis.cross_reference.summary).toContain('Failed');
  });

  test('resolves evaluation profile', async () => {
    const mockProfile = {
      name: 'Test Profile',
      version: 1,
      source: 'active',
      weights: { cross_reference: 10, portfolio_evaluation: 15 },
    };
    resolveProfile.mockResolvedValueOnce(mockProfile);
    calculateWeightedScore.mockReturnValueOnce({ total_score: 82, breakdown: {} });

    const result = await runSynthesis(validPathOutput, { logger: silentLogger, profileId: 'test-id' });

    expect(resolveProfile).toHaveBeenCalled();
    expect(result.metadata.synthesis.profile).not.toBeNull();
    expect(result.metadata.synthesis.profile.name).toBe('Test Profile');
    expect(result.metadata.synthesis.weighted_score.total_score).toBe(82);
  });

  test('falls back gracefully when no profile available', async () => {
    resolveProfile.mockResolvedValueOnce(null);

    const result = await runSynthesis(validPathOutput, { logger: silentLogger });

    expect(result.metadata.synthesis.profile).toBeNull();
    expect(result.metadata.synthesis.weighted_score).toBeNull();
  });

  test('profile resolution failure FAILS the synthesis run (CH-2 fail-closed, no catch-to-null)', async () => {
    // SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001: the catch-to-null swallow was the
    // third fail-open layer — scoring without governed weights is the defect class.
    resolveProfile.mockRejectedValueOnce(new Error('profile DB error'));
    const logger = { log: vi.fn(), warn: vi.fn() };

    await expect(runSynthesis(validPathOutput, { logger })).rejects.toThrow('profile DB error');
  });

  test('returns enriched brief with all results', async () => {
    const result = await runSynthesis(validPathOutput, { logger: silentLogger });

    expect(result.name).toBe('Test Venture');
    expect(result.problem_statement).toBe('Better framing'); // from reframing
    expect(result.solution).toBe('An automated solution');
    expect(result.target_market).toBe('SMBs');
    expect(result.origin_type).toBe('discovery');
    expect(result.raw_chairman_intent).toBe('A real problem');
    expect(result.discovery_strategy).toBe('trend_scanner');
    expect(result.metadata.synthesis).toBeDefined();
    expect(result.metadata.synthesis.cross_reference).toBeDefined();
    expect(result.metadata.synthesis.virality).toBeDefined();
  });

  test('determines maturity=ready when constraints pass and horizon is build_now', async () => {
    const result = await runSynthesis(validPathOutput, { logger: silentLogger });
    expect(result.maturity).toBe('ready');
  });

  // SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 (adversarial-review CRITICAL fix):
  // required_capabilities was declared on the candidate but synthesis previously never
  // carried it into the persisted brief, so seeded_from_venture's carry-forward always
  // saw undefined in production. Two sources: raw_material.top_candidate (discovery_mode
  // shape) and pathOutput's own top-level field (single-candidate paths shape).
  test('threads required_capabilities from raw_material.top_candidate (discovery_mode shape) into the brief', async () => {
    const pathOutput = {
      ...validPathOutput,
      raw_material: { ...validPathOutput.raw_material, top_candidate: { ...validPathOutput.raw_material.top_candidate, required_capabilities: [{ name: 'venture web deploy', kind: 'form_factor' }] } },
    };
    const result = await runSynthesis(pathOutput, { logger: silentLogger });
    expect(result.required_capabilities).toEqual([{ name: 'venture web deploy', kind: 'form_factor' }]);
  });

  test('threads required_capabilities from a top-level pathOutput field (single-candidate path shape)', async () => {
    const pathOutput = { ...validPathOutput, required_capabilities: [{ name: 'stripe billing', kind: 'integration' }] };
    const result = await runSynthesis(pathOutput, { logger: silentLogger });
    expect(result.required_capabilities).toEqual([{ name: 'stripe billing', kind: 'integration' }]);
  });

  test('required_capabilities is null (not fabricated) when neither source declares it', async () => {
    const result = await runSynthesis(validPathOutput, { logger: silentLogger });
    expect(result.required_capabilities).toBeNull();
  });

  // SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001: the brief is a thesis, not a score.
  test('emits thesis + kill_criteria + explicit_decisions on every brief', async () => {
    const result = await runSynthesis(validPathOutput, { logger: silentLogger });
    expect(result.thesis.who_pays).toBe('SMBs');
    expect(result.thesis.provenance.who_pays.source_field).toBe('target_market');
    expect(result.thesis.incomplete_fields).toEqual([]);
    expect(result.kill_criteria.length).toBeGreaterThanOrEqual(2);
    expect(result.explicit_decisions.form_factor.value).toBe('web');
    expect(result.explicit_decisions.form_factor.decided_by).toBe('default');
  });

  test("SOFT-incomplete thesis (no revenue candidate, e.g. competitor-teardown shape) stays 'ready' — declared, not parked", async () => {
    // competitor-teardown/blueprint paths carry no revenue-shaped candidate at all;
    // demoting on soft fields would nursery-park every such venture (PR #5809 round-1).
    const noCandidate = { ...validPathOutput, raw_material: { data: true } };
    const result = await runSynthesis(noCandidate, { logger: silentLogger });
    expect(result.thesis.incomplete_fields).toContain('price_point');
    expect(result.thesis.incomplete_fields.every((f) => ['price_point', 'reached_how'].includes(f))).toBe(true);
    expect(result.maturity).toBe('ready');
  });

  test("CORE-incomplete thesis (no target_market -> no who_pays/plan) DEMOTES 'ready' -> 'seed'", async () => {
    const noMarket = { ...validPathOutput, target_market: '', raw_material: { data: true } };
    const result = await runSynthesis(noMarket, { logger: silentLogger });
    expect(result.thesis.incomplete_fields).toContain('who_pays');
    expect(result.maturity).toBe('seed');
  });

  test('determines maturity=blocked when constraints fail', async () => {
    applyChairmanConstraints.mockResolvedValueOnce({ component: 'chairman_constraints', verdict: 'fail', score: 20, summary: 'failed' });

    const result = await runSynthesis(validPathOutput, { logger: silentLogger });
    expect(result.maturity).toBe('blocked');
  });

  test('determines maturity=nursery when time horizon is park_and_build_later', async () => {
    assessTimeHorizon.mockResolvedValueOnce({ component: 'time_horizon', position: 'park_and_build_later', confidence: 0.7, summary: 'ok' });

    const result = await runSynthesis(validPathOutput, { logger: silentLogger });
    expect(result.maturity).toBe('nursery');
  });
});
