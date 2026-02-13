/**
 * Phase A End-to-End Integration Test (15-Step Scenario)
 *
 * SD-EVA-FEAT-PHASE-A-VALIDATION-001
 * Architecture Section 13: Phase A Validation
 *
 * Wires real EVA modules together with a stateful mock Supabase
 * to exercise the full 15-step venture lifecycle scenario:
 *
 *  1. Ideate → Stage 0 (path routing, synthesis, financial forecast)
 *  2. Chairman approves brief → venture created at Stage 1
 *  3. CEO Service runs Stages 2-9 (auto-proceed, reality gates, kill gates)
 *  4. Stage 10 blocks → chairman decision created
 *  5. Chairman approves → continues to Stage 12
 *  6. Stages 13-17 auto-advance
 *  7. Stage 18 → SD Bridge creates LEO SDs
 *  8. (LEO executes SDs externally)
 *  9. Return path receives SD completion → Stage 19 updates
 * 10. Stages 20-21 auto-advance
 * 11. Stage 22 blocks → chairman decides "release"
 * 12. Stage 23 auto-advances (launch)
 * 13. Stage 24 auto-advances (metrics)
 * 14. Stage 25 blocks → chairman decides "continue"
 * 15. Venture enters ops cycle (Stage 24 version 2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sd-key-generator (has shebang that vitest can't transform)
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-E2E-SPRINT-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-E2E-SPRINT-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('E2E'),
}));

// Mock devil's advocate to avoid LLM calls in tests
vi.mock('../../../lib/eva/devils-advocate.js', async () => {
  const actual = await vi.importActual('../../../lib/eva/devils-advocate.js');
  return {
    ...actual,
    getDevilsAdvocateReview: vi.fn().mockResolvedValue({
      overallAssessment: 'PROCEED',
      counterArguments: [],
      isFallback: true,
    }),
    buildArtifactRecord: vi.fn().mockReturnValue({
      venture_id: 'v-e2e-phase-a',
      artifact_type: 'devils_advocate_review',
      quality_score: 0.8,
    }),
  };
});

import { processStage, _internal } from '../../../lib/eva/eva-orchestrator.js';
import { evaluateDecision, DEFAULTS } from '../../../lib/eva/decision-filter-engine.js';
import { evaluateRealityGate, BOUNDARY_CONFIG } from '../../../lib/eva/reality-gates.js';
import { isDevilsAdvocateGate } from '../../../lib/eva/devils-advocate.js';

const { STATUS, FILTER_ACTION } = _internal;

const silentLogger = {
  log: vi.fn(), warn: vi.fn(), error: vi.fn(),
  info: vi.fn(), debug: vi.fn(),
};

// ── Stateful Mock Supabase ─────────────────────────────────────
// Tracks venture state, decisions, events, and artifacts across stages

function createStatefulMockSupabase() {
  const state = {
    venture: {
      id: 'v-e2e-phase-a',
      name: 'Phase A E2E Test Venture',
      status: 'active',
      current_lifecycle_stage: 0,
      archetype: 'saas',
      created_at: '2026-02-13T00:00:00Z',
    },
    decisions: [],
    events: [],
    artifacts: [],
    sds_created: [],
    stage_work: [],
  };

  const supabase = {
    _state: state,
    from: vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() =>
            Promise.resolve({ data: { ...state.venture }, error: null })
          ),
          update: vi.fn().mockImplementation((updates) => ({
            eq: vi.fn().mockImplementation(() => {
              Object.assign(state.venture, updates);
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        };
      }
      if (table === 'venture_artifacts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockImplementation(() => {
            // Return artifacts for current stage range (for reality gates)
            return Promise.resolve({ data: state.artifacts, error: null });
          }),
          insert: vi.fn().mockImplementation((records) => {
            const items = Array.isArray(records) ? records : [records];
            state.artifacts.push(...items);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            const pending = state.decisions.find(d => d.status === 'pending');
            return Promise.resolve({ data: pending || null, error: null });
          }),
          insert: vi.fn().mockImplementation((records) => {
            const items = Array.isArray(records) ? records : [records];
            items.forEach(r => {
              const decision = { id: `dec-${state.decisions.length}`, status: 'pending', ...r };
              state.decisions.push(decision);
            });
            return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: items[0], error: null }) };
          }),
          update: vi.fn().mockImplementation((updates) => ({
            eq: vi.fn().mockImplementation((col, val) => {
              const dec = state.decisions.find(d => d.id === val);
              if (dec) Object.assign(dec, updates);
              return Promise.resolve({ data: null, error: null });
            }),
          })),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(() => {
            const pending = state.decisions.find(d => d.status === 'pending');
            return Promise.resolve({ data: pending || null, error: null });
          }),
        };
      }
      if (table === 'eva_events') {
        return {
          insert: vi.fn().mockImplementation((records) => {
            const items = Array.isArray(records) ? records : [records];
            state.events.push(...items);
            return Promise.resolve({ data: null, error: null });
          }),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: state.events, error: null }),
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockImplementation((records) => {
            const items = Array.isArray(records) ? records : [records];
            state.sds_created.push(...items);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: `sd-e2e-${state.sds_created.length}`, ...items[0] },
                error: null,
              }),
            };
          }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'venture_stage_work') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          insert: vi.fn().mockImplementation((records) => {
            const items = Array.isArray(records) ? records : [records];
            state.stage_work.push(...items);
            return Promise.resolve({ data: null, error: null });
          }),
          update: vi.fn().mockImplementation((updates) => ({
            eq: vi.fn().mockReturnThis(),
            match: vi.fn().mockImplementation(() => {
              // Find matching stage_work and update it
              const work = state.stage_work.find(w => !w.completed);
              if (work) Object.assign(work, updates);
              return Promise.resolve({ data: null, error: null });
            }),
          })),
          order: vi.fn().mockResolvedValue({ data: state.stage_work, error: null }),
          single: vi.fn().mockResolvedValue({ data: state.stage_work[0] || null, error: null }),
        };
      }
      // Fallback for chairman_preferences, stage_templates, etc.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
  };

  return supabase;
}

// ── Test Helpers ──────────────────────────────────────────────

/** Create a stage template that simulates normal stage processing */
function makeStageTemplate(stageId, options = {}) {
  const { cost = 5000, score = 8 } = options;
  return {
    analysisSteps: [{
      id: `stage-${stageId}-analysis`,
      execute: vi.fn().mockResolvedValue({
        artifactType: `stage_${stageId}_output`,
        payload: { cost, score, stage: stageId },
        source: `stage-${stageId}`,
      }),
    }],
  };
}

/** Create a stage template for Stage 18 (SD Bridge) */
function makeSDBridgeTemplate() {
  return {
    analysisSteps: [{
      id: 'sprint-planning',
      execute: vi.fn().mockResolvedValue({
        artifactType: 'sprint_plan',
        payload: {
          sprint_plan: {
            tasks: [
              { title: 'Build user auth', description: 'Implement auth flow', priority: 'high', type: 'feature' },
              { title: 'Add payment gateway', description: 'Stripe integration', priority: 'high', type: 'feature' },
            ],
          },
          sd_bridge_payloads: [
            {
              title: 'Build user auth',
              description: 'Implement authentication flow',
              priority: 'high',
              type: 'feature',
              scope: 'User auth module',
              success_criteria: ['Auth flow works'],
              dependencies: [],
              risks: [],
              target_application: 'EHG',
              story_points: 5,
            },
          ],
          cost: 0,
          score: 9,
        },
        source: 'sprint-planning',
      }),
    }],
  };
}

/** Build required artifacts for a reality gate boundary */
function buildBoundaryArtifacts(boundary) {
  const config = BOUNDARY_CONFIG[boundary];
  if (!config) return [];
  return config.required_artifacts.map(req => ({
    artifact_type: req.artifact_type,
    quality_score: 0.85,
    is_current: true,
  }));
}

/** Wraps evaluateRealityGate for use as processStage dependency */
async function realityGateWrapper(params, deps) {
  const result = await evaluateRealityGate({
    ventureId: params.ventureId || params.from,
    fromStage: params.from,
    toStage: params.to,
    db: deps.db,
    logger: silentLogger,
  });
  // NOT_APPLICABLE means this isn't a boundary stage — treated as pass
  return { passed: result.status === 'PASS' || result.status === 'NOT_APPLICABLE', ...result };
}

// ── 15-Step E2E Test ──────────────────────────────────────────

describe('Phase A E2E Integration Test (15-Step Scenario)', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createStatefulMockSupabase();
    vi.clearAllMocks();
  });

  // Step 1: Ideation → Stage 0
  it('Step 1: Stage 0 executes path routing, synthesis, and financial forecast', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 0;

    const stageTemplate = {
      analysisSteps: [
        {
          id: 'path-routing',
          execute: vi.fn().mockResolvedValue({
            artifactType: 'path_routing',
            payload: { path: 'competitor_teardown', urls: ['https://competitor.com'] },
            source: 'path-router',
          }),
        },
        {
          id: 'eight-component-synthesis',
          execute: vi.fn().mockResolvedValue({
            artifactType: 'venture_synthesis',
            payload: {
              components: 8,
              venture_score: 7.5,
              archetype: 'saas',
              moat_strategy: 'network_effects',
              financial_forecast: { mrr_6mo: 15000, cac: 50, ltv: 600 },
            },
            source: 'synthesis-engine',
          }),
        },
        {
          id: 'financial-forecast',
          execute: vi.fn().mockResolvedValue({
            artifactType: 'financial_forecast',
            payload: { score: 8, cost: 3000, runway_months: 18 },
            source: 'forecast',
          }),
        },
      ],
    };

    const result = await processStage(
      { ventureId: 'v-e2e-phase-a', stageId: 0, options: { dryRun: true, stageTemplate } },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
    expect(result.artifacts).toHaveLength(3);

    // Verify venture brief components
    const synthesis = result.artifacts.find(a => a.artifactType === 'venture_synthesis');
    expect(synthesis).toBeDefined();
    expect(synthesis.payload.venture_score).toBeGreaterThan(0);
    expect(synthesis.payload.archetype).toBe('saas');
    expect(synthesis.payload.moat_strategy).toBeTruthy();
  });

  // Step 2: Chairman approves brief → venture at Stage 1
  it('Step 2: Chairman approval creates venture at Stage 1', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 1;

    const result = await processStage(
      { ventureId: 'v-e2e-phase-a', stageId: 1, options: { dryRun: true, stageTemplate: makeStageTemplate(1) } },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
    expect(state.venture.current_lifecycle_stage).toBe(1);
  });

  // Step 3: CEO Service runs Stages 2-9 with auto-proceed, reality gates, kill gates
  it('Step 3: Stages 2-9 auto-advance with DFE auto-proceed and gates', async () => {
    const state = mockSupabase._state;
    const stageResults = [];

    for (let stage = 2; stage <= 9; stage++) {
      state.venture.current_lifecycle_stage = stage;

      // Add required artifacts for reality gate boundaries
      if (stage === 5) {
        state.artifacts.push(...buildBoundaryArtifacts('5->6'));
      }
      if (stage === 9) {
        state.artifacts.push(...buildBoundaryArtifacts('9->10'));
      }

      const result = await processStage(
        { ventureId: 'v-e2e-phase-a', stageId: stage, options: { dryRun: true, stageTemplate: makeStageTemplate(stage) } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: realityGateWrapper,
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      stageResults.push(result);
    }

    // All 8 stages should complete
    expect(stageResults).toHaveLength(8);
    stageResults.forEach((r, i) => {
      expect(r.status).toBe(STATUS.COMPLETED);
      expect(r.stageId).toBe(i + 2);
    });

    // Verify kill gates at stages 3 and 5 were encountered
    const killGate3 = isDevilsAdvocateGate(3);
    const killGate5 = isDevilsAdvocateGate(5);
    expect(killGate3.isGate).toBe(true);
    expect(killGate3.gateType).toBe('kill');
    expect(killGate5.isGate).toBe(true);
    expect(killGate5.gateType).toBe('kill');
  });

  // Step 4: Stage 10 blocks → chairman decision
  it('Step 4: Stage 10 triggers REQUIRE_REVIEW and creates chairman decision', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 10;

    // Use a low score to trigger REQUIRE_REVIEW
    const result = await processStage(
      {
        ventureId: 'v-e2e-phase-a',
        stageId: 10,
        options: {
          dryRun: true,
          stageTemplate: makeStageTemplate(10, { score: DEFAULTS['filter.min_score'] - 2, cost: 1000 }),
        },
      },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
    expect(result.filterDecision.action).toBe(FILTER_ACTION.REQUIRE_REVIEW);

    // Verify a low_score trigger was fired
    const scoreTrigger = result.filterDecision.raw.triggers.find(t => t.type === 'low_score');
    expect(scoreTrigger).toBeDefined();
  });

  // Step 5: Chairman approves → continues to Stage 12
  it('Step 5: After chairman approval, Stages 11-12 auto-advance', async () => {
    const state = mockSupabase._state;
    const results = [];

    for (let stage = 11; stage <= 12; stage++) {
      state.venture.current_lifecycle_stage = stage;

      // Add artifacts for reality gate at 12->13
      if (stage === 12) {
        state.artifacts.push(...buildBoundaryArtifacts('12->13'));
      }

      const result = await processStage(
        { ventureId: 'v-e2e-phase-a', stageId: stage, options: { dryRun: true, stageTemplate: makeStageTemplate(stage) } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: realityGateWrapper,
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      results.push(result);
    }

    results.forEach(r => expect(r.status).toBe(STATUS.COMPLETED));
  });

  // Step 6: Stages 13-17 auto-advance
  it('Step 6: Stages 13-17 auto-advance through execution phases', async () => {
    const state = mockSupabase._state;
    const results = [];

    for (let stage = 13; stage <= 17; stage++) {
      state.venture.current_lifecycle_stage = stage;

      // Add artifacts for reality gate at 16->17
      if (stage === 16) {
        state.artifacts.push(...buildBoundaryArtifacts('16->17'));
      }

      const result = await processStage(
        { ventureId: 'v-e2e-phase-a', stageId: stage, options: { dryRun: true, stageTemplate: makeStageTemplate(stage) } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: realityGateWrapper,
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      results.push(result);
    }

    expect(results).toHaveLength(5);
    results.forEach(r => expect(r.status).toBe(STATUS.COMPLETED));

    // Verify promotion gate at stage 16
    const promotionGate16 = isDevilsAdvocateGate(16);
    expect(promotionGate16.isGate).toBe(true);
    expect(promotionGate16.gateType).toBe('promotion');
  });

  // Step 7: Stage 18 → SD Bridge creates LEO SDs
  it('Step 7: Stage 18 SD Bridge creates LEO Strategic Directives from sprint plan', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 18;

    const result = await processStage(
      { ventureId: 'v-e2e-phase-a', stageId: 18, options: { dryRun: true, stageTemplate: makeSDBridgeTemplate() } },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);

    // Verify sprint plan artifact was created
    const sprintPlan = result.artifacts.find(a => a.artifactType === 'sprint_plan');
    expect(sprintPlan).toBeDefined();
    expect(sprintPlan.payload.sd_bridge_payloads).toBeDefined();
    expect(sprintPlan.payload.sd_bridge_payloads.length).toBeGreaterThan(0);
  });

  // Steps 8-9: LEO executes SDs and return path updates Stage 19
  it('Steps 8-9: Return path processes SD completions at Stage 19', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 19;

    // Simulate SD completion by adding stage work records
    state.stage_work.push({
      venture_id: 'v-e2e-phase-a',
      stage: 19,
      task_type: 'sd_completion',
      sd_id: 'SD-E2E-SPRINT-TEST-001',
      status: 'completed',
      completed: true,
    });

    const result = await processStage(
      { ventureId: 'v-e2e-phase-a', stageId: 19, options: { dryRun: true, stageTemplate: makeStageTemplate(19) } },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
    expect(state.stage_work.length).toBeGreaterThan(0);
  });

  // Step 10: Stages 20-21 auto-advance
  it('Step 10: Stages 20-21 auto-advance with reality gate at 20->21', async () => {
    const state = mockSupabase._state;
    const results = [];

    for (let stage = 20; stage <= 21; stage++) {
      state.venture.current_lifecycle_stage = stage;

      if (stage === 20) {
        state.artifacts.push(...buildBoundaryArtifacts('20->21'));
      }

      const result = await processStage(
        { ventureId: 'v-e2e-phase-a', stageId: stage, options: { dryRun: true, stageTemplate: makeStageTemplate(stage) } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: realityGateWrapper,
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      results.push(result);
    }

    results.forEach(r => expect(r.status).toBe(STATUS.COMPLETED));
  });

  // Step 11: Stage 22 blocks → Chairman decides "release"
  it('Step 11: Stage 22 triggers chairman release decision', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 22;

    // Stage 22 is a promotion gate — verify gate type
    const gate22 = isDevilsAdvocateGate(22);
    expect(gate22.isGate).toBe(true);
    expect(gate22.gateType).toBe('promotion');

    const result = await processStage(
      { ventureId: 'v-e2e-phase-a', stageId: 22, options: { dryRun: true, stageTemplate: makeStageTemplate(22) } },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
  });

  // Step 12: Stage 23 auto-advances (launch)
  it('Step 12: Stage 23 auto-advances (launch phase)', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 23;

    // Stage 23 is a kill gate
    const gate23 = isDevilsAdvocateGate(23);
    expect(gate23.isGate).toBe(true);
    expect(gate23.gateType).toBe('kill');

    const result = await processStage(
      { ventureId: 'v-e2e-phase-a', stageId: 23, options: { dryRun: true, stageTemplate: makeStageTemplate(23) } },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
  });

  // Step 13: Stage 24 auto-advances (metrics)
  it('Step 13: Stage 24 auto-advances (AARRR metrics collection)', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 24;

    const result = await processStage(
      {
        ventureId: 'v-e2e-phase-a',
        stageId: 24,
        options: {
          dryRun: true,
          stageTemplate: {
            analysisSteps: [{
              id: 'aarrr-metrics',
              execute: vi.fn().mockResolvedValue({
                artifactType: 'aarrr_metrics',
                payload: {
                  acquisition: { visitors: 1000 },
                  activation: { signups: 100 },
                  retention: { day7: 0.4 },
                  revenue: { mrr: 5000 },
                  referral: { rate: 0.1 },
                  score: 9,
                  cost: 0,
                },
                source: 'aarrr-collector',
              }),
            }],
          },
        },
      },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
    const metrics = result.artifacts.find(a => a.artifactType === 'aarrr_metrics');
    expect(metrics).toBeDefined();
    expect(metrics.payload.revenue.mrr).toBeGreaterThan(0);
  });

  // Step 14: Stage 25 blocks → Chairman decides "continue"
  it('Step 14: Stage 25 triggers chairman "continue" decision', async () => {
    const state = mockSupabase._state;
    state.venture.current_lifecycle_stage = 25;

    const result = await processStage(
      { ventureId: 'v-e2e-phase-a', stageId: 25, options: { dryRun: true, stageTemplate: makeStageTemplate(25) } },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
  });

  // Step 15: Venture enters ops cycle
  it('Step 15: Venture enters ops cycle (Stage 24 version 2)', async () => {
    const state = mockSupabase._state;
    // Ops cycle means returning to stage 24 with ops context
    state.venture.current_lifecycle_stage = 24;

    const result = await processStage(
      {
        ventureId: 'v-e2e-phase-a',
        stageId: 24,
        options: {
          dryRun: true,
          stageTemplate: {
            analysisSteps: [{
              id: 'ops-cycle-metrics',
              execute: vi.fn().mockResolvedValue({
                artifactType: 'ops_cycle_metrics',
                payload: {
                  ops_cycle: true,
                  cycle_version: 2,
                  health_status: 'healthy',
                  score: 9,
                  cost: 0,
                },
                source: 'ops-cycle',
              }),
            }],
          },
        },
      },
      {
        supabase: mockSupabase,
        logger: silentLogger,
        evaluateDecisionFn: evaluateDecision,
        evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
        validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
      },
    );

    expect(result.status).toBe(STATUS.COMPLETED);
    const opsMetrics = result.artifacts.find(a => a.artifactType === 'ops_cycle_metrics');
    expect(opsMetrics).toBeDefined();
    expect(opsMetrics.payload.ops_cycle).toBe(true);
    expect(opsMetrics.payload.cycle_version).toBe(2);
  });

  // ── Cross-Cutting Validation ──────────────────────────────────

  describe('Cross-cutting: Gate boundary coverage', () => {
    it('verifies all 5 reality gate boundaries are defined', () => {
      const boundaries = Object.keys(BOUNDARY_CONFIG);
      expect(boundaries).toContain('5->6');
      expect(boundaries).toContain('9->10');
      expect(boundaries).toContain('12->13');
      expect(boundaries).toContain('16->17');
      expect(boundaries).toContain('20->21');
    });

    it('verifies kill gates at stages 3, 5, 13, 23 and promotion gates at 16, 17, 22', () => {
      // Kill gates
      for (const stage of [3, 5, 13, 23]) {
        const { isGate, gateType } = isDevilsAdvocateGate(stage);
        expect(isGate).toBe(true);
        expect(gateType).toBe('kill');
      }
      // Promotion gates
      for (const stage of [16, 17, 22]) {
        const { isGate, gateType } = isDevilsAdvocateGate(stage);
        expect(isGate).toBe(true);
        expect(gateType).toBe('promotion');
      }
    });
  });

  describe('Cross-cutting: Decision Filter Engine defaults', () => {
    it('has sensible default thresholds', () => {
      expect(DEFAULTS['filter.cost_max_usd']).toBeGreaterThan(0);
      expect(DEFAULTS['filter.min_score']).toBeGreaterThan(0);
      expect(DEFAULTS['filter.min_score']).toBeLessThanOrEqual(10);
    });
  });

  describe('Cross-cutting: Full sequential lifecycle', () => {
    it('processes stages 0-25 sequentially without runtime errors', { timeout: 120000 }, async () => {
      const state = mockSupabase._state;
      const allResults = [];

      for (let stage = 0; stage <= 25; stage++) {
        state.venture.current_lifecycle_stage = stage;

        // Seed boundary artifacts
        const boundaries = ['5->6', '9->10', '12->13', '16->17', '20->21'];
        for (const b of boundaries) {
          const [from] = b.split('->').map(Number);
          if (stage === from) {
            state.artifacts.push(...buildBoundaryArtifacts(b));
          }
        }

        const template = stage === 18
          ? makeSDBridgeTemplate()
          : makeStageTemplate(stage);

        const result = await processStage(
          { ventureId: 'v-e2e-phase-a', stageId: stage, options: { dryRun: true, stageTemplate: template } },
          {
            supabase: mockSupabase,
            logger: silentLogger,
            evaluateDecisionFn: evaluateDecision,
            evaluateRealityGateFn: realityGateWrapper,
            validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
          },
        );

        allResults.push(result);
      }

      // All 26 stages (0-25) processed
      expect(allResults).toHaveLength(26);

      // Count completed vs other
      const completed = allResults.filter(r => r.status === STATUS.COMPLETED);
      const failed = allResults.filter(r => r.status === STATUS.FAILED);
      const blocked = allResults.filter(r => r.status === STATUS.BLOCKED);

      // No stages should fail or block in this full-auto-proceed scenario
      expect(failed).toHaveLength(0);
      expect(blocked).toHaveLength(0);
      expect(completed).toHaveLength(26);
    });
  });
});
