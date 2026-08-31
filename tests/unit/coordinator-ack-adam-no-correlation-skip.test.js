/**
 * QF-20260811-526 (superseded by QF-20260831-605) — a no-correlation advisory must never stay
 * pending forever via --reply, AND its reply body must never be silently discarded.
 *
 * QF-20260811-526 fixed the first half: correlationId-missing used to process.exit(1) BEFORE
 * main() reached Stage 2 (stampActionedGroup), leaving the advisory unactioned forever. The fix
 * WARNED and returned { skipped: true }, which stopped the hang but discarded the reply body —
 * the coordinator believed it had answered while the substance landed nowhere (measured live:
 * coordinator report 2026-08-31, reply to 187f7922 dropped, content had to be re-sent on the
 * directive lane; also self-reported at 9c514954). Third instance of the QF-084
 * retirement-predicate family.
 *
 * QF-20260831-605 closes that: a missing correlation_id now WARNS (still non-fatal) and sends
 * the reply as a directed session_coordination row (correlation_id: null in the payload — not
 * matchable to a specific await, but addressable and never dropped) instead of skipping the send.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { deliverReplyOrExit } = require_('../../scripts/coordinator-ack-adam.cjs');

const LIVE_ADAM = '11111111-1111-4111-8111-111111111111';

/** Minimal fake supabase satisfying resolveAdamReplyTarget's claude_sessions election query
 *  (fetchAllPaginated: select/gte/or/filter/order chain terminated by .range()) and
 *  sendCoordinatorReply + verifyReplyDelivered's session_coordination insert/select. */
function makeFakeSupabase() {
  let inserted = null;
  const chain = (rangeResult) => {
    const api = {
      select: () => api, gte: () => api, or: () => api, filter: () => api, order: () => api, eq: () => api,
      insert: (row) => { inserted = { id: 'reply-row-1', created_at: new Date().toISOString(), ...row }; return api; },
      range: async () => rangeResult,
      single: async () => ({ data: inserted, error: null }),
      maybeSingle: async () => ({ data: inserted ? { id: inserted.id } : null, error: null }),
    };
    return api;
  };
  return {
    from(table) {
      if (table === 'claude_sessions') {
        return chain({ data: [{ session_id: LIVE_ADAM, heartbeat_at: new Date().toISOString(), metadata: { role: 'adam' } }], error: null });
      }
      return chain({ data: [], error: null });
    },
  };
}

describe('deliverReplyOrExit: no payload.correlation_id (QF-20260811-526, superseded by QF-20260831-605)', () => {
  it('[SPECIMEN] sends the reply as a directed row instead of skipping it', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should NOT be called for a missing correlation_id');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adv = { id: 'adv-1', sender_session: null, payload: {} };
    const result = await deliverReplyOrExit(
      makeFakeSupabase(),
      { adv, replyBody: 'some reply body', coordinatorSession: 'coord-session-1' }
    );

    expect(exitSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ replyId: 'reply-row-1', adamSession: LIVE_ADAM, correlationId: undefined });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('correlation_id'));

    exitSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('also sends (not exits) when payload is entirely absent, resolving through a live Adam target', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should NOT be called');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adv = { id: 'adv-2', sender_session: 'adam-coordinator-health-cron', payload: null };
    const result = await deliverReplyOrExit(
      makeFakeSupabase(),
      { adv, replyBody: 'body', coordinatorSession: 'coord-session-1' }
    );

    expect(exitSpy).not.toHaveBeenCalled();
    expect(result.replyId).toBe('reply-row-1');
    expect(result.adamSession).toBe(LIVE_ADAM);

    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('REGRESSION CONTROL: still exits (never silently skips) when --reply has no body at all', async () => {
    // Distinguishes "nothing to reply to" (this QF's fix) from "caller misused --reply"
    // (unchanged, still fatal) — the two must not collapse into the same non-fatal path.
    vi.spyOn(process, 'exit').mockImplementation((code) => {
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
