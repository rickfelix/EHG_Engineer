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

  it('TS-6: no live Twilio — the default sender fails closed rather than sending un-injected', async () => {
    // With no injected sender, a pass+sms decision must NOT silently send via a real client.
    await expect(sendChairmanSMS(wellFormedDecision(), DAYTIME, { console: silentConsole }))
      .rejects.toThrow(/no Twilio sender configured/);
  });
});
