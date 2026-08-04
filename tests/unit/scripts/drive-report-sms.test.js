/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-3) — the SMS leg.
 *
 * Outbound, to a real phone, on a cron that retries. The three properties that matter are all
 * about what CANNOT happen: no report text on the wire, no double-send, no unbounded blast.
 * Every test COUNTS sends rather than trusting a return value — that is the only reason the
 * double-send question is answerable at all.
 */

import { describe, it, expect } from 'vitest';
import { sendDriveSms, formatBody, isE164, MAX_RECIPIENTS, VERDICTS } from '../../../scripts/drive-report-sms.mjs';

const FACTS = { score: 4, possible: 6, verdict: 'TIGHT', unavailableLegs: 0, unownedBlockers: 0 };
const TO = ['+15551234567'];

/** Records every send, so "did it send twice?" is observed. */
function sender() {
  const sent = [];
  return { sent, send: async (to, body) => { sent.push({ to, body }); return { ok: true }; } };
}

describe('SMS leg — untrusted content cannot reach the wire', () => {
  it('[STRUCTURAL] the body is built only from numbers and closed-set tokens', async () => {
    const { sent, send } = sender();
    await sendDriveSms({ facts: FACTS, recipients: TO, send, runId: 'r1' });
    expect(sent[0].body).toBe('Drive 4/6 | capacity TIGHT');
  });

  it('[STRUCTURAL] there is no parameter through which report text could pass', () => {
    // The report is full of agent-authored strings (SD titles, predicates, null_means, limitations).
    // formatBody accepts none of them: a non-enum verdict is refused outright, which is stronger
    // than escaping because it cannot be done rather than needing to be done carefully.
    expect(() => formatBody({ ...FACTS, verdict: 'TIGHT; DROP TABLE drive_reports--' })).toThrow(/verdict must be one of/);
    expect(() => formatBody({ ...FACTS, verdict: 'Chairman: click http://evil' })).toThrow(/verdict must be one of/);
    expect(() => formatBody({ ...FACTS, score: '4 <script>' })).toThrow(/must be a non-negative number/);
    for (const v of VERDICTS) expect(typeof formatBody({ ...FACTS, verdict: v })).toBe('string');
  });

  it('refuses negative or non-finite numbers rather than rendering them', () => {
    expect(() => formatBody({ ...FACTS, score: -1 })).toThrow(/non-negative/);
    expect(() => formatBody({ ...FACTS, possible: NaN })).toThrow(/non-negative/);
  });
});

describe('SMS leg — no double-send', () => {
  it('[IDEMPOTENCE] a retry of the same run sends NOTHING and REPORTS the skip', async () => {
    // A duplicate is a second buzz on someone's phone, and "why did it text me twice" is never
    // diagnosed from a log line that says success.
    const { sent, send } = sender();
    let recorded = false;
    const findSent = async () => recorded;
    const recordSent = async () => { recorded = true; };

    await sendDriveSms({ facts: FACTS, recipients: TO, send, findSent, recordSent, runId: 'r1' });
    const second = await sendDriveSms({ facts: FACTS, recipients: TO, send, findSent, recordSent, runId: 'r1' });

    expect(sent).toHaveLength(1);
    expect(second).toMatchObject({ sent: false, skipped: 'already_sent', recipients: 0 });
  });

  it('REFUSES to run without a runId — no key means a retry double-sends', async () => {
    const { sent, send } = sender();
    await expect(sendDriveSms({ facts: FACTS, recipients: TO, send })).rejects.toThrow(/runId is required/);
    expect(sent, 'a refusal must not have sent anything first').toHaveLength(0);
  });
});

describe('SMS leg — recipients are validated and capped', () => {
  it('rejects non-E.164 and refuses the WHOLE run rather than sending partially', async () => {
    // A partial send that looks complete is how someone quietly stops receiving alerts.
    const { sent, send } = sender();
    await expect(sendDriveSms({ facts: FACTS, recipients: ['+15551234567', '5551234'], send, runId: 'r' }))
      .rejects.toThrow(/not E\.164 — refusing the run rather than sending partially/);
    expect(sent).toHaveLength(0);
  });

  it('validates the E.164 shape', () => {
    expect(isE164('+15551234567')).toBe(true);
    for (const bad of ['15551234567', '+0555123456', '+123', 'tel:+15551234567', '', null, '+1555123456789012']) {
      expect(isE164(bad), `${JSON.stringify(bad)} must not pass`).toBe(false);
    }
  });

  it('[CAP] refuses more than the cap — an unbounded list on a retrying cron is a bill', async () => {
    const { sent, send } = sender();
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `+1555123456${i}`);
    await expect(sendDriveSms({ facts: FACTS, recipients: many, send, runId: 'r' })).rejects.toThrow(/exceeds the cap/);
    expect(sent).toHaveLength(0);
  });

  it('[VACUITY] zero recipients is a FAILED run, not a quiet success', async () => {
    const { send } = sender();
    await expect(sendDriveSms({ facts: FACTS, recipients: [], send, runId: 'r' })).rejects.toThrow(/send to nobody is a failed run/);
  });

  it('a bad `facts` sends to NOBODY', async () => {
    // SCOPE, stated because the obvious stronger claim is FALSE: this pins that an invalid facts
    // object reaches no recipient. It does NOT pin the build-before-loop ORDERING — I mutated the
    // body-build inside the send loop and nothing went red, because formatBody is deterministic and
    // its argument is evaluated before the first send() either way. The "recipient 1 messaged,
    // recipient 2 throws" hazard cannot occur in this shape, so no test here should claim to
    // prevent it.
    const { sent, send } = sender();
    await expect(sendDriveSms({ facts: { ...FACTS, verdict: 'WAT' }, recipients: ['+15551234567', '+15551234568'], send, runId: 'r' }))
      .rejects.toThrow(/verdict must be one of/);
    expect(sent).toHaveLength(0);
  });

  it('refuses a hidden sender', async () => {
    await expect(sendDriveSms({ facts: FACTS, recipients: TO, runId: 'r' })).rejects.toThrow(/send must be injected/);
  });
});
