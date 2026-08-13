/**
 * QF-20260811-526 — a no-correlation advisory must never stay pending forever via --reply.
 *
 * deliverReplyOrExit used to process.exit(1) when the advisory carried no
 * payload.correlation_id, and that exit happened BEFORE main() reached Stage 2
 * (stampActionedGroup) — so a --reply attempt against a non-replyable advisory
 * silently left it unactioned forever. Worker signal a6067eb7 (sender c14a87ec)
 * measured three coordinator-health probes hitting exactly this, deliberately
 * excluded from the single-purpose QF-20260728-468/PR #6977.
 *
 * Fix: correlationId-missing now WARNS and returns { skipped: true, reason }
 * instead of exiting, so main() falls through to Stage 2 regardless.
 *
 * Test strategy: deliverReplyOrExit's correlationId-missing branch returns
 * before touching supabase at all (it's checked before resolveAdamReplyTarget/
 * sendCoordinatorReply), so it's directly callable with a minimal fake advisory
 * and no live DB — no need for the source-text-inspection style the sibling
 * suite (coordinator-ack-adam-reply-ordering.test.js) uses for paths that
 * genuinely require a live coordinator/Adam session. The "Stage 2 still runs"
 * half of the contract IS asserted via source order there — this file adds the
 * direct behavioral proof for the specific branch this QF changes.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { deliverReplyOrExit } = require_('../../scripts/coordinator-ack-adam.cjs');

describe('deliverReplyOrExit: no payload.correlation_id (QF-20260811-526)', () => {
  it('returns { skipped: true } instead of exiting the process', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should NOT be called for a missing correlation_id');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adv = { id: 'adv-1', sender_session: null, payload: {} };
    const result = await deliverReplyOrExit(
      /* supabase */ {},
      { adv, replyBody: 'some reply body', coordinatorSession: 'coord-session-1' }
    );

    expect(exitSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true, reason: 'no_correlation_id' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('correlation_id'));

    exitSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('also skips (not exits) when payload is entirely absent', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should NOT be called');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adv = { id: 'adv-2', sender_session: 'adam-coordinator-health-cron', payload: null };
    const result = await deliverReplyOrExit(
      {},
      { adv, replyBody: 'body', coordinatorSession: 'coord-session-1' }
    );

    expect(exitSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true, reason: 'no_correlation_id' });

    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('REGRESSION CONTROL: still exits (never silently skips) when --reply has no body at all', async () => {
    // Distinguishes "nothing to reply to" (this QF's fix) from "caller misused --reply"
    // (unchanged, still fatal) — the two must not collapse into the same non-fatal path.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`EXIT:${code}`);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const adv = { id: 'adv-3', sender_session: null, payload: { correlation_id: 'corr-1' } };
    await expect(
      deliverReplyOrExit({}, { adv, replyBody: '', coordinatorSession: 'coord-session-1' })
    ).rejects.toThrow('EXIT:2');

    vi.restoreAllMocks();
  });
});
