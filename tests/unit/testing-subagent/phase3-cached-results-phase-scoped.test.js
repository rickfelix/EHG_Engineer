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
import { describe, it, expect, vi } from 'vitest';

// QF-20260901-544: resolveEvaluatedCommitSha shells out to git -- mocked so the cache-key
// test below is deterministic and never touches a real git process.
vi.mock('../../../lib/sub-agent-executor/results-storage.js', () => ({
  resolveEvaluatedCommitSha: (repoPath) => (repoPath ? `sha-for-${repoPath}` : null),
}));

const { getCachedTestResults } = await import('../../../lib/sub-agents/testing/phases/phase3-execution.js');

const REPO_PATH = '/repo/current';
const CURRENT_SHA = 'sha-for-/repo/current';

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

  it('reuses a same-phase (EXEC) cached verdict within the 1h TTL for the SAME commit', async () => {
    const supabase = stubSupabase({
      sdCurrentPhase: 'EXEC',
      testingRows: [
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'EXEC',
          verdict: 'PASS', confidence: 95,
          metadata: { tests_executed: 10, tests_passed: 10, failed_tests: 0, evaluated_commit_sha: CURRENT_SHA },
          created_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getCachedTestResults(SD_ID, supabase, REPO_PATH);
    expect(result).not.toBeNull();
    expect(result.from_cache).toBe(true);
    expect(result.tests_passed).toBe(10);
    expect(result.cache_provenance.commit_sha).toBe(CURRENT_SHA);
  });

  it('picks the EXEC-phase row over an older PLAN-phase row for the same SD', async () => {
    const supabase = stubSupabase({
      sdCurrentPhase: 'EXEC',
      testingRows: [
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'EXEC',
          verdict: 'PASS', confidence: 95,
          metadata: { tests_executed: 5, tests_passed: 5, failed_tests: 0, evaluated_commit_sha: CURRENT_SHA },
          created_at: new Date().toISOString(),
        },
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'PLAN',
          verdict: 'BLOCKED', confidence: 100, metadata: {},
          created_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getCachedTestResults(SD_ID, supabase, REPO_PATH);
    expect(result.tests_passed).toBe(5);
  });

  it('QF-20260901-544: does NOT reuse a same-phase verdict from a DIFFERENT commit, even within the 1h TTL', async () => {
    const supabase = stubSupabase({
      sdCurrentPhase: 'EXEC',
      testingRows: [
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'EXEC',
          verdict: 'PASS', confidence: 95,
          metadata: { tests_executed: 10, tests_passed: 10, failed_tests: 0, evaluated_commit_sha: 'sha-for-/repo/OLD' },
          created_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getCachedTestResults(SD_ID, supabase, REPO_PATH);
    expect(result).toBeNull();
  });

  it('QF-20260901-544: does NOT reuse a verdict with no recorded commit_sha (pre-fix rows), even within the 1h TTL', async () => {
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
    const result = await getCachedTestResults(SD_ID, supabase, REPO_PATH);
    expect(result).toBeNull();
  });

  it('QF-20260901-544: never reuses when repoPath is not supplied (current commit unresolvable)', async () => {
    const supabase = stubSupabase({
      sdCurrentPhase: 'EXEC',
      testingRows: [
        {
          sd_id: SD_ID, sub_agent_code: 'TESTING', phase: 'EXEC',
          verdict: 'PASS', confidence: 95,
          metadata: { tests_executed: 10, tests_passed: 10, failed_tests: 0, evaluated_commit_sha: CURRENT_SHA },
          created_at: new Date().toISOString(),
        },
      ],
    });
    const result = await getCachedTestResults(SD_ID, supabase);
    expect(result).toBeNull();
  });

  it('returns null (no cache trust) when the SD current_phase cannot be resolved', async () => {
    const supabase = stubSupabase({ sdCurrentPhase: null, testingRows: [] });
    const result = await getCachedTestResults(SD_ID, supabase);
    expect(result).toBeNull();
  });
});
