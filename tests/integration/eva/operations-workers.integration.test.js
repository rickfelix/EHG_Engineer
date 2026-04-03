/**
 * Integration Tests — EVA Operations Workers
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 *
 * Tests the actual domain handler registration and handler invocation
 * with a stateful mock Supabase client, without hitting the real DB
 * or making any external LLM/Stripe calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks (must be hoisted before imports) ───────────────────────────

// Mock financial contract module — used inside ops_financial_sync handler
vi.mock('../../../lib/eva/contracts/financial-contract.js', () => ({
  validateConsistency: vi.fn().mockResolvedValue({ valid: true }),
  getContract: vi.fn().mockResolvedValue({ id: 'fc-001', venture_id: 'v-001' }),
}));

// Mock feedback classifier — used inside ops_feedback_classify handler
vi.mock('../../../lib/eva/feedback-dimension-classifier.js', () => ({
  classifyFeedback: vi.fn().mockResolvedValue({
    dimensionCode: 'DIM-PRODUCT',
    confidence: 0.92,
  }),
}));

// Mock hub-health-monitor — used inside ops_health_score handler and index.js
vi.mock('../../../lib/eva/hub-health-monitor.js', () => ({
  getSystemHealth: vi.fn().mockReturnValue({
    status: 'healthy',
    overall: 'healthy',
    services: [{ name: 'test-svc', status: 'healthy' }],
    healthy: 1,
    degraded: 0,
    unhealthy: 0,
    lastCheck: new Date().toISOString(),
  }),
  sweepStaleServices: vi.fn().mockReturnValue([]),
  checkServiceHealth: vi.fn(),
  checkAllServices: vi.fn(),
  clearHealthState: vi.fn(),
  HEALTH_STATUS: {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    UNKNOWN: 'unknown',
  },
}));

// Mock retrospective signals — used inside ops_enhancement_detect handler
vi.mock('../../../lib/retrospective-signals/index.js', () => ({
  captureSignals: vi.fn().mockResolvedValue([
    { signal: 'improve-docs', source: 'retro-001' },
  ]),
}));

// ─── Stateful Mock Supabase ────────────────────────────────────────────────────

/**
 * Creates a stateful mock Supabase that returns predictable data for each table
 * while recording all insert/update calls for assertion.
 */
function createStatefulMockSupabase(overrides = {}) {
  const state = {
    inserts: [],
    updates: [],
  };

  const tableData = {
    eva_ventures: [
      { id: 'v-001', status: 'active' },
      { id: 'v-002', status: 'in_progress' },
    ],
    feedback_items: [
      { id: 'fi-001', title: 'Improve onboarding', description: 'UX feels clunky', dimension_code: null },
      { id: 'fi-002', title: 'Add export feature', description: 'CSV export needed', dimension_code: null },
    ],
    eva_stage_gate_results: [],
    eva_scheduler_metrics: [],
    eva_scheduler_heartbeat: [
      { instance_id: 'sched-1', last_heartbeat: new Date().toISOString(), status: 'active' },
    ],
    eva_scheduler_queue: [],
    retrospectives: [
      {
        id: 'retro-001',
        what_went_well: 'Good team communication and fast iteration',
        what_needs_improvement: 'Documentation was lacking and onboarding is slow',
        key_learnings: 'Need better runbooks for new engineers',
      },
    ],
    venture_financial_contract: [
      { venture_id: 'v-001', updated_at: new Date().toISOString() },
    ],
    protocol_improvement_queue: [
      { id: 'piq-001', status: 'pending' },
    ],
    ...overrides,
  };

  function makeChain(tableName) {
    let _resolvedValue = { data: tableData[tableName] || [], error: null, count: (tableData[tableName] || []).length };

    const chain = {
      select: vi.fn().mockImplementation((fields, opts) => {
        // head: true with count means return count only
        if (opts?.head && opts?.count === 'exact') {
          _resolvedValue = {
            data: null,
            error: null,
            count: (tableData[tableName] || []).length,
          };
        }
        return chain;
      }),
      insert: vi.fn().mockImplementation((row) => {
        state.inserts.push({ table: tableName, row });
        _resolvedValue = { data: row, error: null };
        return chain;
      }),
      update: vi.fn().mockImplementation((updates) => {
        state.updates.push({ table: tableName, updates });
        _resolvedValue = { data: null, error: null };
        return chain;
      }),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => Promise.resolve(_resolvedValue)),
      single: vi.fn().mockImplementation(() =>
        Promise.resolve({ data: (tableData[tableName] || [])[0] || null, error: null })
      ),
      // Make the chain itself thenable so `await supabase.from(t).select(...).insert(...)` works
      then: vi.fn().mockImplementation((resolve) => resolve(_resolvedValue)),
    };
    return chain;
  }

  const supabase = {
    _state: state,
    from: vi.fn((tableName) => makeChain(tableName)),
  };

  return supabase;
}

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
};

// ─── registerOperationsHandlers ───────────────────────────────────────────────

describe('registerOperationsHandlers', () => {
  it('registers exactly 6 handlers in the domain registry', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );

    const registered = {};
    const mockRegistry = {
      register: vi.fn((name, handler) => {
        registered[name] = handler;
      }),
    };

    registerOperationsHandlers(mockRegistry);

    expect(mockRegistry.register).toHaveBeenCalledTimes(6);
    expect(registered).toHaveProperty('ops_financial_sync');
    expect(registered).toHaveProperty('ops_feedback_classify');
    expect(registered).toHaveProperty('ops_metrics_collect');
    expect(registered).toHaveProperty('ops_health_score');
    expect(registered).toHaveProperty('ops_enhancement_detect');
    expect(registered).toHaveProperty('ops_status_snapshot');
  }, 120000);
});

// ─── Handler invocation tests ─────────────────────────────────────────────────

describe('ops_financial_sync handler', () => {
  it('returns checked count and timestamp', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    const result = await handlers.ops_financial_sync({ supabase, logger: silentLogger });

    expect(result).toHaveProperty('checked');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.checked).toBe('number');
    expect(typeof result.timestamp).toBe('string');
  }, 120000);

  it('queries active/in_progress ventures', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    await handlers.ops_financial_sync({ supabase, logger: silentLogger });

    expect(supabase.from).toHaveBeenCalledWith('eva_ventures');
  }, 120000);
});

describe('ops_feedback_classify handler', () => {
  it('returns classified count, total count, and timestamp', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    const result = await handlers.ops_feedback_classify({ supabase, logger: silentLogger });

    expect(result).toHaveProperty('classified');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.classified).toBe('number');
    expect(typeof result.total).toBe('number');
  }, 120000);

  it('returns skipped status since feedback_items table is unavailable', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    const result = await handlers.ops_feedback_classify({ supabase, logger: silentLogger });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('table_not_available');
  }, 120000);
});

describe('ops_metrics_collect handler', () => {
  it('returns a snapshot with metric_type ops_pipeline_throughput', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    const result = await handlers.ops_metrics_collect({ supabase, logger: silentLogger });

    expect(result).toHaveProperty('metric_type', 'ops_pipeline_throughput');
    expect(result).toHaveProperty('metric_value');
    expect(result).toHaveProperty('created_at');
  }, 120000);

  it('queries eva_ventures and eva_stage_gate_results', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    await handlers.ops_metrics_collect({ supabase, logger: silentLogger });

    const calledTables = supabase.from.mock.calls.map(([t]) => t);
    expect(calledTables).toContain('eva_ventures');
    expect(calledTables).toContain('eva_stage_gate_results');
  }, 120000);

  it('inserts snapshot into eva_scheduler_metrics', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    await handlers.ops_metrics_collect({ supabase, logger: silentLogger });

    const calledTables = supabase.from.mock.calls.map(([t]) => t);
    expect(calledTables).toContain('eva_scheduler_metrics');
  }, 120000);
});

describe('ops_health_score handler', () => {
  it('calls sweepStaleServices and getSystemHealth', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const { sweepStaleServices, getSystemHealth } = await import(
      '../../../lib/eva/hub-health-monitor.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    await handlers.ops_health_score({ supabase, logger: silentLogger });

    expect(sweepStaleServices).toHaveBeenCalled();
    expect(getSystemHealth).toHaveBeenCalled();
  }, 120000);

  it('returns health object with timestamp', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    const result = await handlers.ops_health_score({ supabase, logger: silentLogger });

    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('status', 'healthy');
  }, 120000);
});

describe('ops_enhancement_detect handler', () => {
  it('returns scanned count, detected count, and timestamp', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    const result = await handlers.ops_enhancement_detect({ supabase, logger: silentLogger });

    expect(result).toHaveProperty('scanned');
    expect(result).toHaveProperty('detected');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.scanned).toBe('number');
    expect(typeof result.detected).toBe('number');
  }, 120000);

  it('queries retrospectives table', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    await handlers.ops_enhancement_detect({ supabase, logger: silentLogger });

    expect(supabase.from).toHaveBeenCalledWith('retrospectives');
  }, 120000);
});

describe('ops_status_snapshot handler', () => {
  it('returns a status snapshot with overall field', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    const result = await handlers.ops_status_snapshot({ supabase, logger: silentLogger });

    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('subsystems');
  }, 120000);

  it('inserts snapshot into eva_scheduler_metrics', async () => {
    const { registerOperationsHandlers } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );
    const supabase = createStatefulMockSupabase();

    const handlers = {};
    registerOperationsHandlers({ register: (n, h) => (handlers[n] = h) });

    await handlers.ops_status_snapshot({ supabase, logger: silentLogger });

    const calledTables = supabase.from.mock.calls.map(([t]) => t);
    expect(calledTables).toContain('eva_scheduler_metrics');
  }, 120000);
});

// ─── getOperationsStatus ──────────────────────────────────────────────────────

describe('getOperationsStatus', () => {
  it('returns correct structure with all 6 subsystem keys', async () => {
    const { getOperationsStatus } = await import(
      '../../../lib/eva/operations/index.js'
    );
    const supabase = createStatefulMockSupabase();

    const status = await getOperationsStatus({ supabase, logger: silentLogger });

    expect(status).toHaveProperty('timestamp');
    expect(status).toHaveProperty('overall');
    expect(status).toHaveProperty('subsystems');

    const { subsystems } = status;
    expect(subsystems).toHaveProperty('health');
    expect(subsystems).toHaveProperty('metrics');
    expect(subsystems).toHaveProperty('feedback');
    expect(subsystems).toHaveProperty('enhancements');
    expect(subsystems).toHaveProperty('financial');
    expect(subsystems).toHaveProperty('scheduler');
  }, 120000);

  it('each subsystem has a status field', async () => {
    const { getOperationsStatus } = await import(
      '../../../lib/eva/operations/index.js'
    );
    const supabase = createStatefulMockSupabase();

    const status = await getOperationsStatus({ supabase, logger: silentLogger });

    for (const [key, sub] of Object.entries(status.subsystems)) {
      expect(sub, `subsystem "${key}" missing status field`).toHaveProperty('status');
    }
  }, 120000);

  it('returns no-client status for db-dependent subsystems when supabase is absent', async () => {
    const { getOperationsStatus } = await import(
      '../../../lib/eva/operations/index.js'
    );

    const status = await getOperationsStatus({ logger: silentLogger });

    expect(status.subsystems.metrics.status).toBe('no-client');
    expect(status.subsystems.feedback.status).toBe('no-client');
    expect(status.subsystems.financial.status).toBe('no-client');
    expect(status.subsystems.enhancements.status).toBe('no-client');
    expect(status.subsystems.scheduler.status).toBe('no-client');
  }, 120000);

  it('derives overall as unknown when subsystems have mixed non-active statuses', async () => {
    const { getOperationsStatus } = await import(
      '../../../lib/eva/operations/index.js'
    );
    // No supabase → db subsystems return 'no-client'
    const status = await getOperationsStatus({ logger: silentLogger });

    // With no-client status for most subsystems, overall should be 'unknown'
    expect(['unknown', 'degraded']).toContain(status.overall);
  }, 120000);

  it('does not throw when a subsystem throws internally', async () => {
    const { getOperationsStatus } = await import(
      '../../../lib/eva/operations/index.js'
    );
    const supabase = {
      from: vi.fn(() => {
        throw new Error('DB exploded');
      }),
    };

    await expect(getOperationsStatus({ supabase, logger: silentLogger })).resolves.toBeDefined();
  }, 120000);
});

// ─── OPERATIONS_CADENCES export ───────────────────────────────────────────────

describe('OPERATIONS_CADENCES', () => {
  it('exports cadence config for all 6 operations workers', async () => {
    const { OPERATIONS_CADENCES } = await import(
      '../../../lib/eva/operations/domain-handler.js'
    );

    expect(OPERATIONS_CADENCES).toHaveProperty('ops_financial_sync', 'hourly');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_feedback_classify', 'frequent');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_metrics_collect', 'six_hourly');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_health_score', 'hourly');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_enhancement_detect', 'daily');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_status_snapshot', 'hourly');
  }, 120000);
});
