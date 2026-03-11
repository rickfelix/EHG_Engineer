/**
 * Tests for Experiment Feedback Loop modules
 * SD-LEO-FEAT-EXPERIMENT-FEEDBACK-LOOP-001
 *
 * Covers:
 * - FR-001: Gate Outcome Bridge
 * - FR-003: Bayesian Analyzer survival mode
 * - FR-004: Experiment Lifecycle Manager
 * - FR-005: LLM Meta-Optimizer
 * - FR-006: Chairman Report gate survival section
 * - FR-007: Baseline Predictive Accuracy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Gate Outcome Bridge (FR-001) ────────────────────────────────

describe('gate-outcome-bridge', () => {
  let recordGateOutcome, getActiveEnrollment, getGateSurvivalOutcomes;
  let KILL_GATE_STAGES, BOUNDARY_TO_STAGE;
  let mockSupabase, deps;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/gate-outcome-bridge.js');
    recordGateOutcome = mod.recordGateOutcome;
    getActiveEnrollment = mod.getActiveEnrollment;
    getGateSurvivalOutcomes = mod.getGateSurvivalOutcomes;
    KILL_GATE_STAGES = mod.KILL_GATE_STAGES;
    BOUNDARY_TO_STAGE = mod.BOUNDARY_TO_STAGE;

    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn(),
    };
    deps = { supabase: mockSupabase, logger: { log: vi.fn(), warn: vi.fn() } };
  });

  it('exports correct kill gate stages', () => {
    expect(KILL_GATE_STAGES).toEqual(new Set([3, 5, 13]));
  });

  it('maps gate boundaries correctly', () => {
    expect(BOUNDARY_TO_STAGE).toEqual({
      'stage_3': 3,
      '5->6': 5,
      '12->13': 13,
    });
  });

  it('returns null for non-tracked gate boundary', async () => {
    const result = await recordGateOutcome(deps, {
      ventureId: 'v1',
      gateBoundary: '20->21',
      passed: true,
    });
    expect(result).toBeNull();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('calls RPC for tracked gate boundary (stage_3)', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { success: true, variant_key: 'champion', outcome_id: 'o1' },
      error: null,
    });

    const result = await recordGateOutcome(deps, {
      ventureId: 'v1',
      gateBoundary: 'stage_3',
      passed: true,
      score: 85,
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('record_experiment_gate_outcome', {
      p_venture_id: 'v1',
      p_kill_gate_stage: 3,
      p_gate_passed: true,
      p_gate_score: 85,
      p_chairman_override: false,
      p_time_to_gate_hours: null,
    });
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it('computes time_to_gate_hours from assignedAt', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    mockSupabase.rpc.mockResolvedValue({
      data: { success: true, variant_key: 'challenger' },
      error: null,
    });

    await recordGateOutcome(deps, {
      ventureId: 'v2',
      gateBoundary: '5->6',
      passed: false,
      assignedAt: twoHoursAgo,
    });

    const call = mockSupabase.rpc.mock.calls[0][1];
    expect(call.p_time_to_gate_hours).toBeCloseTo(2, 0);
  });

  it('returns null on RPC error (non-blocking)', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection timeout' },
    });

    const result = await recordGateOutcome(deps, {
      ventureId: 'v1',
      gateBoundary: 'stage_3',
      passed: true,
    });
    expect(result).toBeNull();
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('returns null when not enrolled (success=false)', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { success: false, reason: 'no_assignment_for_venture' },
      error: null,
    });

    const result = await recordGateOutcome(deps, {
      ventureId: 'v1',
      gateBoundary: '12->13',
      passed: true,
    });
    expect(result).toBeNull();
  });

  it('catches thrown exceptions non-blockingly', async () => {
    mockSupabase.rpc.mockRejectedValue(new Error('network fail'));

    const result = await recordGateOutcome(deps, {
      ventureId: 'v1',
      gateBoundary: 'stage_3',
      passed: true,
    });
    expect(result).toBeNull();
  });

  describe('getGateSurvivalOutcomes', () => {
    it('returns gate_survival outcomes for an experiment', async () => {
      const mockData = [
        { id: 'o1', variant_key: 'champion', gate_passed: true, kill_gate_stage: 3 },
        { id: 'o2', variant_key: 'challenger', gate_passed: false, kill_gate_stage: 3 },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await getGateSurvivalOutcomes(deps, 'exp-1');
      expect(result).toHaveLength(2);
    });
  });
});


// ─── Bayesian Analyzer Survival Mode (FR-003) ───────────────────

describe('bayesian-analyzer survival mode', () => {
  let analyzeExperiment, computePosterior;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/bayesian-analyzer.js');
    analyzeExperiment = mod.analyzeExperiment;
    computePosterior = mod.computePosterior;
  });

  describe('computePosterior', () => {
    it('uses synthesis mode by default (score > 50)', () => {
      const outcomes = [
        { scores: { venture_score: 80 } },
        { scores: { venture_score: 30 } },
        { scores: { venture_score: 60 } },
      ];
      const result = computePosterior(outcomes);
      expect(result.mode).toBe('synthesis');
      expect(result.alpha).toBe(3); // 1 prior + 2 successes (80, 60)
      expect(result.beta).toBe(2);  // 1 prior + 1 failure (30)
      expect(result.n).toBe(3);
    });

    it('auto-detects survival mode from outcome_type', () => {
      const outcomes = [
        { outcome_type: 'gate_survival', gate_passed: true },
        { outcome_type: 'gate_survival', gate_passed: false },
        { outcome_type: 'gate_survival', gate_passed: true },
      ];
      const result = computePosterior(outcomes);
      expect(result.mode).toBe('survival');
      expect(result.alpha).toBe(3); // 1 prior + 2 passes
      expect(result.beta).toBe(2);  // 1 prior + 1 fail
    });

    it('respects forced survivalMode option', () => {
      const outcomes = [
        { gate_passed: true },
        { gate_passed: false },
      ];
      const result = computePosterior(outcomes, { survivalMode: true });
      expect(result.mode).toBe('survival');
      expect(result.alpha).toBe(2); // 1 prior + 1 pass
      expect(result.beta).toBe(2);  // 1 prior + 1 fail
    });

    it('accepts informative priors', () => {
      const outcomes = [
        { outcome_type: 'gate_survival', gate_passed: true },
      ];
      const result = computePosterior(outcomes, { prior: { alpha: 10, beta: 5 } });
      expect(result.alpha).toBe(11); // 10 prior + 1 pass
      expect(result.beta).toBe(5);   // 5 prior + 0 fail
    });

    it('handles empty outcomes with uniform prior', () => {
      const result = computePosterior([]);
      expect(result.alpha).toBe(1);
      expect(result.beta).toBe(1);
      expect(result.n).toBe(0);
      expect(result.meanScore).toBe(0);
    });
  });

  describe('analyzeExperiment with survival data', () => {
    it('analyzes gate survival outcomes', () => {
      const experiment = {
        variants: [
          { key: 'champion', prior: { alpha: 5, beta: 3 } },
          { key: 'challenger', prior: { alpha: 2, beta: 2 } },
        ],
      };
      const outcomes = [
        { variant_key: 'champion', outcome_type: 'gate_survival', gate_passed: true },
        { variant_key: 'champion', outcome_type: 'gate_survival', gate_passed: true },
        { variant_key: 'champion', outcome_type: 'gate_survival', gate_passed: false },
        { variant_key: 'challenger', outcome_type: 'gate_survival', gate_passed: true },
        { variant_key: 'challenger', outcome_type: 'gate_survival', gate_passed: false },
        { variant_key: 'challenger', outcome_type: 'gate_survival', gate_passed: false },
      ];

      const result = analyzeExperiment({ logger: console }, {
        experiment,
        outcomes,
        config: { minSamples: 2 },
      });

      expect(result.mode).toBe('survival');
      expect(result.per_variant.champion.count).toBe(3);
      expect(result.per_variant.challenger.count).toBe(3);
      // Champion has informative prior (5,3) + 2 pass + 1 fail = (7, 4)
      expect(result.per_variant.champion.posterior.alpha).toBe(7);
      expect(result.per_variant.champion.posterior.beta).toBe(4);
    });

    it('returns insufficient_variants with only one variant', () => {
      const result = analyzeExperiment({ logger: console }, {
        experiment: {},
        outcomes: [{ variant_key: 'champion', gate_passed: true }],
      });
      expect(result.status).toBe('insufficient_variants');
    });
  });
});


// ─── Meta-Optimizer (FR-005) ─────────────────────────────────────

describe('meta-optimizer', () => {
  let selectPerturbationOperator, validateChallengerSafety, PERTURBATION_OPERATORS;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/meta-optimizer.js');
    selectPerturbationOperator = mod.selectPerturbationOperator;
    validateChallengerSafety = mod.validateChallengerSafety;
    PERTURBATION_OPERATORS = mod.PERTURBATION_OPERATORS;
  });

  it('exports 6 perturbation operators', () => {
    expect(PERTURBATION_OPERATORS).toHaveLength(6);
    expect(PERTURBATION_OPERATORS).toContain('rephrase');
    expect(PERTURBATION_OPERATORS).toContain('decompose');
  });

  describe('selectPerturbationOperator', () => {
    it('selects from all operators with no history', () => {
      const op = selectPerturbationOperator([]);
      expect(PERTURBATION_OPERATORS).toContain(op);
    });

    it('avoids recently used operators', () => {
      const results = new Set();
      for (let i = 0; i < 100; i++) {
        results.add(selectPerturbationOperator([
          { perturbation: 'rephrase' },
          { perturbation: 'add_constraint' },
        ]));
      }
      // Should never pick rephrase or add_constraint (they're in recent 2)
      expect(results.has('rephrase')).toBe(false);
      expect(results.has('add_constraint')).toBe(false);
    });

    it('switches strategy after 3 consecutive failures with same operator', () => {
      const results = new Set();
      for (let i = 0; i < 100; i++) {
        results.add(selectPerturbationOperator([
          { perturbation: 'rephrase' },
          { perturbation: 'rephrase' },
          { perturbation: 'rephrase' },
        ]));
      }
      // Should never pick rephrase (excluded due to 3 consecutive failures)
      expect(results.has('rephrase')).toBe(false);
    });
  });

  describe('validateChallengerSafety', () => {
    it('passes valid content', () => {
      expect(() => validateChallengerSafety(
        'A valid prompt with sufficient length for testing purposes here.',
        []
      )).not.toThrow();
    });

    it('rejects content exceeding length budget (8000)', () => {
      const longContent = 'x'.repeat(8001);
      expect(() => validateChallengerSafety(longContent, []))
        .toThrow('exceeds length budget');
    });

    it('rejects content identical to a failed challenger', () => {
      const content = 'Some prompt content for testing';
      expect(() => validateChallengerSafety(content, [
        { content: 'Some prompt content for testing', perturbation: 'rephrase' },
      ])).toThrow('identical to a previous failed challenger');
    });

    it('rejects trivially short content', () => {
      expect(() => validateChallengerSafety('Short', []))
        .toThrow('too short');
    });
  });
});


// ─── Experiment Lifecycle (FR-004) ───────────────────────────────

describe('experiment-lifecycle', () => {
  let checkAndAdvanceExperiment;
  let mockSupabase, deps;

  beforeEach(async () => {
    vi.resetModules();

    // Mock the imported modules
    vi.doMock('../../../../lib/eva/experiments/bayesian-analyzer.js', () => ({
      analyzeExperiment: vi.fn(() => ({
        status: 'conclusive',
        stopping: { shouldStop: true, winner: 'champion', reason: 'clear winner' },
        per_variant: {
          champion: { count: 10, posterior: { alpha: 8, beta: 3 } },
          challenger: { count: 10, posterior: { alpha: 4, beta: 7 } },
        },
      })),
    }));

    vi.doMock('../../../../lib/eva/experiments/prompt-promotion.js', () => ({
      evaluatePromotion: vi.fn(() => ({ promoted: true, reason: 'meets threshold' })),
    }));

    vi.doMock('../../../../lib/eva/experiments/gate-outcome-bridge.js', () => ({
      getGateSurvivalOutcomes: vi.fn(() => [
        { variant_key: 'champion', gate_passed: true },
        { variant_key: 'champion', gate_passed: true },
        { variant_key: 'challenger', gate_passed: false },
        { variant_key: 'challenger', gate_passed: true },
      ]),
    }));

    const mod = await import('../../../../lib/eva/experiments/experiment-lifecycle.js');
    checkAndAdvanceExperiment = mod.checkAndAdvanceExperiment;

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'exp-1',
            status: 'running',
            variants: [
              { key: 'champion', prompt_name: 'eval_v3' },
              { key: 'challenger', prompt_name: 'eval_v3_challenger' },
            ],
            config: { stopping_rules: {} },
          },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
      }),
    };
    deps = { supabase: mockSupabase, logger: { log: vi.fn(), warn: vi.fn() } };
  });

  it('returns error for non-existent experiment', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });

    const result = await checkAndAdvanceExperiment(deps, 'nonexistent');
    expect(result.action).toBe('error');
  });

  it('returns error for non-running experiment', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'exp-1', status: 'completed' },
        error: null,
      }),
    });

    const result = await checkAndAdvanceExperiment(deps, 'exp-1');
    expect(result.action).toBe('error');
    expect(result.reason).toContain('completed');
  });
});


// ─── Chairman Report Gate Survival Section (FR-006) ──────────────

describe('chairman-report gate survival section', () => {
  let generateChairmanReport;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/chairman-report.js');
    generateChairmanReport = mod.generateChairmanReport;
  });

  it('includes gate survival section when mode is survival', () => {
    const analysis = {
      status: 'conclusive',
      mode: 'survival',
      total_samples: 20,
      per_variant: {
        champion: {
          count: 10,
          mean_score: 70,
          posterior: { alpha: 8, beta: 3 },
          credible_interval: { lower: 0.5, upper: 0.9, level: 0.95 },
        },
        challenger: {
          count: 10,
          mean_score: 40,
          posterior: { alpha: 5, beta: 6 },
          credible_interval: { lower: 0.25, upper: 0.7, level: 0.95 },
        },
      },
      comparisons: [{
        variantA: 'champion',
        variantB: 'challenger',
        probABetterThanB: 0.87,
        probBBetterThanA: 0.13,
      }],
      stopping: { shouldStop: true, winner: 'champion', reason: 'clear winner' },
    };

    const report = generateChairmanReport(analysis);
    const sectionTitles = report.sections.map(s => s.title);
    expect(sectionTitles).toContain('Gate Survival Metrics');
  });

  it('includes per-gate breakdown when gateSurvivalData provided', () => {
    const analysis = {
      status: 'running',
      mode: 'survival',
      total_samples: 6,
      per_variant: {
        champion: {
          count: 3,
          mean_score: 66.7,
          posterior: { alpha: 3, beta: 2 },
          credible_interval: { lower: 0.3, upper: 0.9, level: 0.95 },
        },
        challenger: {
          count: 3,
          mean_score: 33.3,
          posterior: { alpha: 2, beta: 3 },
          credible_interval: { lower: 0.1, upper: 0.7, level: 0.95 },
        },
      },
      comparisons: [],
      stopping: { shouldStop: false },
    };

    const gateSurvivalData = [
      { variant_key: 'champion', kill_gate_stage: 3, gate_passed: true, chairman_override: false },
      { variant_key: 'champion', kill_gate_stage: 3, gate_passed: true, chairman_override: false },
      { variant_key: 'champion', kill_gate_stage: 5, gate_passed: false, chairman_override: true },
      { variant_key: 'challenger', kill_gate_stage: 3, gate_passed: false, chairman_override: false },
      { variant_key: 'challenger', kill_gate_stage: 3, gate_passed: true, chairman_override: false },
      { variant_key: 'challenger', kill_gate_stage: 5, gate_passed: false, chairman_override: false },
    ];

    const report = generateChairmanReport(analysis, { gateSurvivalData });
    const gateSurvivalSection = report.sections.find(s => s.title === 'Gate Survival Metrics');
    expect(gateSurvivalSection).toBeDefined();

    const content = gateSurvivalSection.content;
    expect(content.per_gate_breakdown).not.toBe('insufficient_data');
    expect(content.per_gate_breakdown[3].champion.passed).toBe(2);
    expect(content.per_gate_breakdown[3].champion.survival_rate).toBe(100);
    expect(content.chairman_overrides.count).toBe(1);
    expect(content.chairman_overrides.total).toBe(6);
  });

  it('does not include gate survival section in synthesis mode', () => {
    const analysis = {
      status: 'running',
      total_samples: 10,
      per_variant: {
        champion: {
          count: 5,
          mean_score: 70,
          posterior: { alpha: 4, beta: 2 },
          credible_interval: { lower: 0.4, upper: 0.9, level: 0.95 },
        },
        challenger: {
          count: 5,
          mean_score: 60,
          posterior: { alpha: 3, beta: 3 },
          credible_interval: { lower: 0.3, upper: 0.8, level: 0.95 },
        },
      },
      comparisons: [],
      stopping: { shouldStop: false },
    };

    const report = generateChairmanReport(analysis);
    const sectionTitles = report.sections.map(s => s.title);
    expect(sectionTitles).not.toContain('Gate Survival Metrics');
  });
});


// ─── Baseline Accuracy (FR-007) ──────────────────────────────────

describe('baseline-accuracy', () => {
  let analyzeAccuracy;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/baseline-accuracy.js');
    analyzeAccuracy = mod.analyzeAccuracy;
  });

  it('computes confusion matrix correctly', () => {
    const records = [
      { synthesis_score: 80, kill_gate_stage: 3, gate_passed: true },  // TP
      { synthesis_score: 70, kill_gate_stage: 3, gate_passed: false }, // FP
      { synthesis_score: 30, kill_gate_stage: 5, gate_passed: false }, // TN
      { synthesis_score: 20, kill_gate_stage: 5, gate_passed: true },  // FN
    ];

    const result = analyzeAccuracy(records, 50, console);
    expect(result.confusion_matrix).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
    expect(result.accuracy).toBe(0.5);
    expect(result.total_records).toBe(4);
  });

  it('computes perfect accuracy when scores match outcomes', () => {
    const records = [
      { synthesis_score: 80, kill_gate_stage: 3, gate_passed: true },
      { synthesis_score: 90, kill_gate_stage: 5, gate_passed: true },
      { synthesis_score: 20, kill_gate_stage: 3, gate_passed: false },
      { synthesis_score: 10, kill_gate_stage: 13, gate_passed: false },
    ];

    const result = analyzeAccuracy(records, 50, console);
    expect(result.accuracy).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1_score).toBe(1);
  });

  it('computes per-gate breakdown', () => {
    const records = [
      { synthesis_score: 80, kill_gate_stage: 3, gate_passed: true },
      { synthesis_score: 80, kill_gate_stage: 5, gate_passed: false },
      { synthesis_score: 30, kill_gate_stage: 13, gate_passed: false },
    ];

    const result = analyzeAccuracy(records, 50, console);
    expect(result.per_gate[3].accuracy).toBe(1);
    expect(result.per_gate[5].accuracy).toBe(0);
    expect(result.per_gate[13].accuracy).toBe(1);
  });

  it('computes Brier score for calibration', () => {
    // Perfect prediction: score=100 passed=true → Brier contribution = 0
    // Score=0 passed=false → Brier contribution = 0
    const records = [
      { synthesis_score: 100, kill_gate_stage: 3, gate_passed: true },
      { synthesis_score: 0, kill_gate_stage: 3, gate_passed: false },
    ];

    const result = analyzeAccuracy(records, 50, console);
    expect(result.brier_score).toBe(0);
  });

  it('handles empty records', () => {
    const result = analyzeAccuracy([], 50, console);
    expect(result.total_records).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.brier_score).toBe(1);
  });

  it('provides meaningful interpretation', () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      synthesis_score: i < 15 ? 80 : 20,
      kill_gate_stage: 3,
      gate_passed: i < 15,
    }));

    const result = analyzeAccuracy(records, 50, console);
    expect(result.interpretation).toBeTruthy();
    expect(typeof result.interpretation).toBe('string');
  });
});

// ─── Gate Signal Service Bridge Wiring ─────────────────────────────

describe('gate-signal-service experiment bridge', () => {
  it('calls recordGateOutcome after recording gate signal', async () => {
    vi.resetModules();

    // Mock gate-outcome-bridge before importing gate-signal-service
    const mockRecordGateOutcome = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../../lib/eva/experiments/gate-outcome-bridge.js', () => ({
      recordGateOutcome: mockRecordGateOutcome,
    }));

    const { recordGateSignal } = await import('../../../../lib/eva/stage-zero/gate-signal-service.js');

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sig-1', profile_id: null, venture_id: 'v-1', gate_boundary: 'stage_3', signal_type: 'pass' },
              error: null,
            }),
          }),
        }),
      }),
    };

    const deps = { supabase: mockSupabase, logger: { log: vi.fn(), warn: vi.fn() } };

    await recordGateSignal(deps, {
      ventureId: 'venture-uuid-1234-5678',
      gateBoundary: 'stage_3',
      signalType: 'pass',
      outcome: { score: 85 },
    });

    // Bridge should have been called with correct arguments
    expect(mockRecordGateOutcome).toHaveBeenCalledWith(deps, expect.objectContaining({
      ventureId: 'venture-uuid-1234-5678',
      gateBoundary: 'stage_3',
      passed: true,
      score: 85,
    }));
  });
});

// ─── Thompson Sampling (Adaptive Assignment) ──────────────────────

describe('Thompson Sampling assignment', () => {
  let thompsonSample;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../lib/eva/experiments/experiment-assignment.js');
    thompsonSample = mod.thompsonSample;
  });

  it('returns a valid variant key', () => {
    const variants = [
      { key: 'champion', prior: { alpha: 10, beta: 2 } },
      { key: 'challenger', prior: { alpha: 2, beta: 10 } },
    ];
    const result = thompsonSample(variants, { log: vi.fn() });
    expect(['champion', 'challenger']).toContain(result);
  });

  it('favors the variant with better posterior over many samples', () => {
    const variants = [
      { key: 'strong', prior: { alpha: 50, beta: 5 } },    // ~91% success rate
      { key: 'weak', prior: { alpha: 5, beta: 50 } },      // ~9% success rate
    ];

    const counts = { strong: 0, weak: 0 };
    for (let i = 0; i < 200; i++) {
      const result = thompsonSample(variants, { log: () => {} });
      counts[result]++;
    }

    // Strong variant should be picked >80% of the time
    expect(counts.strong).toBeGreaterThan(160);
  });

  it('uses uniform prior (alpha=2, beta=2) when no priors provided', () => {
    const variants = [
      { key: 'a' },
      { key: 'b' },
    ];

    // Should not throw
    const result = thompsonSample(variants, { log: vi.fn() });
    expect(['a', 'b']).toContain(result);
  });

  it('explores both variants when priors are equal', () => {
    const variants = [
      { key: 'a', prior: { alpha: 10, beta: 10 } },
      { key: 'b', prior: { alpha: 10, beta: 10 } },
    ];

    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 200; i++) {
      const result = thompsonSample(variants, { log: () => {} });
      counts[result]++;
    }

    // Both should get meaningful allocation (within 30/70 range)
    expect(counts.a).toBeGreaterThan(40);
    expect(counts.b).toBeGreaterThan(40);
  });
});

// ─── Prompt Promotion Survival Mode ───────────────────────────────

describe('prompt-promotion survival mode', () => {
  let createPromotionRecord;

  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock('../../../../lib/eva/experiments/prompt-promotion.js');
    const mod = await import('../../../../lib/eva/experiments/prompt-promotion.js');
    createPromotionRecord = mod.createPromotionRecord;
  });

  it('includes survival rates in effect_summary when mode is survival', () => {
    const analysis = {
      mode: 'survival',
      total_samples: 50,
      per_variant: {
        champion: { count: 25, mean_score: 0.8, posterior: { alpha: 20, beta: 5 } },
        challenger: { count: 25, mean_score: 0.6, posterior: { alpha: 15, beta: 10 } },
      },
      comparisons: [{ variantA: 'champion', variantB: 'challenger', probABetterThanB: 0.92, probBBetterThanA: 0.08 }],
    };

    const record = createPromotionRecord({
      experimentId: 'exp-1',
      winner: 'champion',
      promptName: 'prompt-v1',
      confidence: 0.92,
      analysis,
      config: { confidenceThreshold: 0.90 },
    });

    expect(record.analysis_mode).toBe('survival');
    expect(record.effect_summary.mode).toBe('survival');
    expect(record.effect_summary.winner_survival_rate).toBe(0.8);
    expect(record.effect_summary.loser_survival_rate).toBe(0.6);
    expect(record.effect_summary.absolute_diff).toBe(0.2);
  });

  it('uses synthesis mode when analysis.mode is not survival', () => {
    const analysis = {
      mode: 'synthesis',
      total_samples: 50,
      per_variant: {
        champion: { count: 25, mean_score: 85, posterior: { alpha: 20, beta: 5 } },
        challenger: { count: 25, mean_score: 75, posterior: { alpha: 15, beta: 10 } },
      },
    };

    const record = createPromotionRecord({
      experimentId: 'exp-1',
      winner: 'champion',
      promptName: 'prompt-v1',
      confidence: 0.92,
      analysis,
      config: { confidenceThreshold: 0.90 },
    });

    expect(record.analysis_mode).toBe('synthesis');
    expect(record.effect_summary.mode).toBe('synthesis');
    expect(record.effect_summary.winner_mean).toBe(85);
    expect(record.effect_summary.loser_mean).toBe(75);
  });
});
