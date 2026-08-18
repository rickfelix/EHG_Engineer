/**
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-8 (TS-8) — check-gate-attestation-status.mjs CLI
 * exit-code contract. Pins the exit-code correctness this repo's own check-bind-criteria.mjs
 * CLI is known to lack (it exits 0 on a FAIL verdict).
 */
import { describe, it, expect, vi } from 'vitest';
import { main, PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES } from '../../scripts/eva/check-gate-attestation-status.mjs';

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
  function makeWindowedSupabase(rows) {
    return {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
            }),
          }),
        }),
      })),
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
});
