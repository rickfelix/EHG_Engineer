/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H (FR-2) — payload-completeness readback.
 *
 * The pre-existing readback in storeSubAgentResults (SD-LEO-INFRA-CHECKER-READBACK-WRITE-001)
 * only ever checked verdict/sub_agent_code/sd_id and fails soft (console.error only) — it would
 * never have caught a write that landed with the right verdict but dropped content (the specimen
 * defect: a green PASS row missing the findings/warnings/recommendations/summary it claimed to
 * carry). This SECOND, additional verifyReadback call is scoped to warnings/recommendations/
 * detailed_analysis/summary (via expectedFields) and findings (via requiredKeys on the metadata
 * column, since findings has no dedicated column — see results-storage.js's PERSISTED_ELSEWHERE)
 * and, unlike the existing one, fails HARD: a mismatch propagates out of storeSubAgentResults
 * into executor.js's existing catch block, which already re-throws to the CLI as a non-zero exit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeMockSupabase(capture) {
  return {
    from(_table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        insert(record) {
          capture.inserted = record;
          return {
            select: () => ({
              single: async () => ({ data: { id: 'inserted-row-id', ...record }, error: null }),
            }),
          };
        },
      };
    },
  };
}

describe('FR-2: a hard-failing second readback catches dropped payload content', () => {
  const capture = {};

  beforeEach(() => {
    capture.inserted = null;
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture),
    }));
    vi.doMock('../../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => (String(v).startsWith('SD-') ? '11111111-2222-3333-4444-555555555555' : v),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../../lib/checkers/readback-checker.mjs');
  });

  it('propagates (throws) into the caller when the row genuinely dropped a non-empty warnings array — the row survived the first (soft) check but failed the payload-completeness check', async () => {
    const verifyReadback = vi.fn()
      .mockResolvedValueOnce({ verdict: 'PASS', row: {} }) // the pre-existing soft check: passes
      // FR-2's new hard check: the row's own warnings came back empty, despite a non-empty send.
      .mockResolvedValueOnce({ verdict: 'PASS', row: { warnings: [], recommendations: [] } });
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');

    await expect(storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      warnings: ['a real warning the row must keep'],
    })).rejects.toThrow(/warnings/);

    expect(verifyReadback).toHaveBeenCalledTimes(2);
    // MEASURED CORRECTION (TESTING sub-agent, EXEC): warnings/recommendations are NOT compared by
    // exact value here (jsonb array-of-object key order is not stable across a round trip) --
    // only presence is checked, in-process against the returned row, not via expectedFields.
    expect(verifyReadback).toHaveBeenNthCalledWith(2, expect.objectContaining({
      table: 'sub_agent_execution_results',
      match: { id: 'inserted-row-id' },
      expectedFields: expect.not.objectContaining({ warnings: expect.anything() }),
    }));
  });

  it('does not change behavior for a normal, fully-persisted row (both readbacks pass, content survives with unrelated key reordering)', async () => {
    const verifyReadback = vi.fn()
      .mockResolvedValueOnce({ verdict: 'PASS', row: {} })
      // The jsonb round trip reordered object keys within the array -- semantically identical,
      // byte different. This must NOT be treated as a dropped field (the bug this test pins).
      .mockResolvedValueOnce({ verdict: 'PASS', row: { recommendations: [{ issue: 'y', severity: 'x' }] } });
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const result = await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      summary: 'all good',
      recommendations: [{ severity: 'x', issue: 'y' }],
    });

    expect(result.id).toBe('inserted-row-id');
    expect(verifyReadback).toHaveBeenCalledTimes(2);
  });

  it('requires the metadata.findings key when the caller supplied top-level findings', async () => {
    const verifyReadback = vi.fn().mockResolvedValue({ verdict: 'PASS', row: {} });
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      findings: { risk: 'high' },
    });

    expect(verifyReadback).toHaveBeenNthCalledWith(2, expect.objectContaining({
      requiredKeys: { metadata: ['findings'] },
    }));
  });
});
