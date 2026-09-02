/**
 * QF-20260902-939 — releaseExpiredQuietHourHold: the flush for a hold_reason='quiet_hour' row.
 * Keyed on hold_expires_at ONLY (no Solomon verdict is ever sought for this lane), unlike
 * releaseHeldSend (chairman-held-send-release.test.js), which is the consult-verdict lane and is
 * untouched by this QF.
 */
import { describe, it, expect, vi } from 'vitest';
import { releaseExpiredQuietHourHold } from '../../../lib/adam/chairman-held-send-release.js';

function quietHourRow(overrides = {}) {
  return {
    id: 'qh-1',
    hold_reason: 'quiet_hour',
    hold_expires_at: '2026-09-02T10:00:00.000Z',
    chairman_user_id: 'u-1',
    chairman_email: 'chairman@example.com',
    recipient_phone: '+15551234567',
    decision_id: 'dec-qh-1',
    subject: '[CHAIRMAN SMS]',
    body: 'Approve the deploy?',
    options: ['A', 'B'],
    sender_callsign: 'Adam',
    session_id: 'chairman-lane-automated',
    attempts: 0,
    ...overrides,
  };
}

/** Minimal fake supabase covering the claim / unclaim / terminal-release update shapes. */
function makeFakeSupabase({ claimSucceeds = true, unclaimMatches = true } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table !== 'chairman_held_sends') throw new Error(`unexpected table: ${table}`);
      return {
        update(vals) {
          const filters = [];
          const isClaim = vals.status === 'releasing';
          const builder = {
            eq(col, val) { filters.push([col, val]); return builder; },
            is(col, val) { filters.push([col, val]); return builder; },
            select() {
              writes.push({ vals, filters, terminal: 'select' });
              if (isClaim) {
                return { maybeSingle: async () => (claimSucceeds ? { data: { id: 'qh-1' }, error: null } : { data: null, error: null }) };
              }
              return { maybeSingle: async () => (unclaimMatches ? { data: { id: 'qh-1' }, error: null } : { data: null, error: null }) };
            },
            then(resolve, reject) {
              writes.push({ vals, filters, terminal: 'thenable' });
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
}

describe('releaseExpiredQuietHourHold (QF-20260902-939) — flush releases ONLY expired holds', () => {
  it('does NOT claim or dispatch a hold whose hold_expires_at is still in the future', async () => {
    const supabase = makeFakeSupabase();
    const sendChairmanSMS = vi.fn();
    const row = quietHourRow({ hold_expires_at: '2099-01-01T00:00:00.000Z' });

    const outcome = await releaseExpiredQuietHourHold(supabase, row, {
      sendChairmanSMS, context: { now: Date.parse('2026-09-02T05:00:00.000Z') },
    });

    expect(outcome).toMatchObject({ action: 'skip', reason: 'not_yet_expired', heldSendId: 'qh-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
    expect(supabase.writes).toHaveLength(0);
  });

  it('claims, dispatches, and marks status=expired (citation-free) once hold_expires_at has passed', async () => {
    const supabase = makeFakeSupabase();
    const sendChairmanSMS = vi.fn().mockResolvedValue({ sent: true, sid: 'SM123' });
    const row = quietHourRow({ hold_expires_at: '2026-09-02T09:00:00.000Z' });

    const outcome = await releaseExpiredQuietHourHold(supabase, row, {
      sendChairmanSMS, context: { now: Date.parse('2026-09-02T10:00:00.000Z') },
    });

    expect(outcome).toMatchObject({ action: 'released', heldSendId: 'qh-1' });
    expect(sendChairmanSMS).toHaveBeenCalledTimes(1);
    const [dispatchedMessage, sentContext, sentOpts] = sendChairmanSMS.mock.calls[0];
    expect(dispatchedMessage.decisionId).toBe('dec-qh-1');
    // The window this hold was queued FOR has now passed -- must not re-block on the same check.
    expect(sentContext.allowQuietHours).toBe(true);
    // heldRow.body was already fully composed once, before the hold was written.
    expect(sentOpts.skipCompose).toBe(true);

    const claimWrite = supabase.writes.find((w) => w.vals.status === 'releasing');
    expect(claimWrite).toBeTruthy();
    const releaseWrite = supabase.writes.find((w) => w.vals.status === 'expired');
    expect(releaseWrite).toBeTruthy();
    expect(releaseWrite.vals.release_disposition).toBe('send');
    // No Solomon verdict was ever sought for this lane -- there is nothing to cite (and citing one
    // would violate chairman_held_sends_released_requires_citation_check if status were 'released').
    expect(releaseWrite.vals.release_verdict_answer_row_id).toBeUndefined();
  });

  it('skips a row another sweep run already claimed (claim predicate matches nothing)', async () => {
    const supabase = makeFakeSupabase({ claimSucceeds: false });
    const sendChairmanSMS = vi.fn();
    const row = quietHourRow({ hold_expires_at: '2026-09-02T09:00:00.000Z' });

    const outcome = await releaseExpiredQuietHourHold(supabase, row, {
      sendChairmanSMS, context: { now: Date.parse('2026-09-02T10:00:00.000Z') },
    });

    expect(outcome).toMatchObject({ action: 'skip', reason: 'claim_failed_or_already_claimed' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('unclaims back to held (attempts incremented) when dispatch does not report sent:true, so a later sweep can retry', async () => {
    const supabase = makeFakeSupabase();
    const sendChairmanSMS = vi.fn().mockResolvedValue({ sent: false, reason: 'blocked' });
    const row = quietHourRow({ hold_expires_at: '2026-09-02T09:00:00.000Z', attempts: 2 });

    const outcome = await releaseExpiredQuietHourHold(supabase, row, {
      sendChairmanSMS, context: { now: Date.parse('2026-09-02T10:00:00.000Z') },
    });

    expect(outcome.action).toBe('dispatch_not_sent_unclaimed');
    const unclaimWrite = supabase.writes.find((w) => w.vals.status === 'held');
    expect(unclaimWrite.vals.attempts).toBe(3);
  });
});
