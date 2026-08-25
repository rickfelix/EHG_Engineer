/**
 * SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-4 — flag-gated decommission of the direct-write
 * inbound path in api/webhooks/twilio-sms.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { handleInboundSmsReply } = vi.hoisted(() => ({
  handleInboundSmsReply: vi.fn(async () => ({ resolved: true, outcome: 'answered' })),
}));
vi.mock('../../../lib/chairman/sms-bridge.js', () => ({ handleInboundSmsReply }));
vi.mock('../../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: () => ({ from: vi.fn() }) }));
vi.mock('../../../lib/messaging/providers/twilio-provider.js', () => ({
  default: {
    verifyInboundSignature: () => true,
    normalizeInboundWebhook: (body) => ({ from: body.From, to: body.To, body: body.Body, messageSid: body.MessageSid }),
    parseStatusCallback: (body) => ({ messageSid: body.MessageSid, status: body.MessageStatus }),
  },
}));

import { handleTwilioSmsWebhook, handleTwilioStatusCallback } from '../../../api/webhooks/twilio-sms.js';

function makeRes() {
  const res = { statusCode: null, headers: {}, body: null };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.set = vi.fn((k, v) => { res.headers[k] = v; return res; });
  res.send = vi.fn((body) => { res.body = body; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

describe('handleTwilioSmsWebhook FR-4 cutover flag', () => {
  const OLD_ENV = process.env.SMS_RELAY_CUTOVER_COMPLETE;
  const OLD_URL = process.env.TWILIO_SMS_WEBHOOK_URL;

  beforeEach(() => {
    handleInboundSmsReply.mockClear();
    process.env.TWILIO_SMS_WEBHOOK_URL = 'https://engineer.example.com/api/webhooks/twilio-sms';
  });
  afterEach(() => {
    process.env.SMS_RELAY_CUTOVER_COMPLETE = OLD_ENV;
    process.env.TWILIO_SMS_WEBHOOK_URL = OLD_URL;
  });

  it('default (unset): unchanged behavior — still resolves via handleInboundSmsReply', async () => {
    delete process.env.SMS_RELAY_CUTOVER_COMPLETE;
    const req = { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { From: '+1', To: '+2', Body: 'yes', MessageSid: 'SM1' }, protocol: 'https', get: () => 'host', originalUrl: '/x' };
    const res = makeRes();

    await handleTwilioSmsWebhook(req, res);

    expect(handleInboundSmsReply).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toContain('<Response>');
  });

  it('SMS_RELAY_CUTOVER_COMPLETE=true: decommissioned — never calls handleInboundSmsReply, still returns the same uniform response', async () => {
    process.env.SMS_RELAY_CUTOVER_COMPLETE = 'true';
    const req = { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { From: '+1', To: '+2', Body: 'yes', MessageSid: 'SM1' }, protocol: 'https', get: () => 'host', originalUrl: '/x' };
    const res = makeRes();

    await handleTwilioSmsWebhook(req, res);

    expect(handleInboundSmsReply).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toContain('<Response>');
  });

  it('a rollback (unsetting the flag again) restores the original behavior', async () => {
    process.env.SMS_RELAY_CUTOVER_COMPLETE = 'true';
    const req = { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { From: '+1', To: '+2', Body: 'yes', MessageSid: 'SM1' }, protocol: 'https', get: () => 'host', originalUrl: '/x' };

    await handleTwilioSmsWebhook(req, makeRes());
    expect(handleInboundSmsReply).not.toHaveBeenCalled();

    delete process.env.SMS_RELAY_CUTOVER_COMPLETE;
    await handleTwilioSmsWebhook(req, makeRes());
    expect(handleInboundSmsReply).toHaveBeenCalledTimes(1);
  });

  it('non-POST is still rejected regardless of the cutover flag', async () => {
    process.env.SMS_RELAY_CUTOVER_COMPLETE = 'true';
    const res = makeRes();
    await handleTwilioSmsWebhook({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// QF-20260822-215: applyOwedDeliveryTruth must distinguish a table-absent no-op (STAGED
// migration unapplied) from a genuine write failure, which must be logged, not swallowed.
describe('handleTwilioStatusCallback applyOwedDeliveryTruth error visibility', () => {
  const provider = {
    verifyInboundSignature: () => true,
    parseStatusCallback: (body) => ({ messageSid: body.MessageSid, status: body.MessageStatus }),
  };

  function chainable(terminalResult) {
    const obj = {
      update: vi.fn(() => obj),
      not: vi.fn(() => obj),
      or: vi.fn(() => obj),
      eq: vi.fn(() => obj),
      select: vi.fn(() => obj),
      limit: vi.fn(() => Promise.resolve(terminalResult)),
    };
    return obj;
  }

  function makeSupabase(obligationsResult) {
    return { from: vi.fn((table) => chainable(table === 'sms_outbound_obligations' ? obligationsResult : { data: null, error: null })) };
  }

  let warnSpy;
  beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warnSpy.mockRestore(); });

  const req = { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { MessageSid: 'SM1', MessageStatus: 'delivered' }, protocol: 'https', get: () => 'host', originalUrl: '/x' };

  it('table-absent (42P01) is a silent no-op — never warns', async () => {
    const supabase = makeSupabase({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    await handleTwilioStatusCallback(req, makeRes(), { supabase, provider });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('table-absent (PGRST205) is a silent no-op — never warns', async () => {
    const supabase = makeSupabase({ data: null, error: { code: 'PGRST205', message: 'table not found in schema cache' } });
    await handleTwilioStatusCallback(req, makeRes(), { supabase, provider });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a genuine write failure is visible — warns with the SID and error message', async () => {
    const supabase = makeSupabase({ data: null, error: { code: '42501', message: 'permission denied' } });
    await handleTwilioStatusCallback(req, makeRes(), { supabase, provider });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('SM1');
    expect(warnSpy.mock.calls[0][0]).toContain('permission denied');
  });

  it('a zero-row match with no error stays silent (expected — most callbacks have no owed row)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    await handleTwilioStatusCallback(req, makeRes(), { supabase, provider });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3 AC-2: this is the legacy DIRECT (synchronous)
  // Twilio webhook path — a genuine carrier push, distinct from the new relay-staged drain, but
  // both converge on the same writer and must both stamp source='carrier_push'.
  it('FR-3 AC-2: stamps delivery_status_source=carrier_push via the extracted writer', async () => {
    let capturedPatch;
    const builder = {
      update: vi.fn((patch) => { capturedPatch = patch; return builder; }),
      not: vi.fn(() => builder),
      or: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      select: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve({ data: [{ id: 'row-1' }], error: null })),
    };
    const supabase = { from: vi.fn(() => builder) };
    await handleTwilioStatusCallback(req, makeRes(), { supabase, provider });
    expect(capturedPatch).toMatchObject({ delivery_status_source: 'carrier_push' });
  });
});

// SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-7 AC-3 gap #1 (Explore finding): handleTwilioStatusCallback's
// OWN 401-signature path had zero direct test coverage (only the inbound-reply handler's signature
// path was exercised elsewhere).
describe('handleTwilioStatusCallback signature verification', () => {
  const req = { method: 'POST', headers: { 'x-twilio-signature': 'bad-sig' }, body: { MessageSid: 'SM1', MessageStatus: 'delivered' }, protocol: 'https', get: () => 'host', originalUrl: '/x' };

  it('an invalid signature returns 401 before any database write', async () => {
    const provider = {
      verifyInboundSignature: () => false,
      parseStatusCallback: () => ({ messageSid: 'SM1', status: 'delivered' }),
    };
    const fromSpy = vi.fn();
    const supabase = { from: fromSpy };
    const res = makeRes();

    await handleTwilioStatusCallback(req, res, { supabase, provider });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('a missing signature header also returns 401', async () => {
    const provider = { verifyInboundSignature: () => false, parseStatusCallback: () => ({ messageSid: 'SM1', status: 'delivered' }) };
    const noSigReq = { ...req, headers: {} };
    const res = makeRes();
    await handleTwilioStatusCallback(noSigReq, res, { supabase: { from: vi.fn() }, provider });
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-7 AC-3 gap #2 (Explore finding): the
// TWILIO_STATUS_TO_NOTIFICATION_STATUS collapse had zero direct test coverage.
describe('TWILIO_STATUS_TO_NOTIFICATION_STATUS mapping (chairman_notifications)', () => {
  const provider = { verifyInboundSignature: () => true, parseStatusCallback: (body) => ({ messageSid: body.MessageSid, status: body.MessageStatus }) };

  function makeSupabaseCapturingNotifications() {
    const notifPatches = [];
    const obligationsBuilder = {
      update: vi.fn(() => obligationsBuilder), not: vi.fn(() => obligationsBuilder), or: vi.fn(() => obligationsBuilder),
      eq: vi.fn(() => obligationsBuilder), select: vi.fn(() => obligationsBuilder), limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    const notifBuilder = {
      update: vi.fn((patch) => { notifPatches.push(patch); return notifBuilder; }),
      eq: vi.fn(() => notifBuilder),
      then: (resolve) => resolve({ data: null, error: null }),
    };
    const supabase = { from: vi.fn((table) => (table === 'sms_outbound_obligations' ? obligationsBuilder : notifBuilder)) };
    return { supabase, notifPatches };
  }

  it.each([
    ['queued', 'queued'], ['sending', 'queued'], ['sent', 'sent'],
    ['delivered', 'sent'], ['undelivered', 'failed'], ['failed', 'failed'],
  ])('MessageStatus=%s collapses to chairman_notifications.status=%s', async (twilioStatus, expectedNotificationStatus) => {
    const { supabase, notifPatches } = makeSupabaseCapturingNotifications();
    const req = { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { MessageSid: 'SM1', MessageStatus: twilioStatus }, protocol: 'https', get: () => 'host', originalUrl: '/x' };
    await handleTwilioStatusCallback(req, makeRes(), { supabase, provider });
    expect(notifPatches[0]).toEqual({ status: expectedNotificationStatus });
  });
});
