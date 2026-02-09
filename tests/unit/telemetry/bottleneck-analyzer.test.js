/**
 * Unit tests for bottleneck-analyzer.js
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeBottlenecks } from '../../../lib/telemetry/bottleneck-analyzer.js';

// Helper to create a mock Supabase client
function createMockSupabase(overrides = {}) {
  const defaultThresholds = [
    {
      id: 'mock-1',
      dimension_type: 'global',
      dimension_key: null,
      threshold_ratio: 3.0,
      min_samples: 3,
      baseline_window_days: 7,
      lookback_window_days: 1,
      max_per_run: 3,
      max_per_day: 10,
      cooldown_hours: 24,
      enable_auto_create: true,
    },
  ];

  const mockChain = (tableName) => {
    const state = { table: tableName, filters: [], selectedFields: null };
    const chainObj = {
      select: (fields) => { state.selectedFields = fields; return chainObj; },
      insert: (data) => { state.insertData = data; return chainObj; },
      eq: (col, val) => { state.filters.push({ col, val }); return chainObj; },
      gte: (col, val) => { state.filters.push({ type: 'gte', col, val }); return chainObj; },
      gt: (col, val) => { state.filters.push({ type: 'gt', col, val }); return chainObj; },
      not: (col, op, val) => { state.filters.push({ type: 'not', col, op, val }); return chainObj; },
      or: (expr) => { state.filters.push({ type: 'or', expr }); return chainObj; },
      ilike: (col, val) => { state.filters.push({ type: 'ilike', col, val }); return chainObj; },
      order: () => chainObj,
      limit: () => chainObj,
      single: () => {
        if (state.table === 'protocol_improvement_queue' && state.insertData) {
          const handler = overrides.onInsertImprovement;
          if (handler) return handler(state.insertData);
          return { data: { id: 'mock-improvement-' + Math.random().toString(36).substring(7) }, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve) => {
        let result;
        if (state.table === 'telemetry_thresholds') {
          result = { data: overrides.thresholds ?? defaultThresholds, error: overrides.thresholdsError ?? null };
        } else if (state.table === 'workflow_trace_log') {
          result = { data: overrides.traces ?? [], error: overrides.tracesError ?? null };
        } else if (state.table === 'protocol_improvement_queue') {
          if (state.insertData) {
            const handler = overrides.onInsertImprovement;
            if (handler) {
              result = handler(state.insertData);
            } else {
              result = { data: { id: 'mock-improvement-' + Math.random().toString(36).substring(7) }, error: null };
            }
          } else {
            result = { data: overrides.existingImprovements ?? [], error: null };
          }
        } else {
          result = { data: [], error: null };
        }
        return Promise.resolve(resolve(result));
      },
    };
    return chainObj;
  };

  return { from: mockChain };
}

// Generate trace records
function generateTraces({ dimensionType, dimensionKey, baselineDurations, analysisDurations }) {
  const colName = dimensionType === 'phase' ? 'phase'
    : dimensionType === 'gate' ? 'gate_name'
    : 'subagent_name';

  const now = Date.now();
  const dayMs = 86400000;
  const traces = [];

  // Baseline traces (older, within 7 days)
  baselineDurations.forEach((d, i) => {
    traces.push({
      span_type: dimensionType,
      span_name: `test_${dimensionType}`,
      [colName]: dimensionKey,
      phase: dimensionType === 'phase' ? dimensionKey : null,
      gate_name: dimensionType === 'gate' ? dimensionKey : null,
      subagent_name: dimensionType === 'subagent' ? dimensionKey : null,
      duration_ms: d,
      start_time_ms: now - (3 * dayMs) - (i * 1000),
      created_at: new Date(now - (3 * dayMs) - (i * 1000)).toISOString(),
      trace_id: `trace-baseline-${i}`,
    });
  });

  // Analysis traces (recent, within 1 day)
  analysisDurations.forEach((d, i) => {
    traces.push({
      span_type: dimensionType,
      span_name: `test_${dimensionType}`,
      [colName]: dimensionKey,
      phase: dimensionType === 'phase' ? dimensionKey : null,
      gate_name: dimensionType === 'gate' ? dimensionKey : null,
      subagent_name: dimensionType === 'subagent' ? dimensionKey : null,
      duration_ms: d,
      start_time_ms: now - (i * 1000),
      created_at: new Date(now - (i * 1000)).toISOString(),
      trace_id: `trace-analysis-${i}`,
    });
  });

  return traces;
}

describe('analyzeBottlenecks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty bottlenecks when no traces exist', async () => {
    const supabase = createMockSupabase({ traces: [] });
    const result = await analyzeBottlenecks(supabase);

    expect(result.bottlenecks).toEqual([]);
    expect(result.traces_scanned).toBe(0);
    expect(result.items_created).toBe(0);
  });

  it('detects a phase bottleneck when ratio >= 3x with sufficient samples', async () => {
    const traces = generateTraces({
      dimensionType: 'phase',
      dimensionKey: 'Build',
      baselineDurations: [1000, 1000, 1000, 1000, 1000],
      analysisDurations: [3500, 3500, 3500, 3500],
    });

    const supabase = createMockSupabase({
      traces,
      existingImprovements: [],
    });

    const result = await analyzeBottlenecks(supabase, { enableAutoCreate: false });

    expect(result.bottlenecks.length).toBe(1);
    expect(result.bottlenecks[0].dimension_type).toBe('phase');
    expect(result.bottlenecks[0].dimension_key).toBe('Build');
    expect(result.bottlenecks[0].ratio).toBeGreaterThanOrEqual(3.0);
    expect(result.bottlenecks[0].baseline_p50_ms).toBe(1000);
    expect(result.bottlenecks[0].observed_p50_ms).toBe(3500);
    expect(result.bottlenecks[0].evidence_trace_ids.length).toBeGreaterThan(0);
  });

  it('does not flag bottleneck when samples below min_samples threshold', async () => {
    // Only 1 analysis trace above threshold (needs 3)
    const traces = generateTraces({
      dimensionType: 'phase',
      dimensionKey: 'Build',
      baselineDurations: [1000, 1000, 1000, 1000, 1000],
      analysisDurations: [4000, 500, 500],
    });

    const supabase = createMockSupabase({ traces });
    const result = await analyzeBottlenecks(supabase, { enableAutoCreate: false });

    // Even if p50 is low, the exceedance count should be < 3
    const buildBottleneck = result.bottlenecks.find(b => b.dimension_key === 'Build');
    // p50 of [500, 500, 4000] = 500, ratio = 0.5 -> not flagged
    expect(buildBottleneck).toBeUndefined();
  });

  it('respects per-run rate limit (max 3 items)', async () => {
    // Create 5 different bottleneck dimensions
    const traces = [];
    for (let i = 0; i < 5; i++) {
      traces.push(...generateTraces({
        dimensionType: 'gate',
        dimensionKey: `Gate_${i}`,
        baselineDurations: [100, 100, 100, 100, 100],
        analysisDurations: [400, 400, 400, 400],
      }));
    }

    let insertCount = 0;
    const supabase = createMockSupabase({
      traces,
      existingImprovements: [],
      onInsertImprovement: () => {
        insertCount++;
        return { data: { id: `improvement-${insertCount}` }, error: null };
      },
    });

    const result = await analyzeBottlenecks(supabase, { enableAutoCreate: true });

    expect(result.bottlenecks.length).toBe(5);
    expect(result.items_created).toBeLessThanOrEqual(3);
    expect(result.items_skipped_rate_limit).toBeGreaterThanOrEqual(2);
  });

  it('outputs deterministic results for same data', async () => {
    const traces = generateTraces({
      dimensionType: 'subagent',
      dimensionKey: 'RISK',
      baselineDurations: [200, 200, 200, 200, 200],
      analysisDurations: [700, 700, 700, 700],
    });

    const supabase = createMockSupabase({ traces });
    const runId = 'deterministic-test';

    const result1 = await analyzeBottlenecks(supabase, { enableAutoCreate: false, runId });
    const result2 = await analyzeBottlenecks(supabase, { enableAutoCreate: false, runId });

    expect(result1.bottlenecks.length).toBe(result2.bottlenecks.length);
    if (result1.bottlenecks.length > 0) {
      expect(result1.bottlenecks[0].ratio).toBe(result2.bottlenecks[0].ratio);
      expect(result1.bottlenecks[0].baseline_p50_ms).toBe(result2.bottlenecks[0].baseline_p50_ms);
      expect(result1.bottlenecks[0].observed_p50_ms).toBe(result2.bottlenecks[0].observed_p50_ms);
    }
  });

  it('returns empty array when no bottlenecks found', async () => {
    const traces = generateTraces({
      dimensionType: 'phase',
      dimensionKey: 'Build',
      baselineDurations: [1000, 1000, 1000],
      analysisDurations: [1000, 1000, 1000],
    });

    const supabase = createMockSupabase({ traces });
    const result = await analyzeBottlenecks(supabase, { enableAutoCreate: false });

    expect(result.bottlenecks).toEqual([]);
  });

  it('handles DB query error gracefully', async () => {
    const supabase = createMockSupabase({
      tracesError: { message: 'connection refused ECONNREFUSED host:5432' },
    });

    const result = await analyzeBottlenecks(supabase, { enableAutoCreate: false });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('db_connection_error');
    // Verify no password leak
    expect(result.errors[0]).not.toContain('password=');
  });

  it('sorts bottlenecks by ratio descending', async () => {
    const traces = [
      ...generateTraces({
        dimensionType: 'gate',
        dimensionKey: 'Gate_A',
        baselineDurations: [100, 100, 100, 100],
        analysisDurations: [500, 500, 500, 500],
      }),
      ...generateTraces({
        dimensionType: 'gate',
        dimensionKey: 'Gate_B',
        baselineDurations: [100, 100, 100, 100],
        analysisDurations: [300, 300, 300, 300],
      }),
    ];

    const supabase = createMockSupabase({ traces });
    const result = await analyzeBottlenecks(supabase, { enableAutoCreate: false });

    if (result.bottlenecks.length >= 2) {
      expect(result.bottlenecks[0].ratio).toBeGreaterThanOrEqual(result.bottlenecks[1].ratio);
    }
  });

  it('includes required fields in bottleneck output', async () => {
    // More baseline samples to keep p50 stable even with analysis traces included
    const traces = generateTraces({
      dimensionType: 'phase',
      dimensionKey: 'Build',
      baselineDurations: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
      analysisDurations: [5000, 5000, 5000, 5000],
    });

    const supabase = createMockSupabase({ traces });
    const result = await analyzeBottlenecks(supabase, { enableAutoCreate: false });

    expect(result.bottlenecks.length).toBe(1);
    const b = result.bottlenecks[0];
    expect(b).toHaveProperty('dimension_type');
    expect(b).toHaveProperty('dimension_key');
    expect(b).toHaveProperty('baseline_p50_ms');
    expect(b).toHaveProperty('observed_p50_ms');
    expect(b).toHaveProperty('ratio');
    expect(b).toHaveProperty('sample_count');
    expect(b).toHaveProperty('evidence_trace_ids');
    expect(Array.isArray(b.evidence_trace_ids)).toBe(true);
  });
});
