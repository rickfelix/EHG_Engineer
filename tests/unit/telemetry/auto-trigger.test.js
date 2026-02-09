/**
 * Unit tests for auto-trigger.js
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001C
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkStaleness, enqueueAnalysis, triggerIfStale, getLatestFindings } from '../../../lib/telemetry/auto-trigger.js';

// Mock bottleneck-analyzer to avoid real analysis in tests
vi.mock('../../../lib/telemetry/bottleneck-analyzer.js', () => ({
  analyzeBottlenecks: vi.fn().mockResolvedValue({
    run_id: 'mock-run',
    traces_scanned: 100,
    dimensions_evaluated: 10,
    bottlenecks: [],
    items_created: 0,
    items_skipped_rate_limit: 0,
    items_skipped_dedupe: 0,
    errors: [],
  }),
}));

function createMockSupabase(overrides = {}) {
  const mockChain = (tableName) => {
    const state = { table: tableName, filters: [], insertData: null };
    const chainObj = {
      select: () => chainObj,
      insert: (data) => { state.insertData = data; return chainObj; },
      update: (data) => { state.updateData = data; return chainObj; },
      eq: (col, val) => { state.filters.push({ col, val }); return chainObj; },
      in: (col, vals) => { state.filters.push({ col, vals }); return chainObj; },
      gte: (col, val) => { state.filters.push({ type: 'gte', col, val }); return chainObj; },
      or: (expr) => { state.filters.push({ type: 'or', expr }); return chainObj; },
      order: () => chainObj,
      limit: () => chainObj,
      single: () => {
        if (state.insertData) {
          return { data: { id: 'mock-id' }, error: overrides.insertError ?? null };
        }
        return { data: null, error: null };
      },
      then: (resolve) => {
        let result;
        if (state.table === 'telemetry_analysis_runs') {
          if (state.insertData) {
            result = { data: null, error: overrides.insertError ?? null };
          } else if (state.updateData) {
            result = { data: null, error: null };
          } else {
            // Query - check status filter to determine what we're looking for
            const statusFilter = state.filters.find(f => f.col === 'status' && f.val === 'SUCCEEDED');
            const activeFilter = state.filters.find(f => f.vals && f.vals.includes('QUEUED'));

            if (statusFilter) {
              result = { data: overrides.succeededRuns ?? [], error: null };
            } else if (activeFilter) {
              result = { data: overrides.activeRuns ?? [], error: null };
            } else {
              result = { data: [], error: null };
            }
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

describe('checkStaleness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns stale when no recent SUCCEEDED run exists', async () => {
    const supabase = createMockSupabase({ succeededRuns: [] });
    const result = await checkStaleness(supabase);

    expect(result.isStale).toBe(true);
    expect(result.lastSuccessAt).toBeNull();
    expect(result.decision).toBe('stale_no_recent_run');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns fresh when recent SUCCEEDED run exists', async () => {
    const recentDate = new Date().toISOString();
    const supabase = createMockSupabase({
      succeededRuns: [{ finished_at: recentDate }],
    });
    const result = await checkStaleness(supabase);

    expect(result.isStale).toBe(false);
    expect(result.lastSuccessAt).toBe(recentDate);
    expect(result.decision).toBe('fresh');
  });
});

describe('enqueueAnalysis', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueues when no active run exists', async () => {
    const supabase = createMockSupabase({ activeRuns: [] });
    const result = await enqueueAnalysis(supabase);

    expect(result.enqueued).toBe(true);
    expect(result.runId).toBeTruthy();
    expect(result.decision).toBe('enqueued');
    expect(result.error).toBeNull();
  });

  it('skips when active run already exists (dedup)', async () => {
    const supabase = createMockSupabase({
      activeRuns: [{ run_id: 'existing-run-123' }],
    });
    const result = await enqueueAnalysis(supabase);

    expect(result.enqueued).toBe(false);
    expect(result.runId).toBe('existing-run-123');
    expect(result.decision).toBe('already_queued');
  });

  it('handles insert error gracefully', async () => {
    const supabase = createMockSupabase({
      activeRuns: [],
      insertError: { message: 'connection refused' },
    });
    const result = await enqueueAnalysis(supabase);

    expect(result.enqueued).toBe(false);
    expect(result.decision).toBe('enqueue_failed');
    expect(result.error).toContain('connection refused');
  });
});

describe('triggerIfStale', () => {
  let stderrSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('skips when analysis is fresh', async () => {
    const supabase = createMockSupabase({
      succeededRuns: [{ finished_at: new Date().toISOString() }],
    });
    const result = await triggerIfStale(supabase);

    expect(result.decision).toBe('skipped_fresh');
    expect(result.correlationId).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('enqueues when analysis is stale', async () => {
    const supabase = createMockSupabase({
      succeededRuns: [],
      activeRuns: [],
    });
    const result = await triggerIfStale(supabase);

    expect(result.decision).toBe('enqueued');
  });

  it('never throws (returns error_non_fatal)', async () => {
    // Pass a broken supabase that throws
    const brokenSupabase = {
      from: () => { throw new Error('totally broken'); },
    };

    const result = await triggerIfStale(brokenSupabase);

    expect(result.decision).toBe('error_non_fatal');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('getLatestFindings', () => {
  it('returns hasFreshFindings=false when no SUCCEEDED run', async () => {
    const supabase = createMockSupabase({ succeededRuns: [], activeRuns: [] });
    const result = await getLatestFindings(supabase);

    expect(result.hasFreshFindings).toBe(false);
    expect(result.run).toBeNull();
    expect(result.ageInDays).toBeNull();
  });

  it('returns findings with age when SUCCEEDED run exists', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const supabase = createMockSupabase({
      succeededRuns: [{
        run_id: 'run-123',
        finished_at: yesterday,
        findings_count: 2,
        top_bottleneck_category: 'phase',
        output_ref: { bottlenecks: [{}, {}] },
        duration_ms: 500,
      }],
      activeRuns: [],
    });
    const result = await getLatestFindings(supabase);

    expect(result.hasFreshFindings).toBe(true);
    expect(result.run.run_id).toBe('run-123');
    expect(result.ageInDays).toBe(1);
    expect(result.activeRun).toBeNull();
  });

  it('includes active run info when analysis is queued', async () => {
    const supabase = createMockSupabase({
      succeededRuns: [],
      activeRuns: [{ run_id: 'active-456', status: 'RUNNING', triggered_at: new Date().toISOString() }],
    });
    const result = await getLatestFindings(supabase);

    expect(result.hasFreshFindings).toBe(false);
    expect(result.activeRun).toBeTruthy();
    expect(result.activeRun.run_id).toBe('active-456');
  });
});
