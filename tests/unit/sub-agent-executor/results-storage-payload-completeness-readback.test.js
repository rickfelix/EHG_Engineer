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
    from(table) {
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

  it('propagates (throws) into the caller when the second readback rejects — the row survived the first (soft) check but failed the payload-completeness check', async () => {
    const { ReadbackFieldMismatchError } = await vi.importActual('../../../lib/checkers/readback-checker.mjs');
    const verifyReadback = vi.fn()
      .mockResolvedValueOnce({ verdict: 'PASS', row: {} }) // the pre-existing soft check: passes
      .mockRejectedValueOnce( // FR-2's new hard check: the row dropped `warnings`
        new ReadbackFieldMismatchError('verifyReadback: field "warnings" mismatch', { table: 'sub_agent_execution_results', field: 'warnings' })
      );
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
    // The second (hard) call is scoped to the content fields, not verdict/sub_agent_code/sd_id.
    expect(verifyReadback).toHaveBeenNthCalledWith(2, expect.objectContaining({
      table: 'sub_agent_execution_results',
      match: { id: 'inserted-row-id' },
      expectedFields: expect.objectContaining({
        warnings: ['a real warning the row must keep'],
      }),
    }));
  });

  it('does not change behavior for a normal, fully-persisted row (both readbacks pass)', async () => {
    const verifyReadback = vi.fn().mockResolvedValue({ verdict: 'PASS', row: {} });
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const result = await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      summary: 'all good',
      recommendations: ['do X'],
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
