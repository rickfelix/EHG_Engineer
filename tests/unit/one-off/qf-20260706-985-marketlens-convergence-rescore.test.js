/**
 * Unit test for the QF-20260706-985 manual convergence-rescore invoker. Mocked
 * runConvergenceLoop — no live DB access. The actual live rescore already ran once
 * (recorded in the QF completion notes / coordinator signal): status=ESCALATED,
 * mean=3.5 vs mean_floor=4, zero routable per-dimension gaps (all at-or-above floor),
 * ready for chairman disposition.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/eva/convergence-loop.js', () => ({
  runConvergenceLoop: vi.fn().mockResolvedValue({ status: 'ESCALATED', cycles: 2, scoreResult: { mean: 3.5, pass: false } }),
}));

import { main, VENTURE_ID } from '../../../scripts/one-off/qf-20260706-985-marketlens-convergence-rescore.mjs';
import { runConvergenceLoop } from '../../../lib/eva/convergence-loop.js';

describe('QF-20260706-985: main()', () => {
  it('invokes runConvergenceLoop for the MarketLens venture and returns its result verbatim', async () => {
    const supabase = {};
    const result = await main(supabase);
    expect(runConvergenceLoop).toHaveBeenCalledWith(supabase, { ventureId: VENTURE_ID });
    expect(result).toEqual({ status: 'ESCALATED', cycles: 2, scoreResult: { mean: 3.5, pass: false } });
  });

  it('never injects backfillFn/createQuickFixFn/createSdFn (rescore-and-report only, no auto-remediation)', async () => {
    await main({});
    const callArgs = runConvergenceLoop.mock.calls.at(-1)[1];
    expect(callArgs.backfillFn).toBeUndefined();
    expect(callArgs.createQuickFixFn).toBeUndefined();
    expect(callArgs.createSdFn).toBeUndefined();
  });
});
