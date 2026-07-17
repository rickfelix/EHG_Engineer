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

import { handleTwilioSmsWebhook } from '../../../api/webhooks/twilio-sms.js';

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
