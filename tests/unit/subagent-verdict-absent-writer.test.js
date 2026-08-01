/**
 * SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001 FR-4 — the WRITER stores the sentinel.
 *
 * WHY THIS FILE EXISTS: review found that replacing ABSENT_VERDICT with `undefined` in
 * results-storage.js SURVIVED the entire 37-test suite. Every FR-4 assertion there tested
 * properties of the exported CONSTANT — that it is a string, that it is not a valid
 * verdict — and never that storeSubAgentResults actually WRITES it. Rationale without
 * assertion (PAT-RATIONALE-WITHOUT-ASSERTION-001).
 *
 * It is the same shape the sibling suite's own header warns about — "a mapper-only test
 * passes while the gate stays blind" — reproduced one layer down: a constant-only test
 * passes while the writer stays unwired. Two SDs earlier this same session I shipped a
 * detector that was fully unit-tested and imported by nothing. Behaviour tests prove a
 * value EXISTS; only the writer proves it is USED.
 *
 * So this drives storeSubAgentResults for real, against a stateful mock that captures the
 * inserted row, and asserts on what LANDS.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Minimal stateful Supabase double: captures inserted rows so the test asserts on the WRITE. */
function makeMockSupabase(rows) {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    gte() { return builder; },
    order() { return builder; },
    limit() { return Promise.resolve({ data: [], error: null }); },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    single() { return Promise.resolve({ data: null, error: null }); },
    insert(payload) {
      const row = { id: `row-${rows.length + 1}`, ...payload };
      rows.push(row);
      return {
        select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
      };
    },
    update() { return builder; },
  };
  return { from: () => builder };
}

describe('FR-4: the writer records verdict ABSENCE as a value, not an omitted key', () => {
  let rows;

  beforeEach(() => {
    rows = [];
    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(rows),
    }));
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v,
    }));
    vi.doMock('../../lib/artifact-tools.js', () => ({
      createArtifact: async () => ({ artifact_id: 'a', token_count: 0, summary: '' }),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../lib/artifact-tools.js');
  });

  it('an agent that returns NO verdict yields a row whose metadata.original_verdict is the sentinel', async () => {
    const { storeSubAgentResults, ABSENT_VERDICT } = await import('../../lib/sub-agent-executor/results-storage.js');

    await storeSubAgentResults('TESTING', 'SD-TEST-ABSENT-001', null, { confidence: 90 }, { phase: 'EXEC' });

    expect(rows).toHaveLength(1);
    const meta = rows[0].metadata;
    // THE ASSERTION THAT WAS MISSING. Replacing ABSENT_VERDICT with `undefined` in the
    // writer makes original_verdict vanish from the JSON — and a MISSING key is
    // indistinguishable from a row written by one of the other paths that never touch
    // this writer. That ambiguity produced a "45% of the table is unauditable" reading
    // during this SD's own investigation, wrong by ~12,400 rows.
    expect(Object.prototype.hasOwnProperty.call(meta, 'original_verdict')).toBe(true);
    expect(meta.original_verdict).toBe(ABSENT_VERDICT);
    expect(meta.original_verdict).not.toBeUndefined();
  });

  it('a verdict-less result still stores a REJECTING verdict — absence must not mean accepted', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-ABSENT-002', null, { confidence: 90 }, { phase: 'EXEC' });
    // 15 live rows sat in exactly this state, stored as accepting WARNING.
    expect(rows[0].verdict).toBe('ERROR');
  });

  it('OPPOSITE POLARITY: a real verdict is recorded verbatim, not overwritten by the sentinel', async () => {
    const { storeSubAgentResults, ABSENT_VERDICT } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-PRESENT-001', null, { verdict: 'PASS', confidence: 90 }, { phase: 'EXEC' });
    expect(rows[0].metadata.original_verdict).toBe('PASS');
    expect(rows[0].metadata.original_verdict).not.toBe(ABSENT_VERDICT);
    expect(rows[0].verdict).toBe('PASS');
  });

  it('an UNMODELLED verdict is preserved verbatim in metadata while the column rejects', async () => {
    const { storeSubAgentResults } = await import('../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-UNMODELLED-001', null, { verdict: 'HIGH', confidence: 90 }, { phase: 'EXEC' });
    // The whole reason the defect was measurable at all is that the raw input survives.
    expect(rows[0].metadata.original_verdict).toBe('HIGH');
    expect(rows[0].verdict).toBe('ERROR');
  });
});
