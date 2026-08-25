/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 FR-6 — governed release mechanism for held chairman
 * decision sends. Covers the mandated refusal cases (unanswered, not-genuinely-Solomon,
 * negative/amending verdict, not-found) plus a successful release, and the security-hardening
 * fixes from SECURITY sub-agent evidence 8c9d89bd (S-1 verdict-content screening, S-2 Solomon-
 * identity allowlist replacing the old "not the asker" denylist, S-3 single-query TOCTOU fix).
 */
import { describe, it, expect, vi } from 'vitest';
import { decideRelease, isSolomonSession, resolveVerifiedAnswer, releaseHeldSend } from '../../../lib/adam/chairman-held-send-release.js';

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
 * Minimal fake supabase. The chairman_held_sends `.update()` builder is a GENUINELY thenable
 * object (a real .then(resolve,reject)) -- a TESTING sub-agent (evidence 9cc5057d) found a prior
 * non-thenable version made `await` resolve to the raw builder, so `error` always destructured to
 * undefined and the audit-write-failure path was structurally unreachable. `writes` records every
 * update call (vals + filters) so tests can assert exactly what was persisted.
 */
function makeFakeSupabase({ answerRow = null, claimSucceeds = true, releaseUpdateError = null, unclaimMatches = true, solomonSessionIds = [] } = {}) {
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
                    limit: async () => ({ data: answerRow ? [answerRow] : [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'claude_sessions') {
        return {
          select: () => ({
            eq: (col, val) => ({
              eq: () => ({
                maybeSingle: async () => (solomonSessionIds.includes(val) ? { data: { session_id: val }, error: null } : { data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'chairman_held_sends') {
        return {
          update(vals) {
            const filters = [];
            const isUnclaim = vals.status === 'held';
            const builder = {
              eq(col, val) { filters.push([col, val]); return builder; },
              is(col, val) { filters.push([col, val]); return builder; },
              select() {
                // CLAIM shape: .update().eq().eq().is().select('id').maybeSingle() -- production
                // reads a single row (or null), never an array, so the fake must expose the same
                // .maybeSingle() terminal instead of resolving select() itself.
                writes.push({ vals, filters, terminal: 'select' });
                return {
                  maybeSingle: async () => (claimSucceeds ? { data: { id: 'held-1' }, error: null } : { data: null, error: null }),
                };
              },
              then(resolve, reject) {
                writes.push({ vals, filters, terminal: 'thenable' });
                if (isUnclaim) {
                  // UNCLAIM shape now ALSO calls .select('id').maybeSingle() (S-8 fix) before
                  // landing here via the select() branch above -- this then() only covers the
                  // RELEASE write shape.
                  return Promise.resolve({ data: null, error: null }).then(resolve, reject);
                }
                const result = releaseUpdateError ? { data: null, error: { message: releaseUpdateError } } : { data: null, error: null };
                return Promise.resolve(result).then(resolve, reject);
              },
            };
            // UNCLAIM also terminates in .select('id').maybeSingle() per the S-8 fix -- route it
            // through the same select() branch as claim, but resolve based on unclaimMatches.
            if (isUnclaim) {
              builder.select = () => {
                writes.push({ vals, filters, terminal: 'select' });
                return {
                  maybeSingle: async () => (unclaimMatches ? { data: { id: heldRow().id }, error: null } : { data: null, error: null }),
                };
              };
            }
            return builder;
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('decideRelease (pure core)', () => {
  const noDelta = () => false;
  const yesDelta = () => true;

  it('TS-a: no answer found -> hold, unanswered', () => {
    expect(decideRelease({ found: false }, noDelta)).toEqual({ action: 'hold', reason: 'unanswered' });
  });

  it('TS-b (S-2): answered but NOT a verified Solomon session -> refuse', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: false, answerRowId: 'ans-1', verdict: 'GO' }, noDelta))
      .toEqual({ action: 'refuse', reason: 'answerer_not_verified_solomon', answerRowId: 'ans-1' });
  });

  it('TS-c (S-1): a verified Solomon verdict that reads as negative/amending -> refuse, never auto-sent', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-2', verdict: 'Do not send this, revise the amount first' }, yesDelta))
      .toEqual({ action: 'refuse', reason: 'verdict_appears_negative_or_amending', answerRowId: 'ans-2', verdict: 'Do not send this, revise the amount first' });
  });

  it('TS-d: a verified Solomon, non-negative verdict -> release, with verdict carried through', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-3', verdict: 'GO' }, noDelta))
      .toEqual({ action: 'release', reason: 'verdict_cited', answerRowId: 'ans-3', verdict: 'GO' });
  });

  it('uses the REAL detectVerdictDelta by default (no injected override) -- a plainly negative verdict is refused', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-4', verdict: 'This should not proceed, there is a security hole' }))
      .toMatchObject({ action: 'refuse', reason: 'verdict_appears_negative_or_amending' });
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-5', verdict: 'GO' }))
      .toMatchObject({ action: 'release' });
  });
});

describe('isSolomonSession (S-2 allowlist, fail-closed)', () => {
  it('confirms a session recorded with metadata.role=solomon', async () => {
    const supabase = makeFakeSupabase({ solomonSessionIds: ['solomon-session-1'] });
    expect(await isSolomonSession(supabase, 'solomon-session-1')).toBe(true);
  });

  it('rejects any session NOT recorded as role=solomon, including a differing-but-unverified sender', async () => {
    const supabase = makeFakeSupabase({ solomonSessionIds: ['solomon-session-1'] });
    expect(await isSolomonSession(supabase, 'some-other-session')).toBe(false);
  });

  it('fails closed (false) on a null/undefined session id', async () => {
    const supabase = makeFakeSupabase({ solomonSessionIds: ['solomon-session-1'] });
    expect(await isSolomonSession(supabase, null)).toBe(false);
  });
});

describe('resolveVerifiedAnswer (S-3 TOCTOU fix + V-1 rotated-Solomon fallback)', () => {
  it('reports found=false when no answer row exists', async () => {
    const supabase = makeFakeSupabase({ answerRow: null });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result).toEqual({ found: false, isGenuineSolomon: false, answerRowId: null, verdict: null });
  });

  it('STRONG path: isGenuineSolomon=true when the SAME row read confirms the sender via the current-role allowlist', async () => {
    const supabase = makeFakeSupabase({
      answerRow: { id: 'ans-1', sender_session: 'solomon-session-1', sender_type: 'solomon', payload: { body: 'GO' } },
      solomonSessionIds: ['solomon-session-1'],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result).toEqual({ found: true, isGenuineSolomon: true, answerRowId: 'ans-1', verdict: 'GO' });
  });

  it('V-1 FALLBACK path: a ROTATED-OUT Solomon (no longer role=solomon in claude_sessions) is still recognized via the write-time sender_type attestation', async () => {
    const supabase = makeFakeSupabase({
      // solomonSessionIds deliberately does NOT include this session -- simulating a Solomon seat
      // that has since handed off, exactly the corpus finding (21 of 27 real verdicts came from a
      // since-retired Solomon session whose current role metadata no longer says 'solomon').
      answerRow: { id: 'ans-1', sender_session: 'retired-solomon-session', sender_type: 'solomon', payload: { body: 'GO' } },
      solomonSessionIds: [],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result.isGenuineSolomon).toBe(true);
  });

  it('the fallback does NOT reopen S-2: a forged sender_type=solomon claim from the ORIGINAL ASKER session is still refused', async () => {
    const supabase = makeFakeSupabase({
      answerRow: { id: 'ans-1', sender_session: 'adam-session-1', sender_type: 'solomon', payload: { body: 'GO' } },
      solomonSessionIds: [],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result.isGenuineSolomon).toBe(false);
  });

  it('the fallback does NOT reopen S-2: a forged sender_type=solomon claim from the shared unattended sentinel is still refused', async () => {
    const supabase = makeFakeSupabase({
      answerRow: { id: 'ans-1', sender_session: 'chairman-lane-automated', sender_type: 'solomon', payload: { body: 'GO' } },
      solomonSessionIds: [],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', null);
    expect(result.isGenuineSolomon).toBe(false);
  });

  it('reports isGenuineSolomon=false for a non-Solomon sender_type from a genuinely different, non-Solomon session (the original S-2 forgery attempt)', async () => {
    const supabase = makeFakeSupabase({
      answerRow: { id: 'ans-1', sender_session: 'random-forged-session', sender_type: 'adam', payload: { body: 'GO' } },
      solomonSessionIds: ['solomon-session-1'],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result.isGenuineSolomon).toBe(false);
  });
});

describe('releaseHeldSend — refusal cases + success', () => {
  it('REFUSAL (unanswered): no answer resolved for the correlation -> action=hold, never dispatches', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: false, isGenuineSolomon: false, answerRowId: null, verdict: null }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'hold', reason: 'unanswered', heldSendId: 'held-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('REFUSAL (S-2, not verified Solomon): an answer from a session that cannot be confirmed as Solomon -> action=refuse, never dispatches', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: false, answerRowId: 'ans-1', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'refuse', reason: 'answerer_not_verified_solomon', heldSendId: 'held-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('REFUSAL (S-1, negative verdict): a verified Solomon verdict that reads as a rejection -> action=refuse, never dispatches', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-2', verdict: 'Do not send, this is wrong' }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'refuse', reason: 'verdict_appears_negative_or_amending', heldSendId: 'held-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('REFUSAL (not-found): the held row carries no consult correlation at all -> action=skip, never dispatches', async () => {
    const resolveVerifiedAnswerFn = vi.fn();
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow({ consult_correlation_id: null }), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'skip', reason: 'no_consult_anchor', heldSendId: 'held-1' });
    expect(resolveVerifiedAnswerFn).not.toHaveBeenCalled();
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('SUCCESS: a verified, non-negative Solomon verdict releases, cites the answer row, and dispatches via sendChairmanSMS with the independently-verified verdict injected', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async (message, context, opts) => {
      const outcome = await opts.runPreSendConsultLane();
      expect(outcome.verdict).toBe('GO');
      return { sent: true, sid: 'SM-released-1' };
    });
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome.action).toBe('released');
    expect(outcome.answerRowId).toBe('ans-9');
    expect(outcome.sendResult).toEqual({ sent: true, sid: 'SM-released-1' });
    expect(sendChairmanSMS).toHaveBeenCalledTimes(1);
    const [message] = sendChairmanSMS.mock.calls[0];
    expect(message).toMatchObject({ type: 'decision', decisionId: 'dec-1', chairmanUserId: 'u-1' });
  });

  it('a claim race (another sweep run already claimed the row) skips without dispatching', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase({ claimSucceeds: false });
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'skip', reason: 'claim_failed_or_already_claimed' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('D1 (TESTING sub-agent evidence 9cc5057d, HIGH): a claimed row whose dispatch did NOT succeed (sendResult.sent !== true) is NEVER marked released -- it is unclaimed back to held for retry', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: false, held: true, reason: 'over_ask_held' }));
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome.action).toBe('dispatch_not_sent_unclaimed');
    expect(outcome.sendResult).toEqual({ sent: false, held: true, reason: 'over_ask_held' });
    const unclaimWrite = supabase.writes.find((w) => w.vals.status === 'held');
    expect(unclaimWrite.vals.claimed_at).toBeNull();
    expect(unclaimWrite.vals.attempts).toBe(1);
    expect(unclaimWrite.vals.last_error).toContain('dispatch_not_sent');
    expect(supabase.writes.some((w) => w.vals.status === 'released')).toBe(false);
  });

  it('D2 (TESTING sub-agent evidence 9cc5057d, MEDIUM-HIGH): a dispatch that THROWS after the row was claimed unclaims it rather than stranding it in status=releasing forever', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => { throw new Error('transport boom'); });
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow({ attempts: 2 }), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome.action).toBe('dispatch_threw_unclaimed');
    expect(outcome.error).toContain('transport boom');
    const unclaimWrite = supabase.writes.find((w) => w.vals.status === 'held');
    expect(unclaimWrite.vals.claimed_at).toBeNull();
    expect(unclaimWrite.vals.claimed_by).toBeNull();
    expect(unclaimWrite.vals.attempts).toBe(3);
    expect(supabase.writes.some((w) => w.vals.status === 'released')).toBe(false);
    expect(outcome.unclaimError).toBeUndefined();
  });

  it('S-8: a dispatch failure whose UNCLAIM write matches zero rows (the row was already stranded elsewhere) is surfaced via unclaimError, not silently treated as a successful unclaim', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: false, reason: 'transport_soft_fail' }));
    const supabase = makeFakeSupabase({ unclaimMatches: false });
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome.action).toBe('dispatch_not_sent_unclaimed');
    expect(outcome.unclaimError).toBe('row_not_found_stranded_in_releasing');
  });

  it('a genuine audit-write failure after a successful send is surfaced, not silently swallowed', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: true, sid: 'SM-ok' }));
    const supabase = makeFakeSupabase({ releaseUpdateError: 'deadlock detected' });
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'released_but_audit_write_failed', error: 'deadlock detected' });
    expect(outcome.sendResult).toEqual({ sent: true, sid: 'SM-ok' });
  });

  it('the hold-time insert (chairman-sms-gate) writes the exact fields the release path reads back -- options already a string[]', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: true, sid: 'SM-ok' }));
    const supabase = makeFakeSupabase();
    await releaseHeldSend(supabase, heldRow({ options: ['A: approve', 'B: reject'] }), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    const [message] = sendChairmanSMS.mock.calls[0];
    expect(Array.isArray(message.options)).toBe(true);
    expect(message.options).toEqual(['A: approve', 'B: reject']);
  });
});
