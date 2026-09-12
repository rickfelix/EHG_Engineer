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
function makeFakeSupabase({ answerRow = null, answerRows = null, claimSucceeds = true, releaseUpdateError = null, unclaimMatches = true, solomonSessionIds = [] } = {}) {
  const writes = [];
  const rows = answerRows || (answerRow ? [answerRow] : []);
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
                    limit: async () => ({ data: rows, error: null }),
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

  // FIX 1 (QF-20260905-746). Solomon GO (d60ec8b1, 13:43Z): structured payload.verdict is
  // authoritative and is NEVER overridden by the amendment-marker regex, in EITHER direction.
  it('TS-e (FIX 1): structuredVerdict=GO releases even when the verdict TEXT would otherwise trip the amendment regex', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-6', structuredVerdict: 'GO', verdict: 'GO -- and yes there is a real security hole in the OLD flow, but this text is fine' }))
      .toMatchObject({ action: 'release', reason: 'verdict_cited' });
  });

  it('TS-f (FIX 1): structuredVerdict=NO refuses even when the verdict TEXT reads as an unqualified approval', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-7', structuredVerdict: 'NO', verdict: 'looks great, ship it' }))
      .toMatchObject({ action: 'refuse', reason: 'verdict_structured_negative_or_amending' });
  });

  it('TS-g (FIX 1): structuredVerdict=AMEND refuses', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-7b', structuredVerdict: 'AMEND', verdict: 'close but change the amount' }))
      .toMatchObject({ action: 'refuse', reason: 'verdict_structured_negative_or_amending' });
  });

  // Solomon constraint (a): the leading-token rule is the ONLY fallback and is never overridden by
  // the amendment regex either -- a bare "GO" that goes on to discuss a "hold" or a "risk" must
  // still release.
  it('TS-h (FIX 1): no structured verdict, but a clean leading GO token releases despite regex-trippy prose later in the body', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-8', verdict: 'GO. Note there is no hold needed and the risk is low.' }))
      .toMatchObject({ action: 'release', reason: 'verdict_cited' });
  });

  // FIXTURE 1 (FIX 1's pinned specimen): the REAL live Solomon answer (session_coordination id
  // 25584a06-9b07-449d-a2a9-32d3e1fce894, correlation e1c0150e, hold 824c7d54 -- QF-20260906-202's
  // specimen) that reproduced the bug this QF fixes: a genuine GO whose prose ("...the reason it
  // should not wait...") trips VERDICT_AMENDMENT_MARKERS, and whose body does NOT open with a
  // leading GO/APPROVE/SEND token (it opens with a bracketed context line). Per Solomon constraint
  // (b): with NEITHER a structured verdict NOR a leading token, this must be refused -- LOUDLY, with
  // a distinct reason -- not silently released and not silently folded into the old generic
  // amendment-refusal reason. The fix for Solomon going forward is `send --verdict GO` (see the next
  // test) or a clean leading token; this test pins the refuse-not-crash behavior for the unstructured
  // historical specimen itself.
  const LIVE_FALSE_POSITIVE_GO_BODY = '[SOLOMON verdict on the held chairman send 199dcce6 (Fable-exhaustion plan as a two-option decision, held send 824c7d54, decision 6d7ff154), reply on 199dcce6] GO, and send it first in the queue. Grounding read: the text is my own plan 89b7a95a restated faithfully: reserve the remaining rickfelix2000 Fable window for the chairman, automated seats to Opus now with Sonnet for small drains, the step-down rule per account, the Sonnet-only posture holding SD builds until the weekly reset, one text when that happens; two options, recommendation 1 with its reason, no auto-default and the consequence of silence stated. The reset day and hour are the account sampler\'s (INHERITED), the rest is measured. The second freeze of the day, 19:50Z to 22:28Z, landed at the hour the diagnosis predicted (17:28Z plus five hours), which is the strongest evidence the text needs and the reason it should not wait behind the other two decisions. Send as written.\n\nSolomon';

  it('FIXTURE 1 (live specimen 25584a06, QF-20260906-202): unstructured GO prose tripping the amendment regex is refused with the NEW distinct reason, not silently released', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: '25584a06-9b07-449d-a2a9-32d3e1fce894', verdict: LIVE_FALSE_POSITIVE_GO_BODY }))
      .toMatchObject({ action: 'refuse', reason: 'verdict_appears_negative_or_amending' });
  });

  it('FIXTURE 1, corrected: the SAME live prose sent with structuredVerdict=GO (i.e. via solomon-advisory send --verdict GO) now releases cleanly', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: '25584a06-9b07-449d-a2a9-32d3e1fce894', structuredVerdict: 'GO', verdict: LIVE_FALSE_POSITIVE_GO_BODY }))
      .toMatchObject({ action: 'release', reason: 'verdict_cited' });
  });

  // FIXTURE 2 (the MIRROR fixture): a genuine NO/refusal whose prose contains GO-adjacent words
  // ("go back", "hole") -- proves the leading-token check is anchored to the START of the body
  // (never a substring match anywhere in it), so this is refused correctly both with and without
  // the regex.
  it('FIXTURE 2 (MIRROR): a NO containing GO-adjacent substrings is never misread as an approval', () => {
    const mirrorBody = 'NO -- do not send this. There is a security hole; go back and re-architect the approach first.';
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-mirror', verdict: mirrorBody }))
      .toMatchObject({ action: 'refuse', reason: 'verdict_appears_negative_or_amending' });
  });

  it('Solomon constraint (b): genuinely ambiguous prose (no structured verdict, no leading token, no amendment marker) is refused LOUDLY with a distinct reason, never silently released', () => {
    expect(decideRelease({ found: true, isGenuineSolomon: true, answerRowId: 'ans-ambiguous', verdict: 'Reviewed the packet, looks consistent with the plan we discussed yesterday.' }))
      .toMatchObject({ action: 'refuse', reason: 'no_structured_verdict_or_leading_token' });
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
    expect(result).toEqual({ found: false, isGenuineSolomon: false, answerRowId: null, verdict: null, structuredVerdict: null });
  });

  it('STRONG path: isGenuineSolomon=true when the SAME row read confirms the sender via the current-role allowlist', async () => {
    const supabase = makeFakeSupabase({
      answerRow: { id: 'ans-1', sender_session: 'solomon-session-1', sender_type: 'solomon', payload: { body: 'GO' } },
      solomonSessionIds: ['solomon-session-1'],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result).toEqual({ found: true, isGenuineSolomon: true, answerRowId: 'ans-1', verdict: 'GO', structuredVerdict: null });
  });

  it('FIX 1: a structured payload.verdict is surfaced as structuredVerdict (normalized uppercase)', async () => {
    const supabase = makeFakeSupabase({
      answerRow: { id: 'ans-1', sender_session: 'solomon-session-1', sender_type: 'solomon', payload: { body: 'ship it', verdict: 'go' } },
      solomonSessionIds: ['solomon-session-1'],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result.structuredVerdict).toBe('GO');
  });

  it('FIX 3 (absorbs QF-20260906-202): the LATEST genuine-Solomon answer wins, not the earliest', async () => {
    const supabase = makeFakeSupabase({
      answerRows: [
        { id: 'ans-early', sender_session: 'solomon-session-1', sender_type: 'solomon', payload: { body: 'Do not send this, hold for review' } },
        { id: 'ans-later', sender_session: 'solomon-session-1', sender_type: 'solomon', payload: { body: 'GO' } },
      ],
      solomonSessionIds: ['solomon-session-1'],
    });
    const result = await resolveVerifiedAnswer(supabase, 'corr-1', 'adam-session-1');
    expect(result.answerRowId).toBe('ans-later');
    expect(result.verdict).toBe('GO');
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

  it('Solomon constraint (b): a refusal STAMPS last_error on the row itself, never leaving only an aggregate refused=1 with nothing on the row', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-2', verdict: 'Do not send, this is wrong' }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    expect(outcome).toMatchObject({ action: 'refuse', reason: 'verdict_appears_negative_or_amending' });
    const stampWrite = supabase.writes.find((w) => typeof w.vals.last_error === 'string' && w.vals.last_error.startsWith('refused:'));
    expect(stampWrite).toBeTruthy();
    expect(stampWrite.vals.last_error).toContain('verdict_appears_negative_or_amending');
    expect(stampWrite.vals.last_error).toContain('ans-2');
  });

  it('FIX 2: an unanswered hold past hold_expires_at with a LIVE Solomon oracle (implicit decline) is abandoned (never left immortal in status=held)', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: false, isGenuineSolomon: false, answerRowId: null, verdict: null }));
    const sendChairmanSMS = vi.fn();
    const enqueueChairmanSmsFn = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    // QF-20260912-079: Solomon LIVE at expiry -> this is the "declined" bucket, abandon stands.
    const getActiveSolomonId = vi.fn(async () => 'solomon-live-session');
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(
      supabase,
      heldRow({ hold_expires_at: '2026-01-01T00:00:00Z' }),
      { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS, enqueueChairmanSms: enqueueChairmanSmsFn, getActiveSolomonId, context: { now: Date.parse('2026-01-02T00:00:00Z') } },
    );
    expect(outcome).toMatchObject({ action: 'abandoned', reason: 'consult_hold_expired_unanswered', heldSendId: 'held-1', noticeEnqueued: true });
    const abandonWrite = supabase.writes.find((w) => w.vals.status === 'abandoned');
    expect(abandonWrite).toBeTruthy();
    expect(abandonWrite.vals.metadata.void_reason).toContain('QF-20260905-746');
    expect(abandonWrite.vals.metadata.void_reason).toContain('live Solomon oracle simply never answered');
    expect(enqueueChairmanSmsFn).toHaveBeenCalledTimes(1);
    expect(enqueueChairmanSmsFn.mock.calls[0][1]).toMatchObject({ kind: 'heartbeat_status', dedupeKey: 'chairman-held-sends-abandoned:held-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('QF-20260912-079: an unanswered hold past hold_expires_at with an ABSENT Solomon oracle is DEFERRED once, not abandoned', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: false, isGenuineSolomon: false, answerRowId: null, verdict: null }));
    const sendChairmanSMS = vi.fn();
    const enqueueChairmanSmsFn = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-2' }));
    // No live Solomon session found -> the oracle is ABSENT, not declined.
    const getActiveSolomonId = vi.fn(async () => null);
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(
      supabase,
      heldRow({ hold_expires_at: '2026-01-01T00:00:00Z' }),
      { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS, enqueueChairmanSms: enqueueChairmanSmsFn, getActiveSolomonId, context: { now: Date.parse('2026-01-02T00:00:00Z') } },
    );
    expect(outcome).toMatchObject({ action: 'deferred', reason: 'consult_hold_expired_oracle_absent', heldSendId: 'held-1', noticeEnqueued: true });
    expect(outcome.newExpiresAt).toBeTruthy();
    const deferWrite = supabase.writes.find((w) => w.vals.metadata && w.vals.metadata.qf_20260912_079_deferred_at);
    expect(deferWrite).toBeTruthy();
    expect(deferWrite.vals.hold_expires_at).toBe(outcome.newExpiresAt);
    expect(supabase.writes.some((w) => w.vals.status === 'abandoned')).toBe(false);
    expect(enqueueChairmanSmsFn).toHaveBeenCalledTimes(1);
    expect(enqueueChairmanSmsFn.mock.calls[0][1]).toMatchObject({ kind: 'heartbeat_status', dedupeKey: 'chairman-held-sends-deferred:held-1' });
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('QF-20260912-079: a hold already deferred once for an absent oracle abandons on the SECOND expiry, even if still absent', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: false, isGenuineSolomon: false, answerRowId: null, verdict: null }));
    const sendChairmanSMS = vi.fn();
    const enqueueChairmanSmsFn = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-3' }));
    const getActiveSolomonId = vi.fn(async () => null); // still absent
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(
      supabase,
      heldRow({ hold_expires_at: '2026-01-02T00:00:00Z', metadata: { qf_20260912_079_deferred_at: '2026-01-01T00:00:00Z' } }),
      { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS, enqueueChairmanSms: enqueueChairmanSmsFn, getActiveSolomonId, context: { now: Date.parse('2026-01-03T00:00:00Z') } },
    );
    expect(outcome).toMatchObject({ action: 'abandoned', reason: 'consult_hold_expired_unanswered', heldSendId: 'held-1' });
    const abandonWrite = supabase.writes.find((w) => w.vals.status === 'abandoned');
    expect(abandonWrite.vals.metadata.void_reason).toContain('already given one deferral window');
    expect(enqueueChairmanSmsFn.mock.calls[0][1].body).toContain('re-checked once');
  });

  it('FIX 2: an unanswered hold NOT yet past hold_expires_at stays held (no premature abandonment)', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: false, isGenuineSolomon: false, answerRowId: null, verdict: null }));
    const sendChairmanSMS = vi.fn();
    const supabase = makeFakeSupabase();
    const outcome = await releaseHeldSend(
      supabase,
      heldRow({ hold_expires_at: '2026-01-02T00:00:00Z' }),
      { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS, context: { now: Date.parse('2026-01-01T00:00:00Z') } },
    );
    expect(outcome).toMatchObject({ action: 'hold', reason: 'unanswered', heldSendId: 'held-1' });
    expect(supabase.writes.some((w) => w.vals.status === 'abandoned')).toBe(false);
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

  it('SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-4): always passes skipCompose:true to sendChairmanSMS -- heldRow.body was already composed once, at hold time', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: true, sid: 'SM-ok' }));
    const supabase = makeFakeSupabase();
    await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    const [, , opts] = sendChairmanSMS.mock.calls[0];
    expect(opts.skipCompose).toBe(true);
  });

  it('SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3): restores reply_instruction/reply_id/no_reply_consequence from the held row onto the reconstructed message', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: true, sid: 'SM-ok' }));
    const supabase = makeFakeSupabase();
    await releaseHeldSend(supabase, heldRow({
      reply_instruction: 'Reply with A or B.', reply_id: 'rid-release-1', no_reply_consequence: 'Silence means hold.',
    }), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    const [message] = sendChairmanSMS.mock.calls[0];
    expect(message.replyInstruction).toBe('Reply with A or B.');
    expect(message.replyId).toBe('rid-release-1');
    expect(message.noReplyConsequence).toBe('Silence means hold.');
  });

  it('a held row that predates FR-3 (no reply fields captured) reconstructs those fields as undefined, not a crash or a fabricated value', async () => {
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-9', verdict: 'GO' }));
    const sendChairmanSMS = vi.fn(async () => ({ sent: true, sid: 'SM-ok' }));
    const supabase = makeFakeSupabase();
    await releaseHeldSend(supabase, heldRow(), { resolveVerifiedAnswer: resolveVerifiedAnswerFn, sendChairmanSMS });
    const [message] = sendChairmanSMS.mock.calls[0];
    expect(message.replyInstruction).toBeUndefined();
    expect(message.replyId).toBeUndefined();
    expect(message.noReplyConsequence).toBeUndefined();
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
