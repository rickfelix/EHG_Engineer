/**
 * SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-1 — TS-1, TS-2, TS-3, TS-4, TS-8.
 *
 * storeSubAgentResults() must refuse a TESTING PASS/CONDITIONAL_PASS write missing a genuine
 * metadata.test_execution block. Reused discriminator: verdict, not source (TESTING sub-agent
 * evidence 42436060 -- source defaults to 'manual' in Postgres and is never explicitly set, so
 * it cannot distinguish writers). Non-accepting verdicts and non-TESTING codes are untouched
 * (TR-4/TS-4 -- the file's fail-soft doctrine for failure evidence must survive).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateTestExecutionShape } from '../../../lib/sub-agent-executor/testing-verdict-guard.js';
import { buildTestExecution } from '../../../lib/sub-agents/testing/test-execution-record.js';

describe('validateTestExecutionShape (pure function)', () => {
  it('TS-1: throws naming the missing field for a TESTING PASS write with no test_execution', () => {
    expect(() => validateTestExecutionShape({ sub_agent_code: 'TESTING', verdict: 'PASS', metadata: {} }))
      .toThrow(/metadata\.test_execution is missing/);
  });

  it('TS-2: a well-formed test_execution (via buildTestExecution) is accepted, never throws', () => {
    const test_execution = buildTestExecution({ executed: 10, passed: 10, failed: 0, skipped: 0 });
    expect(() => validateTestExecutionShape({ sub_agent_code: 'TESTING', verdict: 'PASS', metadata: { test_execution } }))
      .not.toThrow();
    expect(() => validateTestExecutionShape({ sub_agent_code: 'TESTING', verdict: 'CONDITIONAL_PASS', metadata: { test_execution } }))
      .not.toThrow();
  });

  it('TS-3: throws naming the malformed field when a count is a coerced string, not a real number', () => {
    const bad = { tests_executed: '10', tests_passed: 10, tests_failed: 0, tests_skipped: 0 };
    expect(() => validateTestExecutionShape({ sub_agent_code: 'TESTING', verdict: 'PASS', metadata: { test_execution: bad } }))
      .toThrow(/tests_executed/);
  });

  it('TS-3b: throws when tests_executed is present and numeric but zero -- not a genuine measured run', () => {
    const zero = buildTestExecution({ executed: 0, passed: 0, failed: 0, skipped: 0 });
    expect(() => validateTestExecutionShape({ sub_agent_code: 'TESTING', verdict: 'PASS', metadata: { test_execution: zero } }))
      .toThrow(/not a genuine measured run/);
  });

  it('D1 (TESTING sub-agent evidence 4e655ac0): an honest metadata.measured===false PASS is accepted, not refused', () => {
    // Mirrors lib/sub-agents/testing/index.js's policy_non_applicable_no_code /
    // policy_non_applicable_code_no_scoped_test / e2e_not_applicable branches: a real,
    // deliberately-designed all-zeros test_execution paired with an explicit measured:false.
    const zero = buildTestExecution();
    expect(() => validateTestExecutionShape({
      sub_agent_code: 'TESTING', verdict: 'PASS', metadata: { measured: false, test_execution: zero }
    })).not.toThrow();
    expect(() => validateTestExecutionShape({
      sub_agent_code: 'TESTING', verdict: 'CONDITIONAL_PASS', metadata: { measured: false, test_execution: zero }
    })).not.toThrow();
  });

  it('D1: a zero-executed test_execution WITHOUT an explicit measured:false is still refused', () => {
    const zero = buildTestExecution();
    expect(() => validateTestExecutionShape({ sub_agent_code: 'TESTING', verdict: 'PASS', metadata: { test_execution: zero } }))
      .toThrow(/not a genuine measured run/);
  });

  it('TS-4: a non-TESTING sub-agent code is completely unaffected, regardless of verdict/metadata', () => {
    expect(() => validateTestExecutionShape({ sub_agent_code: 'SECURITY', verdict: 'PASS', metadata: {} })).not.toThrow();
    expect(() => validateTestExecutionShape({ sub_agent_code: 'VALIDATION', verdict: 'CONDITIONAL_PASS', metadata: {} })).not.toThrow();
  });

  it('TR-4: a TESTING verdict other than PASS/CONDITIONAL_PASS is never refused for a missing test_execution', () => {
    for (const verdict of ['ERROR', 'FAIL', 'WARNING', 'MANUAL_REQUIRED']) {
      expect(() => validateTestExecutionShape({ sub_agent_code: 'TESTING', verdict, metadata: {} }), verdict).not.toThrow();
    }
  });
});

describe('D1 end-to-end: the real policy_non_applicable_no_code branch survives the guard', () => {
  it('checkForNonUISdType(documentation SD) output passes validateTestExecutionShape unmodified', async () => {
    const { checkForNonUISdType } = await import('../../../lib/sub-agents/testing/index.js');
    const mockSupabaseClient = {
      from: () => ({
        select: () => ({
          or: () => ({
            single: async () => ({ data: { sd_type: 'documentation', category: null, key_changes: [], scope: '', title: 'x' } })
          })
        })
      })
    };
    const result = await checkForNonUISdType('SD-TEST-DOC-001', 'prospective', {}, {}, mockSupabaseClient);
    expect(result.verdict).toBe('PASS');
    expect(result.metadata.measured).toBe(false);
    expect(() => validateTestExecutionShape({
      sub_agent_code: 'TESTING', verdict: result.verdict, metadata: result.metadata
    })).not.toThrow();
  });
});

function makeMockSupabase(capture) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() {
          // TS-8: report an existing row within the dedup window so the UPDATE branch fires.
          return capture.dedupHit
            ? Promise.resolve({ data: [{ id: 'existing-row-id' }], error: null })
            : Promise.resolve({ data: [], error: null });
        },
        insert(record) {
          capture.insertedTable = table;
          capture.inserted = record;
          return { select: () => ({ single: async () => ({ data: { id: 'mock-row-id', ...record }, error: null }) }) };
        },
        update(fields) {
          capture.updated = fields;
          return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'existing-row-id', ...fields }, error: null }) }) }) };
        }
      };
    }
  };
}

describe('storeSubAgentResults — guard wired above both write branches', () => {
  const capture = {};

  beforeEach(() => {
    capture.inserted = null;
    capture.updated = null;
    capture.insertedTable = null;
    capture.dedupHit = false;

    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture)
    }));
    vi.doMock('../../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../scripts/modules/sd-id-normalizer.js');
  });

  it('TS-1 (insert path): refuses and writes no row', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await expect(storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 }))
      .rejects.toThrow(/metadata\.test_execution is missing/);
    expect(capture.inserted).toBeNull();
  });

  it('TS-2 (insert path): a well-formed test_execution succeeds and lands on the row unchanged', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const test_execution = buildTestExecution({ executed: 10, passed: 10, failed: 0, skipped: 0 });
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90, metadata: { test_execution } });
    expect(capture.inserted.metadata.test_execution).toEqual(test_execution);
  });

  it('TS-8 (dedup/UPDATE path): a second call within the dedup window is refused exactly like the insert branch', async () => {
    capture.dedupHit = true;
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await expect(storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'CONDITIONAL_PASS', confidence: 80 }))
      .rejects.toThrow(/metadata\.test_execution is missing/);
    expect(capture.updated).toBeNull();
  });

  it('TS-8b (dedup/UPDATE path): a well-formed test_execution succeeds on the update branch too', async () => {
    capture.dedupHit = true;
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    const test_execution = buildTestExecution({ executed: 5, passed: 4, failed: 1, skipped: 0 });
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90, metadata: { test_execution } });
    expect(capture.updated.metadata.test_execution).toEqual(test_execution);
  });
});
