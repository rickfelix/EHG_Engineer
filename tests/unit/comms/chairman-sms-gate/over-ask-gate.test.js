import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSMS } from '../../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';

/**
 * QF-20260725-652 — the over-ask gate on the CHAIRMAN lane.
 *
 * The deterministic execute-vs-escalate rubric guarded the coordinator lane but not this one, so an
 * Adam-initiated ask that the rubric classifies EXECUTE reached the chairman and was only detected
 * hours later by the post-hoc decision_rubric probe. These tests pin the PREVENTION, and equally
 * pin the scope guardrails: a genuine ESCALATE packet, a status send, and a chairman-initiated
 * exchange must all still pass through untouched.
 */
const DAYTIME = { nowHourET: 14, rateCap: 10, sentInWindow: 0 };
const makeSender = () => ({ send: vi.fn(async () => ({ sid: 'SM-test', dispatched: true })) });
const silentConsole = () => ({ warn: vi.fn(), error: vi.fn(), log: vi.fn() });

// The WITNESSED over-ask (QF description, same day): a stated default sitting proximate to an ask,
// no COMES-TO-HIM trigger => classifyDecision returns EXECUTE. Filing a DRAFT SD is reversible and
// in-role, so this was Adam's to do and report.
const OVER_ASK_BODY = 'I recommend we defer the inbox correlation-suppression fix — should I source that?';

describe('chairman-sms-gate over-ask gate (QF-20260725-652)', () => {
  it('HOLDS an Adam-initiated ask that classifies EXECUTE, and never reaches the sender', async () => {
    const sender = makeSender();
    const log = silentConsole();
    const res = await sendChairmanSMS({ type: 'decision', body: OVER_ASK_BODY }, DAYTIME, { sender, console: log });
    expect(res.sent).toBe(false);
    expect(res.held).toBe(true);
    expect(res.overAsk).toBe(true);
    expect(res.reason).toBe('over_ask_held');
    expect(sender.send).not.toHaveBeenCalled();
    // The hold must NAME the gate that classified it so Adam can act instead of guessing.
    expect(log.warn.mock.calls.flat().join(' ')).toMatch(/OVER-ASK HELD/);
  });

  it('does NOT hold a genuine ESCALATE-class decision (a COMES-TO-HIM trigger fired)', async () => {
    const sender = makeSender();
    const body = 'I recommend we defer the irreversible vendor migration — should I proceed?';
    const res = await sendChairmanSMS({ type: 'decision', body }, DAYTIME, { sender, console: silentConsole() });
    expect(res.reason).not.toBe('over_ask_held');
    expect(res.overAsk).toBeUndefined();
  });

  it('does NOT hold a plain status/heartbeat send (no decision-ask shape)', async () => {
    const sender = makeSender();
    const body = 'Heartbeat: fleet green, 3 QFs shipped, nothing needed from you.';
    const res = await sendChairmanSMS({ type: 'status', body }, DAYTIME, { sender, console: silentConsole() });
    expect(res.reason).not.toBe('over_ask_held');
  });

  it('does NOT hold a chairman-INITIATED exchange even when the body reads as an over-ask', async () => {
    const sender = makeSender();
    const res = await sendChairmanSMS(
      { type: 'decision', body: OVER_ASK_BODY },
      { ...DAYTIME, chairmanInitiated: true },
      { sender, console: silentConsole() },
    );
    expect(res.reason).not.toBe('over_ask_held');
  });

  it('is overridable by an explicit attestation (mirrors --outbound-verified)', async () => {
    const sender = makeSender();
    const res = await sendChairmanSMS(
      { type: 'decision', body: OVER_ASK_BODY },
      DAYTIME,
      { sender, console: silentConsole(), overAskAttested: true },
    );
    expect(res.reason).not.toBe('over_ask_held');
  });

  it('FAILS OPEN when the classifier throws — a gate bug never hard-blocks Adam', async () => {
    const sender = makeSender();
    const log = silentConsole();
    const classifyOverAsk = () => { throw new Error('classifier exploded'); };
    const res = await sendChairmanSMS(
      { type: 'decision', body: OVER_ASK_BODY },
      DAYTIME,
      { sender, console: log, classifyOverAsk },
    );
    expect(res.reason).not.toBe('over_ask_held');
    expect(log.warn.mock.calls.flat().join(' ')).toMatch(/failing OPEN/);
  });
});
