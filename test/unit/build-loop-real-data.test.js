/**
 * Build Loop Real Data Wiring (Stages 19-22) - Unit Tests
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-C
 *
 * Tests the real data path for stages 19-22 analysis steps:
 * - Stage 19: fetchRealBuildData from venture_stage_work
 * - Stage 20: fetchRealQAData from SD completion rates
 * - Stage 21: buildRealIntegrationData from upstream real data
 * - Stage 22: buildRealReleaseData from upstream real data
 * - Graceful fallback when no real data exists
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock LLM client before importing analysis steps
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({
    complete: vi.fn().mockResolvedValue(JSON.stringify({
      tasks: [{ name: 'Mock Task', description: 'test', assignee: 'dev', status: 'done' }],
      issues: [],
      sprintCompletion: { decision: 'complete', readyForQa: true, rationale: 'Mock' },
    })),
  }),
}));

vi.mock('../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: (response) => {
    try { return JSON.parse(response); } catch { return {}; }
  },
  extractUsage: () => ({ input_tokens: 100, output_tokens: 50 }),
}));

vi.mock('../../../lib/eva/utils/four-buckets-prompt.js', () => ({
  getFourBucketsPrompt: () => '',
}));

vi.mock('../../../lib/eva/utils/four-buckets-parser.js', () => ({
  parseFourBuckets: () => null,
}));

vi.mock('../../../lib/eva/contracts/financial-contract.js', () => ({
  getContract: () => null,
}));

vi.mock('../../../lib/eva/stage-templates/stage-22.js', () => ({
  evaluatePromotionGate: () => ({
    passed: true,
    score: 85,
    maxScore: 100,
    criteria: {},
  }),
}));

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Helper: Mock Supabase client ─────────────────────────────
function createMockSupabase(responses = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(responses.maybeSingle || { data: null, error: null }),
    single: vi.fn().mockResolvedValue(responses.single || { data: null, error: null }),
    order: vi.fn().mockReturnThis(),
  };
  return {
    from: vi.fn().mockReturnValue(chainable),
    _chainable: chainable,
  };
}

// ── Stage 19: Real Build Data ────────────────────────────────

describe('Stage 19 - Real Build Data Wiring', () => {
  let analyzeStage19;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/eva/stage-templates/analysis-steps/stage-19-build-execution.js');
    analyzeStage19 = mod.analyzeStage19;
  });

  test('uses real data when venture_stage_work has tasks', async () => {
    const mockTasks = [
      { name: 'Implement API', description: 'REST endpoints', assignee: 'dev', status: 'done', sprint_item_ref: 'API' },
      { name: 'Write tests', description: 'Unit tests', assignee: 'qa', status: 'in_progress', sprint_item_ref: 'Tests' },
      { name: 'Deploy', description: 'Staging deploy', assignee: 'ops', status: 'blocked', sprint_item_ref: 'Deploy' },
    ];

    const supabase = createMockSupabase({
      maybeSingle: {
        data: {
          advisory_data: { tasks: mockTasks, total_tasks: 3, completed_tasks: 1, blocked_tasks: 1, issues: [] },
          stage_status: 'in_progress',
          health_score: 60,
        },
        error: null,
      },
    });

    const result = await analyzeStage19({
      stage18Data: { sprint_goal: 'Test sprint', items: [] },
      ventureName: 'Test Venture',
      supabase,
      ventureId: 'test-uuid',
      logger,
    });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.tasks).toHaveLength(3);
    expect(result.completed_tasks).toBe(1);
    expect(result.blocked_tasks).toBe(1);
    expect(result.total_tasks).toBe(3);
    // Verify status mapping: 'done' stays 'done'
    expect(result.tasks[0].status).toBe('done');
    // 'in_progress' stays 'in_progress'
    expect(result.tasks[1].status).toBe('in_progress');
    // 'blocked' stays 'blocked'
    expect(result.tasks[2].status).toBe('blocked');
    expect(result.llmFallbackCount).toBe(0);
  });

  test('maps todo status to pending', async () => {
    const supabase = createMockSupabase({
      maybeSingle: {
        data: {
          advisory_data: { tasks: [{ name: 'Task', status: 'todo' }] },
        },
        error: null,
      },
    });

    const result = await analyzeStage19({
      stage18Data: { sprint_goal: 'Test', items: [] },
      supabase,
      ventureId: 'test-uuid',
      logger,
    });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.tasks[0].status).toBe('pending');
  });

  test('falls back to LLM when no venture_stage_work data', async () => {
    const supabase = createMockSupabase({
      maybeSingle: { data: null, error: null },
    });

    const result = await analyzeStage19({
      stage18Data: { sprint_goal: 'Test', items: [{ title: 'Item 1', type: 'feature', story_points: 3 }] },
      supabase,
      ventureId: 'test-uuid',
      logger,
    });

    // Should NOT have dataSource since it fell back to LLM
    expect(result.dataSource).toBeUndefined();
    expect(result.tasks).toBeDefined();
  });

  test('falls back to LLM when supabase not provided', async () => {
    const result = await analyzeStage19({
      stage18Data: { sprint_goal: 'Test', items: [{ title: 'Item 1' }] },
      logger,
    });

    expect(result.dataSource).toBeUndefined();
    expect(result.tasks).toBeDefined();
  });

  test('throws when stage18Data is missing', async () => {
    await expect(analyzeStage19({ logger }))
      .rejects.toThrow('Stage 19 build execution requires Stage 18');
  });
});

// ── Stage 20: Real QA Data ───────────────────────────────────

describe('Stage 20 - Real QA Data Wiring', () => {
  let analyzeStage20;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/eva/stage-templates/analysis-steps/stage-20-quality-assurance.js');
    analyzeStage20 = mod.analyzeStage20;
  });

  test('derives QA metrics from real SD completion data', async () => {
    const supabase = createMockSupabase({
      maybeSingle: {
        data: {
          advisory_data: {
            tasks: [
              { name: 'Task A', status: 'done' },
              { name: 'Task B', status: 'done' },
              { name: 'Task C', status: 'blocked' },
            ],
            total_tasks: 3,
            completed_tasks: 2,
            blocked_tasks: 1,
            issues: [{ description: 'Blocked by dep', severity: 'high', status: 'open' }],
          },
        },
        error: null,
      },
    });

    const stage19Data = { dataSource: 'venture_stage_work', tasks: [], completed_tasks: 2, total_tasks: 3 };

    const result = await analyzeStage20({
      stage19Data,
      supabase,
      ventureId: 'test-uuid',
      logger,
    });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.overall_pass_rate).toBeCloseTo(66.67, 1);
    expect(result.coverage_pct).toBe(100);
    expect(result.total_tests).toBe(3);
    expect(result.total_passing).toBe(2);
    expect(result.test_suites).toHaveLength(1);
    expect(result.test_suites[0].type).toBe('integration');
    expect(result.known_defects).toHaveLength(1);
    expect(result.qualityDecision.decision).toBe('fail'); // 66.67% < 85.5% (MIN_PASS_RATE * 0.9)
    expect(result.llmFallbackCount).toBe(0);
  });

  test('returns pass when all tasks completed', async () => {
    const supabase = createMockSupabase({
      maybeSingle: {
        data: {
          advisory_data: {
            tasks: [{ name: 'A', status: 'done' }, { name: 'B', status: 'done' }],
            total_tasks: 2,
            completed_tasks: 2,
            issues: [],
          },
        },
        error: null,
      },
    });

    const result = await analyzeStage20({
      stage19Data: { dataSource: 'venture_stage_work' },
      supabase,
      ventureId: 'test-uuid',
      logger,
    });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.overall_pass_rate).toBe(100);
    expect(result.qualityDecision.decision).toBe('pass');
    expect(result.quality_gate_passed).toBe(true);
  });

  test('skips real data when stage19 did not use real data', async () => {
    const supabase = createMockSupabase();

    const result = await analyzeStage20({
      stage19Data: { tasks: [{ name: 'T', status: 'done' }], completed_tasks: 1, total_tasks: 1 },
      supabase,
      ventureId: 'test-uuid',
      logger,
    });

    // Should NOT have dataSource (fell back to LLM)
    expect(result.dataSource).toBeUndefined();
  });

  test('throws when stage19Data is missing', async () => {
    await expect(analyzeStage20({ logger }))
      .rejects.toThrow('Stage 20 QA requires Stage 19');
  });
});

// ── Stage 21: Real Integration Data ──────────────────────────

describe('Stage 21 - Real Integration Data Wiring', () => {
  let analyzeStage21;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/eva/stage-templates/analysis-steps/stage-21-build-review.js');
    analyzeStage21 = mod.analyzeStage21;
  });

  test('derives integration data from real upstream stages', async () => {
    const stage19Data = {
      dataSource: 'venture_stage_work',
      tasks: [
        { name: 'API Endpoint', status: 'done', sprint_item_ref: 'US-001' },
        { name: 'Auth Module', status: 'done', sprint_item_ref: 'US-002' },
        { name: 'Deploy Script', status: 'blocked', sprint_item_ref: 'US-003', description: 'Missing creds' },
      ],
      completed_tasks: 2,
      total_tasks: 3,
    };

    const stage20Data = {
      dataSource: 'venture_stage_work',
      qualityDecision: { decision: 'conditional_pass' },
      overall_pass_rate: 66.67,
      coverage_pct: 100,
    };

    const result = await analyzeStage21({
      stage20Data,
      stage19Data,
      logger,
    });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.integrations).toHaveLength(3);
    expect(result.total_integrations).toBe(3);
    expect(result.passing_integrations).toBe(2);
    // 2 passing, 1 blocked → conditional (not reject since no critical failure)
    expect(result.reviewDecision.decision).toBe('conditional');
    expect(result.llmFallbackCount).toBe(0);
  });

  test('approves when all tasks done and QA passes', async () => {
    const stage19Data = {
      dataSource: 'venture_stage_work',
      tasks: [
        { name: 'Task A', status: 'done' },
        { name: 'Task B', status: 'done' },
      ],
    };
    const stage20Data = {
      dataSource: 'venture_stage_work',
      qualityDecision: { decision: 'pass' },
    };

    const result = await analyzeStage21({ stage20Data, stage19Data, logger });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.all_passing).toBe(true);
    expect(result.reviewDecision.decision).toBe('approve');
  });

  test('falls back to LLM when upstream not real data', async () => {
    const stage19Data = { tasks: [{ name: 'T', status: 'done' }] };
    const stage20Data = { qualityDecision: { decision: 'pass' }, overall_pass_rate: 100, coverage_pct: 80 };

    const result = await analyzeStage21({ stage20Data, stage19Data, logger });

    expect(result.dataSource).toBeUndefined();
  });

  test('throws when stage20Data is missing', async () => {
    await expect(analyzeStage21({ logger }))
      .rejects.toThrow('Stage 21 build review requires Stage 20');
  });
});

// ── Stage 22: Real Release Data ──────────────────────────────

describe('Stage 22 - Real Release Data Wiring', () => {
  let analyzeStage22;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../lib/eva/stage-templates/analysis-steps/stage-22-release-readiness.js');
    analyzeStage22 = mod.analyzeStage22;
  });

  test('derives release data from real upstream stages', async () => {
    const stage19Data = {
      dataSource: 'venture_stage_work',
      tasks: [
        { name: 'Feature A', status: 'done' },
        { name: 'Feature B', status: 'done' },
        { name: 'Feature C', status: 'blocked' },
      ],
      completed_tasks: 2,
      total_tasks: 3,
      blocked_tasks: 1,
    };
    const stage20Data = {
      dataSource: 'venture_stage_work',
      qualityDecision: { decision: 'conditional_pass' },
      overall_pass_rate: 66.67,
      coverage_pct: 100,
    };
    const stage21Data = {
      dataSource: 'venture_stage_work',
      reviewDecision: { decision: 'conditional' },
      passing_integrations: 2,
      total_integrations: 3,
    };

    const result = await analyzeStage22({
      stage17Data: null,
      stage18Data: { sprint_goal: 'Build sprint' },
      stage19Data,
      stage20Data,
      stage21Data,
      logger,
    });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.release_items.length).toBeGreaterThanOrEqual(1);
    expect(result.releaseDecision.decision).toBe('hold'); // conditional QA + conditional review
    expect(result.sprintSummary.itemsPlanned).toBe(3);
    expect(result.sprintSummary.itemsCompleted).toBe(2);
    expect(result.promotion_gate).toBeDefined();
    expect(result.llmFallbackCount).toBe(0);
  });

  test('releases when all pass', async () => {
    const stage19Data = {
      dataSource: 'venture_stage_work',
      tasks: [{ name: 'Done', status: 'done' }],
      completed_tasks: 1,
      total_tasks: 1,
      blocked_tasks: 0,
    };
    const stage20Data = {
      dataSource: 'venture_stage_work',
      qualityDecision: { decision: 'pass' },
      overall_pass_rate: 100,
      coverage_pct: 100,
    };
    const stage21Data = {
      dataSource: 'venture_stage_work',
      reviewDecision: { decision: 'approve' },
      passing_integrations: 1,
      total_integrations: 1,
    };

    const result = await analyzeStage22({
      stage17Data: null,
      stage18Data: { sprint_goal: 'Sprint' },
      stage19Data,
      stage20Data,
      stage21Data,
      logger,
    });

    expect(result.dataSource).toBe('venture_stage_work');
    expect(result.releaseDecision.decision).toBe('release');
    expect(result.all_approved).toBe(true);
  });

  test('falls back to LLM when upstream not all real', async () => {
    const stage19Data = { dataSource: 'venture_stage_work', tasks: [], completed_tasks: 0, total_tasks: 0 };
    const stage20Data = { qualityDecision: { decision: 'pass' }, overall_pass_rate: 100, coverage_pct: 80 };
    const stage21Data = {
      reviewDecision: { decision: 'approve' },
      passing_integrations: 1,
      total_integrations: 1,
    };

    const result = await analyzeStage22({
      stage17Data: null,
      stage18Data: { sprint_goal: 'Test' },
      stage19Data,
      stage20Data,
      stage21Data,
      logger,
    });

    // stage20Data has no dataSource → falls back to LLM
    expect(result.dataSource).toBeUndefined();
  });

  test('throws when required stage data missing', async () => {
    await expect(analyzeStage22({ logger }))
      .rejects.toThrow('Stage 22 release readiness requires Stage 20');
  });
});
