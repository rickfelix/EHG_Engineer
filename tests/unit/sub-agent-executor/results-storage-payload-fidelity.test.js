/**
 * QF-20260803-007 — a write that returns GREEN while DISCARDING part of its payload.
 *
 * Two independently-witnessed defects in one writer, claimed together because they are the same
 * shape: it handles part of its input correctly and drops or mishandles the rest without saying so.
 *
 *   1. `summary` was never in the record. The column EXISTS on sub_agent_execution_results
 *      (verified against the live table, not inferred from a migration), so a caller passing a
 *      summary got a success return, a created row, and no summary — with no error anywhere.
 *   2. The artifact compression path passed the RAW sd key where agent_artifacts.sd_id has the same
 *      UUID FK the results row already normalizes for. The insert failed with
 *      agent_artifacts_sd_id_fkey, the catch turned it into a console.warn, and the analysis fell
 *      back inline. Under the inline cap the content survives and the only symptom is a warning
 *      nobody reads; over it, the analysis is gone.
 *
 * WHY THESE TESTS ASSERT ON THE RECORD RATHER THAN ON A RETURN VALUE: the return value was GREEN
 * throughout both defects. That is the entire class. So each test inspects what was actually handed
 * to insert() — the "assert what LANDED" shape the QF asks for — and a test that trusted the call's
 * result would have passed against the broken writer.
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
          capture.insertedTable = table;
          capture.inserted = record;
          return {
            select: () => ({
              single: async () => ({ data: { id: 'mock-row-id', ...record }, error: null })
            })
          };
        },
        update(fields) {
          return {
            eq: () => ({
              select: () => ({ single: async () => ({ data: { id: 'mock-row-id', ...fields }, error: null }) })
            })
          };
        }
      };
    }
  };
}

describe('QF-20260803-007 — the writer must not discard payload while returning green', () => {
  const capture = {};

  beforeEach(() => {
    capture.inserted = null;
    capture.insertedTable = null;
    capture.artifactArgs = null;

    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture)
    }));
    // A REAL normalizer stand-in, not an identity no-op: the artifact defect is precisely that the
    // key and the UUID diverge, so a normalizer that returns its input unchanged would make the
    // broken and fixed code indistinguishable and the test would pass either way.
    vi.doMock('../../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => (String(v).startsWith('SD-') ? '11111111-2222-3333-4444-555555555555' : v)
    }));
    vi.doMock('../../../lib/artifact-tools.js', () => ({
      createArtifact: async (_content, opts) => {
        capture.artifactArgs = opts;
        return { artifact_id: 'artifact-1', token_count: 10, summary: 'compressed' };
      }
    }));
    // verifyReadback constructs its OWN real Supabase client (by design — see
    // readback-checker.mjs's header) rather than accepting one, so an unmocked call from this
    // mocked-write-path suite would try a real network round trip for a row ('mock-row-id') that
    // was never actually written. This file only asserts what LANDED in the fake insert/update
    // call, not readback-checker's own behavior (covered separately by
    // results-storage-readback.test.js and tests/unit/checkers/readback-checker.test.js), so both
    // the pre-existing soft readback and the FR-2 hard readback are mocked to resolve PASS here.
    // The row ECHOES capture.inserted (read at call time, not a static {}) so FR-2's own
    // presence-only checks on warnings/recommendations/detailed_analysis see real content when a
    // test actually sends real content — a static empty row previously false-failed every test in
    // this file that populates one of those fields.
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback: vi.fn().mockImplementation(async () => ({ verdict: 'PASS', row: capture.inserted || {} })) };
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../../lib/artifact-tools.js');
    vi.doUnmock('../../../lib/checkers/readback-checker.mjs');
  });

  it('persists summary — the field this QF is named for', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      summary: 'PASS — 49/49 tests, four mutations killed.',
      detailed_analysis: 'short'
    });

    expect(capture.insertedTable).toBe('sub_agent_execution_results');
    expect(capture.inserted.summary).toBe('PASS — 49/49 tests, four mutations killed.');
    // The row must carry BOTH: the original defect stored detailed_analysis correctly, which is
    // exactly why the missing summary went unnoticed for months.
    expect(capture.inserted.detailed_analysis).toBe('short');
  });

  it('normalizes an absent or blank summary to null rather than storing whitespace', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });
    expect(capture.inserted.summary).toBeNull();
    expect('summary' in capture.inserted).toBe(true); // present-and-null, not absent

    vi.resetModules();
    const { storeSubAgentResults: store2 } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await store2('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90, summary: '   ' });
    expect(capture.inserted.summary).toBeNull();
  });

  it('sends the NORMALIZED uuid to the artifact insert, not the raw sd key', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    // Over RESULT_COMPRESSION_THRESHOLD (8KB) so the compression path actually fires.
    await storeSubAgentResults('SECURITY', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      detailed_analysis: 'x'.repeat(9000)
    });

    expect(capture.artifactArgs, 'the compression path must have fired').not.toBeNull();
    // THE ASSERTION THAT FAILS AGAINST THE OLD CODE: it passed 'SD-TEST-001' here.
    expect(capture.artifactArgs.sd_id).toBe('11111111-2222-3333-4444-555555555555');
    expect(capture.artifactArgs.sd_id).not.toBe('SD-TEST-001');
    // And the two writes must agree — one value, normalized once, used by both.
    expect(capture.inserted.sd_id).toBe(capture.artifactArgs.sd_id);
  });

  it('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H: refuses (throws) on caller fields it does not store, rather than warning and silently dropping them', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await expect(storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      some_future_field: 'nobody stores this'
    })).rejects.toThrow(/some_future_field/);
    // Nothing was written for the rejected call.
    expect(capture.inserted).toBeNull();
  });

  it('stays SILENT for deliberately-unpersisted fields — a noisy check gets deleted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    // Every one of these is handled somewhere other than a same-named column. If the enumeration
    // flagged them it would cry wolf on every ordinary write, and the next person would remove it.
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence_score: 90,
      execution_time_ms: 1234,
      summary: 'stored',
      findings: { a: 1 },
      metadata: { phase: 'EXEC' }
    });

    const payloadWarnings = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('[PAYLOAD]'));
    expect(payloadWarnings, `unexpected payload warning: ${payloadWarnings[0] || ''}`).toEqual([]);
    // findings has NO column — it is routed into metadata, which is explicit handling and must be
    // preserved rather than "fixed" by mapping it to a column that does not exist.
    expect(capture.inserted.metadata._findings_stripped).toBe(true);
    warn.mockRestore();
  });

  it('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H: message and hallucination_check are PRESERVED (metadata.message/metadata.hallucination_check), not merely exempted from the fail-loud check', async () => {
    // TESTING sub-agent (EXEC, GAP-1): the PERSISTED_ELSEWHERE exemption for these two fields is
    // trivially satisfiable by dropping their content to null while still avoiding the throw --
    // the fix's own comment claims "preserving the content ... is the actual fix," which this test
    // pins as an assertion, not prose.
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'MANUAL_REQUIRED',
      confidence: 50,
      message: 'VALIDATION instructions displayed above. Manual analysis required.',
      hallucination_check: { performed: true, score: 87, passed: true },
    });

    expect(capture.inserted.metadata.message).toBe('VALIDATION instructions displayed above. Manual analysis required.');
    expect(capture.inserted.metadata.hallucination_check).toEqual({ performed: true, score: 87, passed: true });
  });

  it('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H: a nested results.metadata.findings is recorded via _findings_had_keys, the branch FR-1 also exempts', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      metadata: { findings: { risk: 'high', owner: 'adam' } },
    });

    expect(capture.inserted.metadata._findings_stripped).toBe(true);
    expect(capture.inserted.metadata._findings_had_keys.sort()).toEqual(['owner', 'risk']);
  });

  it('BUG-1 (TESTING sub-agent, live at 32.4% of rows over 60d): does NOT refuse options/metrics — real, currently-used top-level fields on 14+ fleet sub-agent modules (security.js, testing/index.js, design/index.js, etc), already persisted into metadata but missing their PERSISTED_ELSEWHERE declaration before this fix', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await expect(storeSubAgentResults('SECURITY', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      options: { skip_e2e: true },
      metrics: { checks_run: 12 },
    })).resolves.toBeTruthy();

    expect(capture.inserted.metadata.options).toEqual({ skip_e2e: true });
    expect(capture.inserted.metadata.metrics).toEqual({ checks_run: 12 });
  });

  it('BUG-1: baseline_applied (security.js) and mode (regression.js) are genuinely persisted, not merely exempted — these were UNHANDLED before this fix, unlike options/metrics above', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('SECURITY', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      baseline_applied: true,
    });
    expect(capture.inserted.metadata.baseline_applied).toBe(true);

    vi.resetModules();
    const { storeSubAgentResults: store2 } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await store2('REGRESSION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      mode: 'full-validation',
    });
    expect(capture.inserted.metadata.mode).toBe('full-validation');
  });
});

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E — metadata.session_id provenance stamp', () => {
  const capture = {};
  const savedSessionId = process.env.CLAUDE_SESSION_ID;

  beforeEach(() => {
    capture.inserted = null;
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture)
    }));
    vi.doMock('../../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v
    }));
    vi.doMock('../../../lib/artifact-tools.js', () => ({
      createArtifact: async () => ({ artifact_id: 'artifact-1', token_count: 10, summary: 'compressed' })
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../../lib/artifact-tools.js');
    if (savedSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = savedSessionId;
  });

  it('stamps metadata.session_id exactly when CLAUDE_SESSION_ID is set', async () => {
    process.env.CLAUDE_SESSION_ID = 'sess-fr3-set';
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });
    expect(capture.inserted.metadata.session_id).toBe('sess-fr3-set');
  });

  it('stamps metadata.session_id as an explicit null (never an omitted key) when unset', async () => {
    delete process.env.CLAUDE_SESSION_ID;
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });
    expect('session_id' in capture.inserted.metadata).toBe(true);
    expect(capture.inserted.metadata.session_id).toBeNull();
  });

  it('anti-clobber: a caller-supplied results.metadata.session_id cannot survive over this writer\'s own observed value', async () => {
    process.env.CLAUDE_SESSION_ID = 'sess-real-writer';
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('VALIDATION', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      metadata: { session_id: 'sess-SPOOFED-BY-CALLER' }
    });
    expect(capture.inserted.metadata.session_id).toBe('sess-real-writer');
    expect(capture.inserted.metadata.session_id).not.toBe('sess-SPOOFED-BY-CALLER');
  });
});
