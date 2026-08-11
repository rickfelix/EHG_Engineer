/**
 * QF-20260809-097 — getCachedTestResults keyed its 1h cache lookup on
 * (sd_id, sub_agent_code) only, with no phase dimension. A PLAN-phase TESTING
 * run that correctly BLOCKED (nothing implemented yet) got silently reused at
 * EXEC within the hour: the console printed "All 10 user stories fully
 * implemented" then emitted BLOCKED anyway, from a cached row with no
 * recorded cause for the current run.
 *
 * Fix: resolve the SD's current_phase (via the same normalizePhaseToken SSOT
 * results-storage.js's write path uses) and filter the cache query on it, so
 * PLAN and EXEC runs never share a cached verdict.
 */
import { describe, it, expect } from 'vitest';
import { getCachedTestResults } from '../../../lib/sub-agents/testing/phases/phase3-execution.js';

function stubSupabase({ sdCurrentPhase, testingRows }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: { current_phase: sdCurrentPhase }, error: null }),
        };
      }
      if (table === 'sub_agent_execution_results') {
        const chain = {
          select() { return chain; },
          eq(col, val) {
            chain._filters = chain._filters || {};
            chain._filters[col] = val;
            return chain;
          },
          order() { return chain; },
          limit() { return chain; },
          single() {
            const matches = testingRows.filter(
              (r) => r.sd_id === chain._filters.sd_id
                && r.sub_agent_code === chain._filters.sub_agent_code
                && r.phase === chain._filters.phase
            );
            if (matches.length === 0) return Promise.resolve({ data: null, error: { message: 'no rows' } });
            // Most recent first (rows are pre-sorted in fixtures).
            return Promise.resolve({ data: matches[0], error: null });
          },
        };
        return chain;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const SD_ID = 'sd-uuid-1';

describe('getCachedTestResults: phase-scoped cache key (QF-20260809-097)', () => {
  it('does NOT reuse a PLAN-phase BLOCKED verdict for an EXEC-phase lookup', async () => {
    const supabase = stubSupabase({
      sdCurrentPhase: 'EXEC',
      testingRows: [
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'PLAN',
          verdict: 'BLOCKED', confidence: 100, metadata: {},
          created_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getCachedTestResults(SD_ID, supabase);
    expect(result).toBeNull();
  });

  it('reuses a same-phase (EXEC) cached verdict within the 1h TTL', async () => {
    const supabase = stubSupabase({
      sdCurrentPhase: 'EXEC',
      testingRows: [
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'EXEC',
          verdict: 'PASS', confidence: 95,
          metadata: { tests_executed: 10, tests_passed: 10, failed_tests: 0 },
          created_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getCachedTestResults(SD_ID, supabase);
    expect(result).not.toBeNull();
    expect(result.from_cache).toBe(true);
    expect(result.tests_passed).toBe(10);
  });

  it('picks the EXEC-phase row over an older PLAN-phase row for the same SD', async () => {
    const supabase = stubSupabase({
      sdCurrentPhase: 'EXEC',
      testingRows: [
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'EXEC',
          verdict: 'PASS', confidence: 95,
          metadata: { tests_executed: 5, tests_passed: 5, failed_tests: 0 },
          created_at: new Date().toISOString(),
        },
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'PLAN',
          verdict: 'BLOCKED', confidence: 100, metadata: {},
          created_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getCachedTestResults(SD_ID, supabase);
    expect(result.tests_passed).toBe(5);
  });

  it('returns null (no cache trust) when the SD current_phase cannot be resolved', async () => {
    const supabase = stubSupabase({ sdCurrentPhase: null, testingRows: [] });
    const result = await getCachedTestResults(SD_ID, supabase);
    expect(result).toBeNull();
  });
});
