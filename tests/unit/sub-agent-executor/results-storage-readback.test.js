/**
 * SD-LEO-INFRA-CHECKER-READBACK-WRITE-001 (FR-4) — TS-5/TS-6: proves the readback-checker
 * wiring in storeSubAgentResults() actually fires on BOTH the insert and update branches, and
 * that a forced checker failure logs loudly without changing the function's return value or
 * throwing into its own caller.
 *
 * WHY THIS FILE EXISTS (RCA a726dd91, Layer 3): a naive smoke test of storeSubAgentResults()
 * with an unmocked lib/checkers/readback-checker.mjs would pass "green" even if the wiring were
 * completely broken — verifyReadback() would throw (no real row exists behind a mocked write),
 * the adopter's catch swallows it, and console.error is itself a vi.fn() in this tier
 * (tests/setup.unit.js), so a silently-broken integration and a correctly-working one look
 * IDENTICAL from the outside. Mocking verifyReadback() directly (rather than re-exercising its
 * internals, already covered by tests/unit/checkers/readback-checker.test.js) is what makes the
 * call itself — table, match, and that it fires on both branches — an observable assertion
 * instead of an invisible no-op.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeMockSupabase(capture, { dedupHit = false } = {}) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() {
          return Promise.resolve({
            data: dedupHit ? [{ id: 'existing-row-id' }] : [],
            error: null,
          });
        },
        insert(record) {
          capture.insertedTable = table;
          capture.inserted = record;
          return {
            select: () => ({
              single: async () => ({ data: { id: 'inserted-row-id', ...record }, error: null }),
            }),
          };
        },
        update(fields) {
          capture.updated = fields;
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'existing-row-id', ...fields }, error: null }),
              }),
            }),
          };
        },
      };
    },
  };
}

describe('FR-4: storeSubAgentResults() <-> readback checker wiring', () => {
  const capture = {};

  beforeEach(() => {
    capture.inserted = null;
    capture.updated = null;
    capture.insertedTable = null;

    vi.doMock('../../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => (String(v).startsWith('SD-') ? '11111111-2222-3333-4444-555555555555' : v),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../lib/checkers/readback-checker.mjs');
  });

  it('insert branch: calls verifyReadback with the inserted row id, table, and intended field values', async () => {
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture, { dedupHit: false }),
    }));
    const verifyReadback = vi.fn().mockResolvedValue({ verdict: 'PASS', row: {} });
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const result = await storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });

    expect(capture.insertedTable).toBe('sub_agent_execution_results');
    expect(verifyReadback).toHaveBeenCalledTimes(1);
    expect(verifyReadback).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sub_agent_execution_results',
      match: { id: 'inserted-row-id' },
      expectedFields: expect.objectContaining({
        verdict: 'PASS',
        sub_agent_code: 'TESTING',
      }),
    }));
    // The checker resolved PASS — the write's own return value is the untouched insert result.
    expect(result.id).toBe('inserted-row-id');
  });

  it('update (dedup) branch: calls verifyReadback with the EXISTING row id, not a freshly-minted one', async () => {
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture, { dedupHit: true }),
    }));
    const verifyReadback = vi.fn().mockResolvedValue({ verdict: 'PASS', row: {} });
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const result = await storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });

    expect(capture.updated).not.toBeNull(); // the update branch, not insert, actually ran
    expect(verifyReadback).toHaveBeenCalledTimes(1);
    expect(verifyReadback).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sub_agent_execution_results',
      match: { id: 'existing-row-id' },
    }));
    expect(result.id).toBe('existing-row-id');
  });

  it('a forced checker failure logs loudly but does NOT change the return value or throw into the caller (insert branch)', async () => {
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture, { dedupHit: false }),
    }));
    const { ReadbackRowcountError } = await vi.importActual('../../../lib/checkers/readback-checker.mjs');
    const verifyReadback = vi.fn().mockRejectedValue(
      new ReadbackRowcountError('verifyReadback: expected exactly 1 row, got 0', { table: 'sub_agent_execution_results' })
    );
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');

    let thrown = null;
    let result;
    try {
      result = await storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });
    } catch (e) {
      thrown = e;
    }

    expect(thrown, 'a checker failure must not propagate into the caller').toBeNull();
    expect(result.id).toBe('inserted-row-id'); // return value unchanged despite the checker failure

    const readbackLogs = errorSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('READBACK-CHECK-FAILED'));
    expect(readbackLogs.length).toBe(1);
    expect(readbackLogs[0]).toContain('ReadbackRowcountError');
    errorSpy.mockRestore();
  });

  it('a forced checker failure on the update branch is equally non-breaking (both branches covered, G7)', async () => {
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture, { dedupHit: true }),
    }));
    const { ReadbackFieldMismatchError } = await vi.importActual('../../../lib/checkers/readback-checker.mjs');
    const verifyReadback = vi.fn().mockRejectedValue(
      new ReadbackFieldMismatchError('verifyReadback: field mismatch', { table: 'sub_agent_execution_results', field: 'verdict' })
    );
    vi.doMock('../../../lib/checkers/readback-checker.mjs', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, verifyReadback };
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');

    const result = await storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });

    expect(result.id).toBe('existing-row-id');
    const readbackLogs = errorSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('READBACK-CHECK-FAILED'));
    expect(readbackLogs.length).toBe(1);
    expect(readbackLogs[0]).toContain('ReadbackFieldMismatchError');
    errorSpy.mockRestore();
  });
});
