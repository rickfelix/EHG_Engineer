/**
 * QF-20260725-972 — the chairman send lane must be under the pre-send Solomon-consult contract.
 * The regression these lock: the gate existed but was wired to the coordinator lane ONLY, so a
 * consequential Adam->chairman recommendation reached the chairman unconsulted.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildChairmanGateInput, runChairmanPreSendConsult } from '../../lib/adam/chairman-pre-send-consult.mjs';
import { sendChairmanSMS } from '../../lib/comms/adam-outbound/chairman-sms-gate/index.js';

const CONSEQUENTIAL = 'Recommend we re-pin Solomon to a different model and drop the fable window; this changes fleet authority.';
const ROUTINE = 'FYI heartbeat: fleet nominal, no action needed.';

const quietLog = { warn: () => {}, error: () => {}, log: () => {} };
const passEvaluate = async () => ({ verdict: 'pass', authorityClass: 'sms' });

describe('buildChairmanGateInput', () => {
  it('always marks the send chairman-targeted so degradation is hold-and-surface, never proceed', () => {
    expect(buildChairmanGateInput({ type: 'status', body: 'x' }).isChairmanTargeted).toBe(true);
  });

  it('folds decision option labels and the no-reply consequence into the classified body', () => {
    const input = buildChairmanGateInput({
      type: 'decision',
      body: 'Pick one',
      options: [{ label: 'Ship it' }, { label: 'Hold for review' }],
      noReplyConsequence: 'I will hold by default',
    });
    expect(input.body).toContain('Ship it');
    expect(input.body).toContain('Hold for review');
    expect(input.body).toContain('I will hold by default');
    expect(input.decisionType).toBe('decision');
  });

  it('tolerates a message with no options array', () => {
    expect(() => buildChairmanGateInput({ body: 'x' })).not.toThrow();
    expect(buildChairmanGateInput({ body: 'x' }).body).toBe('x');
  });
});

describe('runChairmanPreSendConsult', () => {
  it('does not consult for a clearly routine status send', async () => {
    const consult = vi.fn();
    const out = await runChairmanPreSendConsult({ type: 'status', body: ROUTINE }, { consult });
    expect(out.gated).toBe(false);
    expect(out.action).toBe('proceed');
    expect(consult).not.toHaveBeenCalled();
  });

  it('consults before sending a consequential chairman recommendation', async () => {
    const consult = vi.fn(async () => 'Solomon: concur, send as written');
    const out = await runChairmanPreSendConsult({ type: 'decision', body: CONSEQUENTIAL }, { consult, timeoutMs: 50 });
    expect(consult).toHaveBeenCalledTimes(1);
    expect(out.gated).toBe(true);
    expect(out.action).toBe('send');
  });

  it('HOLDS (never documented-proceeds) when the consult times out on the chairman surface', async () => {
    const consult = vi.fn(() => new Promise(() => {})); // never resolves
    const recordLedger = vi.fn(async () => {});
    const out = await runChairmanPreSendConsult({ type: 'decision', body: CONSEQUENTIAL }, { consult, recordLedger, timeoutMs: 20 });
    expect(out.action).toBe('hold-and-surface');
    expect(out.degraded).toBe(true);
  });

  it('fails OPEN with a ledger capture when the consult lane is ABSENT (no chairman blackout)', async () => {
    // Governing invariant: Adam is never hard-blocked on Solomon. With no DB creds there is no lane
    // to wait on, so holding would silence the chairman indefinitely instead of deferring a send.
    const url = process.env.SUPABASE_URL; const pub = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const recordLedger = vi.fn(async () => {});
    try {
      const out = await runChairmanPreSendConsult({ type: 'decision', body: CONSEQUENTIAL }, { recordLedger });
      expect(out.action).toBe('proceed');
      expect(out.laneUnavailable).toBe(true);
      expect(recordLedger).toHaveBeenCalledTimes(1);
      expect(recordLedger.mock.calls[0][0].detail).toContain('lane-absent');
    } finally {
      if (url) process.env.SUPABASE_URL = url;
      if (pub) process.env.NEXT_PUBLIC_SUPABASE_URL = pub;
    }
  });

  it('treats a throwing consult as a timeout — holds rather than sending unconsulted', async () => {
    const consult = vi.fn(async () => { throw new Error('lane down'); });
    const out = await runChairmanPreSendConsult({ type: 'decision', body: CONSEQUENTIAL }, { consult, timeoutMs: 20 });
    expect(out.action).toBe('hold-and-surface');
  });
});

describe('sendChairmanSMS pre-send gate wiring', () => {
  const sender = () => ({ send: vi.fn(async () => ({ ok: true })) });

  it('holds the send when the gate returns hold-and-surface', async () => {
    const s = sender();
    const r = await sendChairmanSMS({ type: 'decision', body: CONSEQUENTIAL }, {}, {
      sender: s, evaluate: passEvaluate, console: quietLog,
      preSendConsult: async () => ({ action: 'hold-and-surface', degraded: true, gated: true }),
    });
    expect(r.sent).toBe(false);
    expect(r.held).toBe(true);
    expect(r.reason).toBe('pre_send_consult_hold');
    expect(s.send).not.toHaveBeenCalled();
  });

  it('sends when the consult returned a verdict', async () => {
    const s = sender();
    const r = await sendChairmanSMS({ type: 'decision', body: CONSEQUENTIAL }, {}, {
      sender: s, evaluate: passEvaluate, console: quietLog,
      preSendConsult: async () => ({ action: 'send', gated: true, consultRecorded: true }),
    });
    expect(r.sent).toBe(true);
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it('FAILS OPEN — a gate error must never block the chairman path', async () => {
    const s = sender();
    const r = await sendChairmanSMS({ type: 'status', body: ROUTINE }, {}, {
      sender: s, evaluate: passEvaluate, console: quietLog,
      preSendConsult: async () => { throw new Error('gate exploded'); },
    });
    expect(r.sent).toBe(true);
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it('honors the ADAM_PRE_SEND_CONSULT=off kill switch (parity with the coordinator lane)', async () => {
    const s = sender();
    const consult = vi.fn();
    process.env.ADAM_PRE_SEND_CONSULT = 'off';
    try {
      const r = await sendChairmanSMS({ type: 'decision', body: CONSEQUENTIAL }, {}, {
        sender: s, evaluate: passEvaluate, console: quietLog, preSendConsult: consult,
      });
      expect(r.sent).toBe(true);
      expect(consult).not.toHaveBeenCalled();
    } finally {
      delete process.env.ADAM_PRE_SEND_CONSULT;
    }
  });

  it('still blocks on the rubric before ever reaching the consult gate', async () => {
    const consult = vi.fn();
    const r = await sendChairmanSMS({ type: 'decision', body: CONSEQUENTIAL }, {}, {
      sender: sender(), console: quietLog, preSendConsult: consult,
      evaluate: async () => ({ verdict: 'block', blockedReasons: ['missing options'] }),
    });
    expect(r.held).toBe(true);
    expect(r.reason).toBe('blocked');
    expect(consult).not.toHaveBeenCalled();
  });
});
