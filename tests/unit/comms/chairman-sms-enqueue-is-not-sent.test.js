/**
 * QF-20260725-738 — enqueue is NOT delivery.
 *
 * LIVE INCIDENT 2026-07-25: adam-chairman-sms.mjs returned {"sent":true,"reason":"sent",
 * "verdict":"pass"} at ~05:26Z for a message Twilio never received. It sat at status='owed' for 33
 * minutes until an unrelated reconcile sweep dispatched it — surfaced only by a Twilio ground-truth
 * check. Meanwhile the chairman texted three times asking whether Adam was still there. An operator
 * reading sent:true reasonably concludes the chairman was reached and stops; that is the failure.
 *
 * The gate's contract clause used to read "delivered/durably-enqueued" — that OR is what licensed
 * the bug. These tests pin the narrowed contract.
 *
 * No live Twilio/Supabase connection: pure predicate + injected sender (matching TS-7's convention
 * in chairman-sms-gate.test.js).
 */
import { describe, it, expect, vi } from 'vitest';
import { obligationDispatched, sendChairmanSMS } from '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';

describe('obligationDispatched — the honesty bar', () => {
  it("REGRESSION: status='owed' is NOT dispatched (the exact 33-minute live-incident state)", () => {
    expect(obligationDispatched({ status: 'owed' })).toBe(false);
  });

  it("counts 'sent' (Twilio accepted, provider_message_id stamped) and 'delivered' (callback)", () => {
    expect(obligationDispatched({ status: 'sent', provider_message_id: 'SM123' })).toBe(true);
    expect(obligationDispatched({ status: 'delivered' })).toBe(true);
  });

  it('does NOT count in-flight or terminal-failure states', () => {
    for (const status of ['sending', 'failed', 'owed_escalate']) {
      expect(obligationDispatched({ status })).toBe(false);
    }
  });

  it('fails closed on a missing/malformed row — never claim a send we cannot evidence', () => {
    for (const row of [null, undefined, {}, { status: null }, { status: 'SENT' }]) {
      expect(obligationDispatched(row)).toBe(false);
    }
  });
});

describe('sendChairmanSMS — an enqueued-but-undispatched transport is not a send', () => {
  // Mirrors TS-1..TS-8's convention in chairman-sms-gate.test.js: inject the sender and assert
  // sendChairmanSMS's own honesty, independent of makeDefaultSender's internals.
  const DAYTIME = { nowHourET: 14, rateCap: 10, sentInWindow: 0 };
  const silentConsole = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  const statusMessage = { type: 'status', body: 'Adam heartbeat: still here.', kind: 'heartbeat_status' };

  it('REGRESSION: reports sent:false and FIRES the fallback when the message never left', async () => {
    // The shape send() now returns when the obligation is still 'owed' after an inline dispatch
    // attempt. Before QF-738 this path returned a sid (the obligationId) and the gate said sent:true.
    const sender = { send: vi.fn(async () => ({ sid: null, softFailed: true, reason: 'enqueued_not_dispatched: status=owed' })) };
    const fallbackSend = vi.fn(async () => ({ fired: true }));
    const res = await sendChairmanSMS(statusMessage, DAYTIME, { sender, console: silentConsole, fallbackSend });
    expect(res.sent).toBe(false);
    expect(res.transportFailed).toBe(true);
    expect(res.fallbackFired).toBe(true); // the chairman still gets reached, by email
    expect(res.reason).toContain('enqueued_not_dispatched');
    expect(fallbackSend).toHaveBeenCalledTimes(1);
  });

  it('reports sent:true only when the transport actually handed off to Twilio', async () => {
    const sender = { send: vi.fn(async () => ({ sid: 'SM123', dispatched: true })) };
    const fallbackSend = vi.fn();
    const res = await sendChairmanSMS(statusMessage, DAYTIME, { sender, console: silentConsole, fallbackSend });
    expect(res).toMatchObject({ sent: true, reason: 'sent', authorityClass: 'sms' });
    expect(fallbackSend).not.toHaveBeenCalled();
  });
});
