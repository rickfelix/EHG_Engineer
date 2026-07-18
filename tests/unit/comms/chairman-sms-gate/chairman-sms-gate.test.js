import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSMS } from '../../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';

/** A well-formed sms-authority decision (passes -A's rubric to verdict=pass, authorityClass=sms). */
function wellFormedDecision(overrides = {}) {
  return {
    type: 'decision',
    body: 'Approve the deploy? Reply A or B. Reply DETAILS for the rationale.',
    options: [{ label: 'A) ship now' }, { label: 'B) hold until morning' }],
    decisionCount: 1,
    replyInstruction: 'Reply A or B (or DETAILS)',
    replyId: 'dec-c-1',
    noReplyConsequence: 'no reply by 5pm ET -> I hold (reversible)',
    ...overrides,
  };
}

const DAYTIME = { nowHourET: 14, rateCap: 10, sentInWindow: 0 };
const makeSender = () => ({ send: vi.fn(async () => ({ sid: 'SM-test' })) });
const silentConsole = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };

describe('chairman-sms-gate sendChairmanSMS()', () => {
  it('TS-1: a malformed decision is blocked by the rubric and NOT sent (held)', async () => {
    const sender = makeSender();
    const res = await sendChairmanSMS(wellFormedDecision({ options: [] }), DAYTIME, { sender, console: silentConsole });
    expect(res.sent).toBe(false);
    expect(res.held).toBe(true);
    expect(res.reason).toBe('blocked');
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('TS-2: a well-formed sms-authority decision is sent exactly once via the injected sender', async () => {
    const sender = makeSender();
    const res = await sendChairmanSMS(wellFormedDecision(), DAYTIME, { sender, console: silentConsole });
    expect(res.sent).toBe(true);
    expect(res.authorityClass).toBe('sms');
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('TS-3: a console-authority (spend) decision routes to console, not SMS', async () => {
    const sender = makeSender();
    const res = await sendChairmanSMS(wellFormedDecision({ authority: 'spend' }), DAYTIME, { sender, console: silentConsole });
    expect(res.sent).toBe(false);
    expect(res.routedToConsole).toBe(true);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('TS-4: rubric unavailable (throws) fail-closes a decision — held + console-logged, never sent', async () => {
    const sender = makeSender();
    const throwingEvaluate = vi.fn(async () => { throw new Error('rubric down'); });
    const res = await sendChairmanSMS(wellFormedDecision(), DAYTIME, { sender, evaluate: throwingEvaluate, console: silentConsole });
    expect(res.sent).toBe(false);
    expect(res.held).toBe(true);
    expect(res.reason).toBe('gate_unavailable');
    expect(sender.send).not.toHaveBeenCalled();
    expect(silentConsole.error).toHaveBeenCalled();
  });

  it('TS-5: a type=status message carrying options is handled as a decision (rubric decision checks apply)', async () => {
    const sender = makeSender();
    // claims status but has options + no reply instruction -> rubric decision checks block it
    const msg = { type: 'status', body: 'Pick one: A) x  B) y', options: [{ label: 'A) x' }, { label: 'B) y' }] };
    const res = await sendChairmanSMS(msg, DAYTIME, { sender, console: silentConsole });
    expect(res.sent).toBe(false);
    expect(res.held).toBe(true); // decision handling engaged; blocked on missing decision fields
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('TS-6: default sender DELEGATES to the -B durable path and fails SOFT (no throw) — SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 FR-2', async () => {
    // FR-2 wired makeDefaultSender (the former throw-stub) to the -B durable send path
    // (enqueueChairmanSms) — NOT a second Twilio client. With no recipient/durable state it must fail
    // SOFT (never throw) so the guaranteed chairman EMAIL escalation delivers. The RUBRIC fail-closed
    // guarantee is UNCHANGED — a bad decision is still HELD before send (see the blocked/fail-closed
    // cases above); only the TRANSPORT is now fail-soft.
    const prev = process.env.CHAIRMAN_PHONE;
    delete process.env.CHAIRMAN_PHONE; // force the no-recipient soft-fail branch (no durable I/O)
    const res = await sendChairmanSMS(wellFormedDecision(), DAYTIME, { console: silentConsole });
    expect(res.sent).toBe(true); // rubric admitted; transport soft-failed to the email fallback, no throw
    if (prev !== undefined) process.env.CHAIRMAN_PHONE = prev;
  });
});
