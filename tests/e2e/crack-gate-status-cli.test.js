/**
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-8 (TS-8) — check-gate-attestation-status.mjs CLI
 * exit-code contract. Pins the exit-code correctness this repo's own check-bind-criteria.mjs
 * CLI is known to lack (it exits 0 on a FAIL verdict).
 */
import { describe, it, expect, vi } from 'vitest';
import { main, PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES } from '../../scripts/eva/check-gate-attestation-status.mjs';
import { evaluateCrackGateCriterion } from '../../lib/eva/lifecycle/crack-gate-criterion.js';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

function chainable(result) {
  const node = { select: () => node, eq: () => node, order: () => node, limit: () => node, maybeSingle: () => Promise.resolve(result) };
  return node;
}

function makeSupabase({ pbnRow, attestationRow = null } = {}) {
  return {
    rpc: vi.fn(() => Promise.resolve({ data: pbnRow ? [pbnRow] : [], error: null })),
    from: vi.fn((table) => {
      if (table === 'v_venture_gate_attestations_latest') return chainable({ data: attestationRow, error: null });
      throw new Error(`unmocked table: ${table}`);
    }),
  };
}

const PASS_ROW = { verdict: 'PASS', attested_by: 'a', produced_by: 'b', subject_ref: 'r', citation: 'c', path_to_pass: 'p', computed_at: '2026-08-17T00:00:00Z' };

describe('check-gate-attestation-status.mjs single-venture mode', () => {
  it('TS-8: exits 0 when overall=MEETS_CRITERION', async () => {
    const supabase = makeSupabase({ pbnRow: { status: 'PBN_SCORED', verdict: 'PASS', source: 'x', reason: 'ok', degraded: false }, attestationRow: PASS_ROW });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', VENTURE_ID], { supabase });
    expect(result.exitCode).toBe(0);
    logSpy.mockRestore();
  });

  it('TS-8: exits 1 (not 0) when overall=NOT_MET — this repo\'s own check-bind-criteria.mjs is known to exit 0 here', async () => {
    const supabase = makeSupabase({ pbnRow: { status: 'PBN_NOT_SCORED', verdict: null, source: 'none', reason: 'legit', degraded: false }, attestationRow: null });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', VENTURE_ID], { supabase });
    expect(result.exitCode).toBe(1);
    logSpy.mockRestore();
  });

  it('F5 fix (post-merge TESTING finding): exits 2, not 1, when a source is unavailable and overall != MEETS_CRITERION — asymmetric with the sibling record-CLI test file (crack-gate-record-cli.test.js), which already covered its own exit-2 path', async () => {
    const supabase = {
      rpc: vi.fn(() => Promise.resolve({ data: [{ status: 'PBN_NOT_SCORED', verdict: null, source: 'none', reason: 'legit', degraded: false }], error: null })),
      from: vi.fn((table) => {
        if (table === 'v_venture_gate_attestations_latest') return chainable({ data: null, error: { code: 'PGRST205', message: 'schema cache miss' } });
        throw new Error(`unmocked table: ${table}`);
      }),
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', VENTURE_ID], { supabase });
    expect(result.exitCode).toBe(2);
    logSpy.mockRestore();
  });

  it('--json prints valid, parseable JSON matching the evaluator verdict shape', async () => {
    const supabase = makeSupabase({ pbnRow: { status: 'PBN_SCORED', verdict: 'PASS', source: 'x', reason: 'ok', degraded: false }, attestationRow: PASS_ROW });
    let printed = '';
    const logSpy = vi.spyOn(console, 'log').mockImplementation((s) => { printed += s; });
    await main(['node', 's', VENTURE_ID, '--json'], { supabase });
    const parsed = JSON.parse(printed);
    expect(parsed.overall).toBe('MEETS_CRITERION');
    logSpy.mockRestore();
  });
});

describe('check-gate-attestation-status.mjs --fleet-summary mode', () => {
  /**
   * The CLI reads the most recent PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES rows via a single
   * .order().limit(N) query (a sliding window) — NOT the paginated fetch-everything shape this
   * mock originally simulated. `rows` should already be ordered newest-first, matching what a
   * real .order('created_at', {ascending:false}).limit(N) query returns.
   */
  // SD-LEO-INFRA-ARM-BINDING-EXIT-001 FR-1/FR-4: reportFleetSummary() now ALSO issues an
  // unbounded system_events fetch (.range(), via fetchAllPaginated) and two substrate-signal
  // reads (venture_gate_attestations, venture_nursery) alongside the existing 5-row-window
  // query below. Extended here (mock ROBUSTNESS, not assertions) so every existing test in
  // this describe block keeps passing unchanged -- serving healthy/neutral data for the new
  // reads has zero effect on any existing assertion, since the exit code stays governed
  // exclusively by the 5-row-window cleanRun logic (see check-gate-attestation-status.mjs).
  function makeWindowedSupabase(rows) {
    return {
      from: vi.fn((table) => {
        if (table === 'system_events') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
                }),
                range: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          };
        }
        if (table === 'venture_gate_attestations') return { select: () => Promise.resolve({ count: 1, error: null }) };
        if (table === 'venture_nursery') return { select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
        throw new Error(`unmocked table: ${table}`);
      }),
    };
  }

  it('reports promotion_ready=false when fewer than the minimum consecutive clean cycles exist', async () => {
    const supabase = makeWindowedSupabase([{ payload: { would_block: false } }]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', '--fleet-summary'], { supabase });
    expect(result.exitCode).toBe(1);
    logSpy.mockRestore();
  });

  it('reports promotion_ready=true once the minimum clean-cycle count is met with zero would_block rows', async () => {
    const rows = Array.from({ length: PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES }, () => ({ payload: { would_block: false } }));
    const supabase = makeWindowedSupabase(rows);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', '--fleet-summary'], { supabase });
    expect(result.exitCode).toBe(0);
    logSpy.mockRestore();
  });

  it('a would_block row INSIDE the recent window keeps promotion_ready=false even with enough total rows', async () => {
    const rows = [
      { payload: { would_block: true } }, // most recent (newest-first) — inside the window
      ...Array.from({ length: PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES - 1 }, () => ({ payload: { would_block: false } })),
    ];
    const supabase = makeWindowedSupabase(rows);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', '--fleet-summary'], { supabase });
    expect(result.exitCode).toBe(1);
    logSpy.mockRestore();
  });

  it('ADVERSARIAL REVIEW FIX (PR2): a would_block row OUTSIDE the recent window (aged out by newer clean cycles) no longer blocks promotion_ready forever', async () => {
    // Newest-first: N clean rows, THEN one old would_block row beyond the window boundary.
    // The old bug read unbounded history and would have failed this case indefinitely; the
    // fixed sliding-window read must only look at the first PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES.
    const rows = [
      ...Array.from({ length: PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES }, () => ({ payload: { would_block: false } })),
      { payload: { would_block: true } }, // old failure, now outside the window
    ];
    const supabase = makeWindowedSupabase(rows);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', '--fleet-summary'], { supabase });
    expect(result.exitCode).toBe(0);
    logSpy.mockRestore();
  });

  it('documents PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES as a real, non-zero threshold (not left as a TODO)', () => {
    expect(PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES).toBeGreaterThan(0);
  });

  it('F5 fix (post-merge TESTING finding): exits 2 when system_events is unreadable (table not yet applied)', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'schema cache miss' } }),
            }),
          }),
        }),
      })),
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await main(['node', 's', '--fleet-summary'], { supabase });
    expect(result.exitCode).toBe(2);
    logSpy.mockRestore();
  });

  it('TS-2/TS-6: additive fields report the TRUE unbounded count/span/criterion, independently re-derived (not hardcoded), while observations_in_window stays min(N,5) unchanged', async () => {
    const allRows = [
      { payload: { source: 'sweep' }, created_at: '2026-08-01T00:00:00Z' },
      { payload: { source: 'sweep' }, created_at: '2026-08-01T12:00:00Z' },
      { payload: { source: 'publish_gate' }, created_at: '2026-08-02T00:00:00Z' },
    ];
    const supabase = makeWindowedSupabase(allRows);
    let printed = '';
    const logSpy = vi.spyOn(console, 'log').mockImplementation((s) => { printed += s; });
    await main(['node', 's', '--fleet-summary', '--json'], { supabase });
    logSpy.mockRestore();
    const summary = JSON.parse(printed);

    // Independently re-derive the expected verdict from the SAME rows/signals rather than
    // hardcoding an expected value -- the live CLI's math must match the pure evaluator's math.
    const expected = evaluateCrackGateCriterion(allRows, { attestationRowCount: 1, pbnAvailable: true });
    expect(summary.total_observations_all_time).toBe(expected.row_count);
    expect(summary.evidence_span_hours).toBeCloseTo(expected.span_hours, 2);
    expect(summary.crack_gate_evidence_criterion.verdict).toBe(expected.verdict);
    expect(summary.crack_gate_evidence_criterion.reason).toBe(expected.reason);
    expect(summary.source_breakdown).toEqual(expected.source_breakdown);
    expect(summary.observations_in_window).toBe(Math.min(allRows.length, PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES));
  });

  it('TS-8: a substrate-signal query failure surfaces as exit code 2, not a false verdict -- the existing 5-row-window path is unaffected by this new failure mode existing at all', async () => {
    const rows = Array.from({ length: PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES }, () => ({ payload: { would_block: false }, created_at: '2026-08-01T00:00:00Z' }));
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'system_events') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }) }),
                range: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          };
        }
        if (table === 'venture_gate_attestations') return { select: () => Promise.resolve({ count: null, error: { message: 'connection reset' } }) };
        if (table === 'venture_nursery') return { select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
        throw new Error(`unmocked table: ${table}`);
      }),
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await main(['node', 's', '--fleet-summary'], { supabase });
    expect(result.exitCode).toBe(2);
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
