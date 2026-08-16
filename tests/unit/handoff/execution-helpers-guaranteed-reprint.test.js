/**
 * Unit tests for runWithGuaranteedReprint (SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001, FR-3).
 *
 * TESTING sub-agent (PLAN-phase review, evidence 0d731625-a720-4978-b69c-7607d9a20ca9) found
 * handleExecuteCommand is called via bare lexical intra-module reference at 5 sites inside
 * cli-main.js -- vi.mock cannot intercept a same-module direct call. Precedent proves the trap
 * already existed live: tests/unit/handoff/standalone-sd-chaining.test.js claims to test "the
 * chaining logic in cli-main.js" but never imports that file at all -- it tests the pickers.
 *
 * runWithGuaranteedReprint is extracted specifically so the REPRINT GUARANTEE (try/finally)
 * is unit-testable by injecting a FAKE body/reprintFn -- neither test below calls or mocks
 * handleExecuteCommand, cli-main.js, or anything DB-related. This proves the seam's own
 * control-flow contract in isolation, independent of the real cascade domain logic.
 */

import { describe, it, expect, vi } from 'vitest';
import { runWithGuaranteedReprint } from '../../../scripts/modules/handoff/cli/execution-helpers.js';

describe('runWithGuaranteedReprint (FR-3) — the guarantee itself, no handleExecuteCommand involved', () => {
  it('TS-4 — reprintFn fires when body throws, and the throw still propagates to the caller', async () => {
    const reprintFn = vi.fn().mockResolvedValue(undefined);
    const body = vi.fn().mockRejectedValue(new Error('body blew up'));

    await expect(runWithGuaranteedReprint(body, reprintFn)).rejects.toThrow('body blew up');
    expect(reprintFn, 'the finally block must run even though body threw').toHaveBeenCalledTimes(1);
  });

  it('TS-5 — reprintFn fires when body returns early (models the parallelExecution early return), and the value passes through', async () => {
    const reprintFn = vi.fn().mockResolvedValue(undefined);
    // Models cli-main.js's parallelExecution branch: a `return` statement fired from deep
    // inside the loop body, well before the loop's own natural end.
    const body = vi.fn(async () => {
      if (true) {
        return { success: true, parallelExecution: { teamName: 'fake-team' } };
      }
      throw new Error('unreachable');
    });

    const result = await runWithGuaranteedReprint(body, reprintFn);

    expect(result).toEqual({ success: true, parallelExecution: { teamName: 'fake-team' } });
    expect(reprintFn, 'the finally block must run on an early return, not just normal completion').toHaveBeenCalledTimes(1);
  });

  it('reprintFn fires exactly once on normal completion, and the return value passes through unchanged', async () => {
    const reprintFn = vi.fn().mockResolvedValue(undefined);
    const body = vi.fn().mockResolvedValue({ success: true, sdId: 'SD-FAKE-001' });

    const result = await runWithGuaranteedReprint(body, reprintFn);

    expect(result).toEqual({ success: true, sdId: 'SD-FAKE-001' });
    expect(reprintFn).toHaveBeenCalledTimes(1);
  });

  it('[MUTATION GUARD] a reprintFn that itself throws does not silently swallow -- it propagates (documents current behavior, not a requirement to catch it internally)', async () => {
    const reprintFn = vi.fn().mockRejectedValue(new Error('reprint blew up'));
    const body = vi.fn().mockResolvedValue({ success: true });

    await expect(runWithGuaranteedReprint(body, reprintFn)).rejects.toThrow('reprint blew up');
  });

  it('reprintFn still fires when BOTH body throws and would otherwise be the only visible error -- body error wins (standard JS finally-throw-in-finally semantics), reprintFn was still invoked', async () => {
    const reprintFn = vi.fn().mockResolvedValue(undefined);
    const body = vi.fn().mockRejectedValue(new Error('primary failure'));

    await expect(runWithGuaranteedReprint(body, reprintFn)).rejects.toThrow('primary failure');
    expect(reprintFn).toHaveBeenCalledTimes(1);
  });
});
