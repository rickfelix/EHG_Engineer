/**
 * QF-20260702-679 — applySubAgentRepoVerdict (lib/sub-agents/resolve-repo.js) mutates
 * results.metadata.repo_path/executed_from_cwd correctly IN-MEMORY, but the metadata never
 * reaches sub_agent_execution_results on first attempt (tripped SUB_AGENT_REPO_RESOLUTION /
 * SUBAGENT_EVIDENCE_MISSING fleet-wide during the comms/refresh hardening sprint).
 *
 * This test chains the REAL applySubAgentRepoVerdict into the REAL storeSubAgentResults
 * (the canonical lib/sub-agent-executor writer) — only the Supabase network call is stubbed,
 * matching the established convention in sub-agent-execution-results-phase-column.test.js — to
 * prove where persistence actually breaks against a real (non-mocked-seam) code path.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

function makeMockSupabase(captureTarget) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        insert(record) {
          captureTarget.insertedTable = table;
          captureTarget.inserted = record;
          return {
            select() {
              return { single: async () => ({ data: { id: 'mock-row-id', ...record }, error: null }) };
            },
          };
        },
      };
    },
  };
}

describe('applySubAgentRepoVerdict -> storeSubAgentResults: repo evidence persistence (QF-20260702-679)', () => {
  const capture = {};

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../scripts/modules/sd-id-normalizer.js');
  });

  it('persists metadata.repo_path + executed_from_cwd to the stored row on the FIRST attempt', async () => {
    capture.inserted = null;
    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture),
    }));
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v,
    }));

    const { applySubAgentRepoVerdict, toCanonicalRepoPath } = await import('../../lib/sub-agents/resolve-repo.js');
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    // Real resolution shape (as resolveSubAgentRepo would return), no filesystem/DB dependency.
    const resolution = { repoPath: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer', repoResolved: true, registrySource: 'db' };

    let results = { verdict: 'PASS', confidence: 90, summary: 'ok' };
    results = applySubAgentRepoVerdict(results, resolution);

    // Sanity: the in-memory mutation happened (this half was never in dispute).
    expect(results.metadata.repo_path).toBe(toCanonicalRepoPath(resolution.repoPath));
    expect(results.metadata.executed_from_cwd).toBeTruthy();

    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, results, { phase: 'PLAN_VERIFICATION' });

    expect(capture.insertedTable).toBe('sub_agent_execution_results');
    const row = capture.inserted;
    expect(row.metadata.repo_path).toBe(toCanonicalRepoPath(resolution.repoPath));
    expect(row.metadata.repo_resolved).toBe(true);
    expect(row.metadata.registry_source).toBe('db');
    expect(row.metadata.executed_from_cwd).toBe(results.metadata.executed_from_cwd);
  });

  it('preserves the caller-passed results object across the two calls (no stale/copied reference)', async () => {
    capture.inserted = null;
    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture),
    }));
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v,
    }));

    const { applySubAgentRepoVerdict } = await import('../../lib/sub-agents/resolve-repo.js');
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');

    const results = { verdict: 'PASS', confidence: 88 };
    const mutated = applySubAgentRepoVerdict(results, { repoPath: '/tmp/repo', repoResolved: true, registrySource: 'registry' });

    // applySubAgentRepoVerdict returns the SAME object it mutated (identity check) — a caller
    // that discards the return value and re-uses `results` still gets the stamped metadata.
    expect(mutated).toBe(results);

    await storeSubAgentResults('REGRESSION', 'SD-TEST-001', null, results, {});
    expect(capture.inserted.metadata.repo_path).toBe('/tmp/repo');
  });
});
