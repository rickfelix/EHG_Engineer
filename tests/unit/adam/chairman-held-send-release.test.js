/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 FR-6 — governed release mechanism for held chairman
 * decision sends. Covers the three mandated refusal cases (unanswered, self-answered, not-found)
 * plus a successful release, and the pure decideRelease() core in isolation.
 */
import { describe, it, expect, vi } from 'vitest';
import { decideRelease, checkSelfAnswered, releaseHeldSend } from '../../../lib/adam/chairman-held-send-release.js';

function heldRow(overrides = {}) {
  return {
    id: 'held-1',
    consult_correlation_id: 'corr-1',
    chairman_user_id: 'u-1',
    chairman_email: 'chairman@example.com',
    recipient_phone: '+15551234567',
    decision_id: 'dec-1',
    subject: '[CHAIRMAN SMS]',
    body: 'Approve the deploy?',
    options: ['A', 'B'],
    sender_callsign: 'Adam',
    session_id: 'adam-session-1',
    ...overrides,
  };
}

/**
 * Minimal fake supabase supporting the .from('session_coordination')/.from('chairman_held_sends')
 * shapes this module needs. The chairman_held_sends `.update()` builder is a GENUINELY thenable
 * object (a real .then(resolve,reject), not an object that merely LOOKS like the real chain) --
 * a TESTING sub-agent (evidence 9cc5057d) found the prior version's non-thenable update() chain
 * made `await` resolve to the raw builder object, so `error` always destructured to undefined and
 * the audit-write-failure path was structurally unreachable. `writes` records every update call
 * (vals + filters) so tests can assert exactly what was persisted, not just the returned outcome.
 */
function makeFakeSupabase({ selfAnswerRow = null, claimSucceeds = true, releaseUpdateError = null } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table === 'session_coordination') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: async () => ({ data: selfAnswerRow ? [selfAnswerRow] : [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'chairman_held_sends') {
        return {
          update(vals) {
            const filters = [];
            const builder = {
              eq(col, val) { filters.push([col, val]); return builder; },
              is(col, val) { filters.push([col, val]); return builder; },
              // CLAIM shape only: .update().eq().eq().is().select()
              select() {
                writes.push({ vals, filters, terminal: 'select' });
                return Promise.resolve(claimSucceeds ? { data: [{ id: 'held-1' }], error: null } : { data: [], error: null });
              },
              // RELEASE / UNCLAIM shape: .update().eq()... with no .select() -- must be a REAL
              // thenable so `await builder` actually awaits this resolution.
              then(resolve, reject) {
                writes.push({ vals, filters, terminal: 'thenable' });
                const result = releaseUpdateError ? { data: null, error: { message: releaseUpdateError } } : { data: null, error: null };
                return Promise.resolve(result).then(resolve, reject);
              },
            };
            return builder;
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('decideRelease (pure core)', () => {
  it('TS-a: no answer payload -> hold, unanswered', () => {
    expect(decideRelease(null, { answerRowId: null, selfAnswered: false })).toEqual({ action: 'hold', reason: 'unanswered' });
  });

  it('TS-b: self-answered -> refuse', () => {
    expect(decideRelease({ body: 'looks good' }, { answerRowId: 'ans-1', selfAnswered: true }))
      .toEqual({ action: 'refuse', reason: 'self_answered', answerRowId: 'ans-1' });
  });

  it('TS-c: answer payload present but the row could not be independently confirmed -> refuse (fail closed)', () => {
    expect(decideRelease({ body: 'looks good' }, { answerRowId: null, selfAnswered: false }))
      .toEqual({ action: 'refuse', reason: 'answer_row_unconfirmed' });
  });

  it('TS-d: confirmed, non-self answer -> release, with verdict extracted from body or verdict field', () => {
    expect(decideRelease({ body: 'GO' }, { answerRowId: 'ans-2', selfAnswered: false }))
      .toEqual({ action: 'release', reason: 'verdict_cited', answerRowId: 'ans-2', verdict: 'GO' });
    expect(decideRelease({ verdict: 'GO-2' }, { answerRowId: 'ans-3', selfAnswered: false }))
      .toEqual({ action: 'release', reason: 'verdict_cited', answerRowId: 'ans-3', verdict: 'GO-2' });
  });
});

describe('checkSelfAnswered', () => {
  it('reports selfAnswered=true when the answering row\'s sender_session matches the asker', async () => {
    const supabase = makeFakeSupabase({ selfAnswerRow: { id: 'ans-1', sender_session: 'adam-session-1' } });
    const result = await checkSelfAnswered(supabase, 'corr-1', 'adam-session-1');
    expect(result).toEqual({ answerRowId: 'ans-1', selfAnswered: true });
  });

  it('reports selfAnswered=false for a genuinely different answering session', async () => {
    const supabase = makeFakeSupabase({ selfAnswerRow: { id: 'ans-1', sender_session: 'solomon-session-1' } });
    const result = await checkSelfAnswered(supabase, 'corr-1', 'adam-session-1');
    expect(result).toEqual({ answerRowId: 'ans-1', selfAnswered: false });
  });

  it('reports answerRowId=null when no matching row exists', async () => {
    const supabase = makeFakeSupabase({ selfAnswerRow: null });
    const result = await checkSelfAnswered(supabase, 'corr-1', 'adam-session-1');
    expect(result).toEqual({ answerRowId: null, selfAnswered: false });
  });
});

describe('releaseHeldSend — FR-6 AC-1: three mandated refusal cases + success', () => {
  it('REFUSAL 1 (unanswered): no answer resolved for the correlation -> action=hold, never dispatches', async () => {
    const resolveAnswerRows = vi.fn(async () => new Map());
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveAnswerRows, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'hold', reason: 'unanswered', heldSendId: 'held-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('REFUSAL 2 (self-answered): the asking session also answered -> action=refuse, never dispatches', async () => {
    const resolveAnswerRows = vi.fn(async () => new Map([['corr-1', { body: 'GO' }]]));
    const checkSelfAnsweredFn = vi.fn(async () => ({ answerRowId: 'ans-1', selfAnswered: true }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveAnswerRows, checkSelfAnswered: checkSelfAnsweredFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'refuse', reason: 'self_answered', heldSendId: 'held-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('REFUSAL 3 (not-found): the held row carries no consult correlation at all -> action=skip, never dispatches', async () => {
    const resolveAnswerRows = vi.fn();
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow({ consult_correlation_id: null }), { resolveAnswerRows, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'skip', reason: 'no_consult_anchor', heldSendId: 'held-1' });
    expect(resolveAnswerRows).not.toHaveBeenCalled();
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('SUCCESS: a confirmed, non-self-answered verdict releases, cites the answer row, and dispatches via sendChairmanSMS with the independently-verified verdict injected', async () => {
    const resolveAnswerRows = vi.fn(async () => new Map([['corr-1', { body: 'GO' }]]));
    const checkSelfAnsweredFn = vi.fn(async () => ({ answerRowId: 'ans-9', selfAnswered: false }));
    const sendChairmanSMS = vi.fn(async (message, context, opts) => {
      // The caller injects the seam; simulate the gate accepting the injected verdict and sending.
      const outcome = await opts.runPreSendConsultLane();
      expect(outcome.verdict).toBe('GO');
      return { sent: true, sid: 'SM-released-1' };
    });
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveAnswerRows, checkSelfAnswered: checkSelfAnsweredFn, sendChairmanSMS });
    expect(outcome.action).toBe('released');
    expect(outcome.answerRowId).toBe('ans-9');
    expect(outcome.sendResult).toEqual({ sent: true, sid: 'SM-released-1' });
    expect(sendChairmanSMS).toHaveBeenCalledTimes(1);
    const [message] = sendChairmanSMS.mock.calls[0];
    expect(message).toMatchObject({ type: 'decision', decisionId: 'dec-1', chairmanUserId: 'u-1' });
  });

  it('a claim race (another sweep run already claimed the row) skips without dispatching', async () => {
    const resolveAnswerRows = vi.fn(async () => new Map([['corr-1', { body: 'GO' }]]));
    const checkSelfAnsweredFn = vi.fn(async () => ({ answerRowId: 'ans-9', selfAnswered: false }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase({ claimSucceeds: false });
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveAnswerRows, checkSelfAnswered: checkSelfAnsweredFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'skip', reason: 'claim_failed_or_already_claimed' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('D1 (TESTING sub-agent evidence 9cc5057d, HIGH): a claimed row whose dispatch did NOT succeed (sendResult.sent !== true) is NEVER marked released -- it is unclaimed back to held for retry', async () => {
    const resolveAnswerRows = vi.fn(async () => new Map([['corr-1', { body: 'GO' }]]));
    const checkSelfAnsweredFn = vi.fn(async () => ({ answerRowId: 'ans-9', selfAnswered: false }));
    // sendChairmanSMS's own over-ask/rubric/quiet-hours/transport gates can all return sent:false
    // even after the injected verdict is accepted -- this is one representative shape.
    const sendChairmanSMS = vi.fn(async () => ({ sent: false, held: true, reason: 'over_ask_held' }));
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveAnswerRows, checkSelfAnswered: checkSelfAnsweredFn, sendChairmanSMS });
    expect(outcome.action).toBe('dispatch_not_sent_unclaimed');
    expect(outcome.sendResult).toEqual({ sent: false, held: true, reason: 'over_ask_held' });
    // Never wrote status='released' anywhere -- the only chairman_held_sends write is the unclaim.
    const finalWrite = supabase.writes[supabase.writes.length - 1];
    expect(finalWrite.vals.status).toBe('held');
    expect(finalWrite.vals.claimed_at).toBeNull();
    expect(finalWrite.vals.attempts).toBe(1);
    expect(finalWrite.vals.last_error).toContain('dispatch_not_sent');
    expect(supabase.writes.some((w) => w.vals.status === 'released')).toBe(false);
  });

  it('D2 (TESTING sub-agent evidence 9cc5057d, MEDIUM-HIGH): a dispatch that THROWS after the row was claimed unclaims it rather than stranding it in status=releasing forever', async () => {
    const resolveAnswerRows = vi.fn(async () => new Map([['corr-1', { body: 'GO' }]]));
    const checkSelfAnsweredFn = vi.fn(async () => ({ answerRowId: 'ans-9', selfAnswered: false }));
    const sendChairmanSMS = vi.fn(async () => { throw new Error('transport boom'); });
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow({ attempts: 2 }), { resolveAnswerRows, checkSelfAnswered: checkSelfAnsweredFn, sendChairmanSMS });
    expect(outcome.action).toBe('dispatch_threw_unclaimed');
    expect(outcome.error).toContain('transport boom');
    const finalWrite = supabase.writes[supabase.writes.length - 1];
    expect(finalWrite.vals.status).toBe('held');
    expect(finalWrite.vals.claimed_at).toBeNull();
    expect(finalWrite.vals.claimed_by).toBeNull();
    // attempts increments from the row's own carried-forward count, not reset to 1 each time.
    expect(finalWrite.vals.attempts).toBe(3);
    expect(supabase.writes.some((w) => w.vals.status === 'released')).toBe(false);
  });

  it('a genuine audit-write failure after a successful send is surfaced, not silently swallowed (now reachable with a real thenable fake)', async () => {
    const resolveAnswerRows = vi.fn(async () => new Map([['corr-1', { body: 'GO' }]]));
    const checkSelfAnsweredFn = vi.fn(async () => ({ answerRowId: 'ans-9', selfAnswered: false }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: true, sid: 'SM-ok' }));
    const supabase = makeFakeSupabase({ releaseUpdateError: 'deadlock detected' });
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveAnswerRows, checkSelfAnswered: checkSelfAnsweredFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'released_but_audit_write_failed', error: 'deadlock detected' });
    expect(outcome.sendResult).toEqual({ sent: true, sid: 'SM-ok' });
  });

  it('the hold-time insert (chairman-sms-gate) writes the exact fields the release path reads back -- consult_correlation_id and options shape', async () => {
    // Not a chairman-sms-gate integration test (that lives in its own suite); this pins the
    // CONTRACT releaseHeldSend depends on: options must already be a string[] when read off the
    // held row (chairman-sms-gate's extractOptionLabels + the DB's options-is-array CHECK produce
    // this; releaseHeldSend forwards heldRow.options verbatim to sendChairmanSMS without reshaping).
    const resolveAnswerRows = vi.fn(async () => new Map([['corr-1', { body: 'GO' }]]));
    const checkSelfAnsweredFn = vi.fn(async () => ({ answerRowId: 'ans-9', selfAnswered: false }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: true, sid: 'SM-ok' }));
    const supabase = makeFakeSupabase();
    await releaseHeldSend(supabase, heldRow({ options: ['A: approve', 'B: reject'] }), { resolveAnswerRows, checkSelfAnswered: checkSelfAnsweredFn, sendChairmanSMS });
    const [message] = sendChairmanSMS.mock.calls[0];
    expect(Array.isArray(message.options)).toBe(true);
    expect(message.options).toEqual(['A: approve', 'B: reject']);
  });
});
