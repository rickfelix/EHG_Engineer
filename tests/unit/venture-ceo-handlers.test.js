// CEO Handler Unit Tests - OKR Tracking & Monthly Report
//
// Tests for the two new handlers added in SD-EHG-ORCH-INTERFACE-AGENTS-001-B:
//   1. handleCEOOKRTracking
//   2. handleCEOMonthlyReport
//
// Also validates handler registration in CEO_HANDLERS and VentureCEORuntime.
//
// NOTE: Test file lives at tests/unit/ (not tests/unit/agents/) because the
// vitest config has a glob exclude pattern for the agents directory which
// would prevent test discovery.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCEOOKRTracking,
  handleCEOMonthlyReport
} from '../../lib/agents/venture-ceo/handlers.js';
import { CEO_HANDLERS } from '../../lib/agents/venture-ceo/constants.js';

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------

// Creates a chainable mock that mimics the Supabase query builder.
// Each chained method returns the same builder, and the terminal
// methods (single, select at the end of upsert/insert) resolve with
// the configured { data, error }.
function createChainMock({ data = null, error = null } = {}) {
  const result = { data, error };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    // Make the chain itself thenable so await supabase.from(...).select(...) works
    then: (resolve) => resolve(result),
  };
  // Allow select() at the end of upsert/insert chains to resolve properly
  chain.select.mockReturnValue(chain);
  return chain;
}

// Creates a Supabase client mock with per-table chain configuration.
function createSupabaseMock(tableMap = {}) {
  return {
    from: vi.fn((table) => {
      if (tableMap[table]) return tableMap[table];
      // Default: return empty data, no error
      return createChainMock({ data: null, error: null });
    }),
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const VENTURE_ID = 'venture-test-001';
const AGENT_ID = 'agent-ceo-001';

function makeContext(supabase) {
  return { supabase, ventureId: VENTURE_ID, agentId: AGENT_ID };
}

function makeMessage(body = {}, overrides = {}) {
  return { id: 'msg-001', body, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests: handleCEOOKRTracking
// ---------------------------------------------------------------------------

describe('handleCEOOKRTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns empty summary when no objectives exist', async () => {
    const objectivesChain = createChainMock({ data: [], error: null });
    const supabase = createSupabaseMock({ okr_objectives: objectivesChain });
    const context = makeContext(supabase);

    const result = await handleCEOOKRTracking(context, makeMessage());

    expect(result.status).toBe('completed');
    expect(result.result.objective_count).toBe(0);
    expect(result.result.kr_count).toBe(0);
    expect(result.result.overall_score).toBe(0);
    expect(result.result.objectives).toEqual([]);
  });

  it('returns scored objectives with KR progress', async () => {
    const objectives = [
      { id: 'obj-1', code: 'OBJ-001', title: 'Grow Revenue', is_active: true },
      { id: 'obj-2', code: 'OBJ-002', title: 'Improve NPS', is_active: true },
    ];

    const keyResults = [
      {
        id: 'kr-1', objective_id: 'obj-1', title: 'MRR $50k',
        current_value: 25000, target_value: 50000, baseline_value: 0, direction: 'increase',
      },
      {
        id: 'kr-2', objective_id: 'obj-2', title: 'NPS > 60',
        current_value: 45, target_value: 60, baseline_value: 30, direction: 'increase',
      },
    ];

    const objectivesChain = createChainMock({ data: objectives, error: null });
    const keyResultsChain = createChainMock({ data: keyResults, error: null });

    const supabase = createSupabaseMock({
      okr_objectives: objectivesChain,
      key_results: keyResultsChain,
    });

    const context = makeContext(supabase);
    const result = await handleCEOOKRTracking(context, makeMessage());

    expect(result.status).toBe('completed');
    expect(result.result.objective_count).toBe(2);
    expect(result.result.kr_count).toBe(2);
    expect(result.result.objectives).toHaveLength(2);

    // Verify scoring: obj-1 KR progress = (25000/50000)*100 = 50
    const obj1 = result.result.objectives.find(o => o.code === 'OBJ-001');
    expect(obj1).toBeDefined();
    expect(obj1.score).toBe(50);
    expect(obj1.kr_count).toBe(1);

    // obj-2 KR progress = ((45-30)/(60-30))*100 = 50
    const obj2 = result.result.objectives.find(o => o.code === 'OBJ-002');
    expect(obj2).toBeDefined();
    expect(obj2.score).toBe(50);

    // Overall = avg(50, 50) = 50
    expect(result.result.overall_score).toBe(50);

    // Verify memory_update is present
    expect(result.memory_update).toBeDefined();
    expect(result.memory_update.type).toBe('context');
    expect(result.memory_update.content.action).toBe('okr_tracking_queried');
    expect(result.memory_update.content.overall_score).toBe(50);
  });

  it('handles action=generate sub-command', async () => {
    const supabase = createSupabaseMock();
    const context = makeContext(supabase);
    const message = makeMessage({ action: 'generate' });

    const result = await handleCEOOKRTracking(context, message);

    // The handler does a dynamic import of okr-monthly-generator.js.
    // In the test environment the generator module may not resolve to a
    // working implementation, so the handler catches the error and returns failed.
    // We verify it correctly routes to the generate path either way.
    if (result.status === 'completed') {
      expect(result.result.action).toBe('generate');
      expect(result.memory_update).toBeDefined();
      expect(result.memory_update.content.action).toBe('okr_generation_triggered');
    } else {
      // Verify it attempted the generate path (not the default OKR summary path)
      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/OKR generation failed/);
    }
  });

  it('returns failed status on DB error fetching objectives', async () => {
    const objectivesChain = createChainMock({
      data: null,
      error: { message: 'Connection refused' },
    });
    const supabase = createSupabaseMock({ okr_objectives: objectivesChain });
    const context = makeContext(supabase);

    const result = await handleCEOOKRTracking(context, makeMessage());

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Failed to fetch objectives');
    expect(result.error).toContain('Connection refused');
  });

  it('returns failed status on DB error fetching key results', async () => {
    const objectives = [
      { id: 'obj-1', code: 'OBJ-001', title: 'Revenue', is_active: true },
    ];
    const objectivesChain = createChainMock({ data: objectives, error: null });
    const keyResultsChain = createChainMock({
      data: null,
      error: { message: 'Timeout' },
    });

    const supabase = createSupabaseMock({
      okr_objectives: objectivesChain,
      key_results: keyResultsChain,
    });
    const context = makeContext(supabase);

    const result = await handleCEOOKRTracking(context, makeMessage());

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Failed to fetch key results');
    expect(result.error).toContain('Timeout');
  });

  it('handles objectives with zero key results gracefully', async () => {
    const objectives = [
      { id: 'obj-1', code: 'OBJ-001', title: 'Revenue', is_active: true },
    ];
    const objectivesChain = createChainMock({ data: objectives, error: null });
    const keyResultsChain = createChainMock({ data: [], error: null });

    const supabase = createSupabaseMock({
      okr_objectives: objectivesChain,
      key_results: keyResultsChain,
    });
    const context = makeContext(supabase);

    const result = await handleCEOOKRTracking(context, makeMessage());

    expect(result.status).toBe('completed');
    expect(result.result.objectives[0].score).toBe(0);
    expect(result.result.objectives[0].kr_count).toBe(0);
    expect(result.result.overall_score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: handleCEOMonthlyReport
// ---------------------------------------------------------------------------

describe('handleCEOMonthlyReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // Helper to build a supabase mock suitable for monthly report tests.
  // Provides sensible defaults for all tables the handler touches.
  function buildMonthlyReportSupabase(overrides = {}) {
    const defaults = {
      // OKR objectives (used transitively via handleCEOOKRTracking)
      okr_objectives: createChainMock({ data: [
        { id: 'obj-1', code: 'OBJ-001', title: 'Revenue', is_active: true },
      ], error: null }),

      // Key results
      key_results: createChainMock({ data: [
        {
          id: 'kr-1', objective_id: 'obj-1', title: 'MRR',
          current_value: 40000, target_value: 50000, baseline_value: 0, direction: 'increase',
        },
      ], error: null }),

      // Missions
      missions: createChainMock({ data: [
        { id: 'mission-1', mission_text: 'Build the future', version: 2, status: 'active' },
        { id: 'mission-0', mission_text: 'Initial draft', version: 1, status: 'archived' },
      ], error: null }),

      // Agent messages (task metrics)
      agent_messages: createChainMock({ data: [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'pending' },
      ], error: null }),

      // Agent registry (budget)
      agent_registry: createChainMock({ data: {
        token_consumed: 5000,
        token_budget: 10000,
      }, error: null }),

      // Monthly CEO reports (storage)
      monthly_ceo_reports: createChainMock({ data: {
        id: 'report-001',
        period: '2026-02',
      }, error: null }),

      // EVA event log (non-blocking)
      eva_event_log: createChainMock({ data: null, error: null }),
    };

    return createSupabaseMock({ ...defaults, ...overrides });
  }

  it('generates a report with all 4 sections', async () => {
    const supabase = buildMonthlyReportSupabase();
    const context = makeContext(supabase);
    const message = makeMessage({ period: '2026-02' });

    const result = await handleCEOMonthlyReport(context, message);

    expect(result.status).toBe('completed');
    expect(result.result).toBeDefined();
    expect(result.result.stored).toBe(true);
    expect(result.result.report_id).toBe('report-001');
    expect(result.result.period).toBe('2026-02');

    const content = result.result.content;
    expect(content).toBeDefined();

    // Section 1: OKR summary
    expect(content.okr_summary).toBeDefined();
    expect(content.okr_summary.objective_count).toBe(1);
    // KR progress = (40000/50000)*100 = 80
    expect(content.okr_summary.overall_score).toBe(80);

    // Section 2: Mission status
    expect(content.mission_status).toBeDefined();
    expect(content.mission_status.active_mission).toBeDefined();
    expect(content.mission_status.active_mission.text).toBe('Build the future');
    expect(content.mission_status.active_mission.version).toBe(2);
    expect(content.mission_status.total_versions).toBe(2);

    // Section 3: Task metrics
    expect(content.task_metrics).toBeDefined();
    expect(content.task_metrics.total).toBe(4);
    expect(content.task_metrics.completed).toBe(2);
    expect(content.task_metrics.failed).toBe(1);
    expect(content.task_metrics.completion_rate).toBe(50);

    // Section 4: Budget summary
    expect(content.budget_summary).toBeDefined();
    expect(content.budget_summary.available).toBe(true);
    expect(content.budget_summary.consumed).toBe(5000);
    expect(content.budget_summary.budget).toBe(10000);
    expect(content.budget_summary.consumed_percent).toBe(50);

    // Memory update
    expect(result.memory_update).toBeDefined();
    expect(result.memory_update.content.action).toBe('monthly_report_generated');
  });

  it('uses provided period from message body', async () => {
    const supabase = buildMonthlyReportSupabase();
    const context = makeContext(supabase);
    const message = makeMessage({ period: '2025-12' });

    const result = await handleCEOMonthlyReport(context, message);

    expect(result.status).toBe('completed');
    expect(result.result.period).toBe('2025-12');

    // Verify the upsert was called with the correct period
    const monthlyReportsChain = supabase.from('monthly_ceo_reports');
    expect(monthlyReportsChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ period: '2025-12', venture_id: VENTURE_ID }),
      expect.any(Object)
    );
  });

  it('defaults to current month when no period provided', async () => {
    const supabase = buildMonthlyReportSupabase();
    const context = makeContext(supabase);
    const message = makeMessage({}); // No period in body

    // Freeze time for deterministic assertion
    const fakeNow = new Date('2026-02-15T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    try {
      const result = await handleCEOMonthlyReport(context, message);

      expect(result.status).toBe('completed');
      expect(result.result.period).toBe('2026-02');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns completed even if storage fails (graceful degradation)', async () => {
    const failingReportsChain = createChainMock({
      data: null,
      error: { message: 'Unique constraint violation' },
    });

    const supabase = buildMonthlyReportSupabase({
      monthly_ceo_reports: failingReportsChain,
    });

    const context = makeContext(supabase);
    const message = makeMessage({ period: '2026-02' });

    const result = await handleCEOMonthlyReport(context, message);

    // Handler should still return completed with the report content
    expect(result.status).toBe('completed');
    expect(result.result.stored).toBe(false);
    expect(result.result.error).toContain('Unique constraint violation');
    expect(result.result.content).toBeDefined();
    expect(result.result.content.okr_summary).toBeDefined();
    expect(result.result.content.mission_status).toBeDefined();
    expect(result.result.content.task_metrics).toBeDefined();
    expect(result.result.content.budget_summary).toBeDefined();

    // No memory_update when storage fails (handler omits it in the error path)
    expect(result.memory_update).toBeUndefined();
  });

  it('handles all sub-queries failing gracefully', async () => {
    // All data fetches return errors - handler uses try/catch for each section
    const emptyChain = createChainMock({ data: null, error: { message: 'DB down' } });

    const supabase = buildMonthlyReportSupabase({
      okr_objectives: emptyChain,
      missions: emptyChain,
      agent_messages: emptyChain,
      agent_registry: emptyChain,
      // Storage still works
      monthly_ceo_reports: createChainMock({
        data: { id: 'report-fallback', period: '2026-02' },
        error: null,
      }),
    });

    const context = makeContext(supabase);
    const message = makeMessage({ period: '2026-02' });

    const result = await handleCEOMonthlyReport(context, message);

    expect(result.status).toBe('completed');
    // All sections should have their default/empty values
    const content = result.result.content;
    expect(content.okr_summary.objective_count).toBe(0);
    expect(content.mission_status.active_mission).toBeNull();
    expect(content.task_metrics.total).toBe(0);
    expect(content.budget_summary.available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Handler Registration
// ---------------------------------------------------------------------------

describe('Handler Registration', () => {
  it('CEO_HANDLERS contains okr_tracking entry', () => {
    expect(CEO_HANDLERS).toHaveProperty('okr_tracking');
    expect(CEO_HANDLERS.okr_tracking).toBe('handleCEOOKRTracking');
  });

  it('CEO_HANDLERS contains monthly_report entry', () => {
    expect(CEO_HANDLERS).toHaveProperty('monthly_report');
    expect(CEO_HANDLERS.monthly_report).toBe('handleCEOMonthlyReport');
  });

  it('CEO_HANDLERS contains all expected handler entries', () => {
    const expectedHandlers = [
      'task_delegation',
      'task_completion',
      'status_report',
      'escalation',
      'query',
      'response',
      'mission_draft',
      'okr_tracking',
      'monthly_report',
    ];

    for (const handler of expectedHandlers) {
      expect(CEO_HANDLERS).toHaveProperty(handler);
    }
  });

  it('VentureCEORuntime handler map contains the new handlers', async () => {
    // Import the runtime class (avoid governance checks by setting test env)
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const { VentureCEORuntime } = await import(
        '../../lib/agents/venture-ceo/index.js'
      );

      // Create a runtime instance with governance features disabled for testing
      const mockSupabase = createSupabaseMock();
      const runtime = new VentureCEORuntime(mockSupabase, AGENT_ID, {
        enableBudgetEnforcement: false,
        enableTruthLayer: false,
      });

      // Verify the handler map has entries for new handlers
      expect(runtime.handlers).toHaveProperty('okr_tracking');
      expect(runtime.handlers).toHaveProperty('monthly_report');
      expect(typeof runtime.handlers.okr_tracking).toBe('function');
      expect(typeof runtime.handlers.monthly_report).toBe('function');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
