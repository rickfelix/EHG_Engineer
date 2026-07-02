/**
 * QF-20260702-679 — scripts/store-sub-agent-repo-evidence.js is the new safe, heredoc-free
 * write path for Task-tool-invoked sub-agents. This exercises `main()` end-to-end (content
 * loaded from a real temp file, matching --content @<path> usage, never inline shell JSON)
 * against the same stubbed-network-only supabase pattern as the other results-storage tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeMockSupabase(captureTarget) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq(col, val) {
          if (table === 'strategic_directives_v2' && col === 'id') captureTarget.sdLookupId = val;
          return this;
        },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() {
          if (table === 'strategic_directives_v2') {
            return Promise.resolve({ data: { target_application: 'EHG_Engineer' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(record) {
          captureTarget.insertedTable = table;
          captureTarget.inserted = record;
          const inserted = { id: 'mock-row-id', ...record };
          return {
            select() {
              return { single: async () => ({ data: inserted, error: null }) };
            },
          };
        },
      };
    },
  };
}

describe('store-sub-agent-repo-evidence.js main() (QF-20260702-679)', () => {
  const capture = {};
  let tmpFile;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../lib/sub-agents/resolve-repo.js');
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('resolves target_application from the SD when not passed, stamps repo evidence, and persists it', async () => {
    capture.inserted = null;
    tmpFile = path.join(os.tmpdir(), `qf-679-results-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ verdict: 'PASS', confidence: 91, summary: 'looks good' }));

    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture),
    }));
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v,
    }));
    vi.doMock('../../lib/sub-agents/resolve-repo.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        resolveSubAgentRepo: async () => ({ repoPath: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer', repoResolved: true, registrySource: 'db' }),
      };
    });

    const { main } = await import('../../scripts/store-sub-agent-repo-evidence.js');
    const stored = await main(['SD-TEST-001', 'VALIDATION', '--content', `@${tmpFile}`, '--phase', 'PLAN_VERIFICATION']);

    expect(capture.insertedTable).toBe('sub_agent_execution_results');
    expect(capture.inserted.metadata.repo_path).toBe('C:/Users/rickf/Projects/_EHG/EHG_Engineer');
    expect(capture.inserted.metadata.repo_resolved).toBe(true);
    expect(capture.inserted.metadata.executed_from_cwd).toBeTruthy();
    expect(stored.id).toBe('mock-row-id');
  });

  it('throws a clear usage error when SD-ID or sub-agent code is missing', async () => {
    const { main } = await import('../../scripts/store-sub-agent-repo-evidence.js');
    await expect(main(['SD-ONLY'])).rejects.toThrow(/Usage:/);
  });
});
