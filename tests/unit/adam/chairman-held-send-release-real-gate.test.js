/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 — TESTING sub-agent finding G3 (HIGH) / SECURITY finding
 * F-1 (LOW): every existing test exercises FR-3 (reply-field restoration) and FR-4 (skipCompose)
 * SEPARATELY, with the rubric stubbed out (chairman-held-send-release.test.js mocks
 * sendChairmanSMS entirely; chairman-sms-gate-skip-compose.test.js injects a fake `evaluate` that
 * always passes). Neither crosses the wire between them, so nothing in the committed suite proves
 * the two fixes actually WORK TOGETHER: a released, reconstructed message must satisfy the REAL
 * rubric-engine lint (checks 1/2/3/4/9 all require decision-shaped fields) without being
 * double-composed.
 *
 * This file uses the REAL releaseHeldSend, the REAL sendChairmanSMS, and the REAL rubric evaluate()
 * (default -- heuristicReviewer, no network/LLM). Only the transport (sender.send), the timezone
 * resolver, and the verified-answer lookup are stubbed -- releaseHeldSend's own
 * runPreSendConsultLane override (a verdict this function itself fetched, never caller-supplied)
 * is exercised unmodified.
 *
 * VALIDATION sub-agent finding V-1 (HIGH, PLAN_VERIFICATION): the first version of this file passed
 * `context: { now: Date.now() }` into the REAL rubric, whose quiet_hours check (rubric-engine/
 * lint.js:166) is blocking -- so this file flaked on ANY CI run inside 22:00-06:00 ET, and the
 * negative-control test stayed green in that window for the WRONG reason (asserting only a generic
 * `reason:'blocked'`, satisfied by quiet_hours just as well as by the missing reply fields it was
 * meant to prove). That is exactly the flake class FR-2's own PRD acceptance criteria named and
 * forbade ("never Date.now() / a real clock, to avoid flaking inside the quiet-hours window") --
 * reintroduced one file over. Fixed: context.nowHourET (an integer) is set directly, which
 * etHour() (lint.js:72) returns FIRST, before ever touching a Date -- fully deterministic,
 * independent of wall-clock time or timezone. The negative-control test now also asserts on
 * blockedReasons content, not just the generic {reason:'blocked'} shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { releaseHeldSend } from '../../../lib/adam/chairman-held-send-release.js';

function heldRow(overrides = {}) {
  return {
    id: 'held-real-1',
    consult_correlation_id: 'corr-real-1',
    chairman_user_id: 'u-1',
    chairman_email: 'chairman@example.com',
    recipient_phone: '+15551234567',
    decision_id: 'dec-real-1',
    subject: '[CHAIRMAN SMS]',
    // Already composed at hold time (matches how chairman-sms-gate/index.js:388 actually persists
    // it -- options/replyInstruction/noReplyConsequence folded in ONCE, before the hold).
    body: 'Approve the deploy?\n\nA: approve\nB: reject\n\nReply with the option letter, or DETAILS for more context.\n\nNo reply by EOD means hold.',
    options: ['A: approve', 'B: reject'],
    reply_instruction: 'Reply with the option letter, or DETAILS for more context.',
    reply_id: 'rid-real-1',
    no_reply_consequence: 'No reply by EOD means hold.',
    sender_callsign: 'Adam',
    session_id: 'adam-session-1',
    ...overrides,
  };
}

/**
 * Extends the base chairman_held_sends fake with the two tables sendChairmanSMS's decision-
 * staging path (lib/chairman/sms-bridge.js stageDecisionSmsNotification/updateNotificationStatus)
 * touches once a release genuinely reaches dispatch -- chairman_notifications and
 * chairman_decisions. Both new tables use plausible non-empty happy-path responses; this test
 * exercises whether the RUBRIC blocks/passes correctly, not the staging bookkeeping itself.
 */
function makeFakeSupabase({ claimSucceeds = true } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table === 'chairman_held_sends') {
        return {
          update(vals) {
            const filters = [];
            const builder = {
              eq(col, val) { filters.push([col, val]); return builder; },
              is(col, val) { filters.push([col, val]); return builder; },
              select() {
                writes.push({ vals, filters, terminal: 'select' });
                return { maybeSingle: async () => (claimSucceeds ? { data: { id: heldRow().id }, error: null } : { data: null, error: null }) };
              },
              then(resolve, reject) {
                writes.push({ vals, filters, terminal: 'thenable' });
                return Promise.resolve({ data: null, error: null }).then(resolve, reject);
              },
            };
            return builder;
          },
        };
      }
      if (table === 'chairman_notifications') {
        return {
          insert(row) {
            writes.push({ table, op: 'insert', row });
            return { select: () => Promise.resolve({ data: [{ id: 'notif-real-1' }], error: null }) };
          },
          update(vals) {
            writes.push({ table, op: 'update', vals });
            const builder = { eq() { return builder; }, select: () => Promise.resolve({ data: [{ id: 'notif-real-1' }], error: null }) };
            return builder;
          },
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select() {
            const builder = { eq() { return builder; }, maybeSingle: async () => ({ data: { brief_data: {} }, error: null }) };
            return builder;
          },
          update(vals) {
            writes.push({ table, op: 'update', vals });
            const builder = { eq() { return builder; }, select: () => Promise.resolve({ data: [{ id: 'dec-real-1' }], error: null }) };
            return builder;
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('releaseHeldSend end-to-end through the REAL rubric (FR-3 + FR-4 combined)', () => {
  it('a released decision with the reply fields restored and skipCompose set passes the real lint with ZERO blocking findings, and the wire body matches the held body EXACTLY (no doubling)', async () => {
    const sentCalls = [];
    const sender = { send: vi.fn(async (msg) => { sentCalls.push(msg); return { sid: 'SM-real-1' }; }) };
    const resolveChairmanZone = vi.fn().mockResolvedValue({ zone: 'America/New_York' });
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-real-1', verdict: 'GO' }));
    const { sendChairmanSMS } = await import('../../../lib/comms/adam-outbound/chairman-sms-gate/index.js');

    const supabase = makeFakeSupabase();
    const row = heldRow();
    const outcome = await releaseHeldSend(supabase, row, {
      resolveVerifiedAnswer: resolveVerifiedAnswerFn,
      sendChairmanSMS,
      // Real evaluate() runs (not overridden) -- deterministic lint + heuristicReviewer, no network.
      sendOpts: { sender, resolveChairmanZone },
      // Deterministic clock (V-1 fix): nowHourET short-circuits etHour() before any Date is
      // touched (lint.js:72), so this is byte-independent of wall-clock time -- 10:00 ET is
      // outside the 22:00-06:00 quiet window regardless of when/where this suite runs.
      context: { nowHourET: 10 },
    });

    expect(outcome.action).toBe('released');
    expect(sentCalls).toHaveLength(1);
    // The load-bearing FR-4 assertion: the wire body is BYTE-IDENTICAL to the held row's already-
    // composed body -- not doubled, not truncated.
    expect(sentCalls[0].body).toBe(row.body);
    // The load-bearing FR-3 assertion: reply_instruction/reply_id/no_reply_consequence restored
    // from the held row satisfied the REAL rubric's checks 3 (reply_instruction) and 9 (reply_id) --
    // if they hadn't, releaseHeldSend would have gotten sent:false/held:true from sendChairmanSMS
    // and this outcome would be 'dispatch_not_sent_unclaimed', not 'released'.
    expect(outcome.sendResult.sent).toBe(true);
    expect(outcome.sendResult.verdict).toBe('pass');
  });

  it('a released decision MISSING a reply field (simulating a pre-FR-3 historical held row) is correctly rubric-blocked and unclaimed back to held -- proves the rubric genuinely still enforces these checks post-fix, not merely "some evaluate() ran"', async () => {
    const sender = { send: vi.fn() };
    const resolveChairmanZone = vi.fn().mockResolvedValue({ zone: 'America/New_York' });
    const resolveVerifiedAnswerFn = vi.fn(async () => ({ found: true, isGenuineSolomon: true, answerRowId: 'ans-real-2', verdict: 'GO' }));
    const { sendChairmanSMS } = await import('../../../lib/comms/adam-outbound/chairman-sms-gate/index.js');

    const supabase = makeFakeSupabase();
    // No reply_instruction/reply_id/no_reply_consequence -- the historical-row shape this SD's
    // FR-6 void script targeted.
    const row = heldRow({ reply_instruction: null, reply_id: null, no_reply_consequence: null });
    const outcome = await releaseHeldSend(supabase, row, {
      resolveVerifiedAnswer: resolveVerifiedAnswerFn,
      sendChairmanSMS,
      sendOpts: { sender, resolveChairmanZone },
      // Same deterministic clock as the positive case (V-1 fix) -- without it this test stayed
      // green inside the quiet-hours window for the WRONG reason (a generic 'blocked' matches
      // quiet_hours just as well as the missing-reply-fields case this test exists to prove).
      context: { nowHourET: 10 },
    });

    expect(sender.send).not.toHaveBeenCalled();
    expect(outcome.action).toBe('dispatch_not_sent_unclaimed');
    expect(outcome.sendResult).toMatchObject({ sent: false, held: true, reason: 'blocked' });
    // The load-bearing assertion (V-1 fix): pin this to the SPECIFIC rubric checks the missing
    // reply fields trip, not merely "some blocking finding fired" -- a generic 'blocked' shape
    // would pass identically whether the block came from the missing reply fields or from an
    // unrelated check (e.g. quiet_hours), which is exactly how this test stayed silently
    // meaningless before the clock fix.
    const reasons = outcome.sendResult.blockedReasons || [];
    expect(reasons.some((r) => r.startsWith('reply_instruction:'))).toBe(true);
    expect(reasons.some((r) => r.startsWith('reply_ids:'))).toBe(true);
  });
});
