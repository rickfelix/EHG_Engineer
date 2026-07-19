/**
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D (FR-3) — twilio-provider.js MediaUrl support.
 * No existing dedicated send() test file exists for twilio-provider.js (confirmed by Explore
 * recon) -- this is the first direct unit test of send()'s form-body construction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { send } from '../../../lib/messaging/providers/twilio-provider.js';

describe('twilio-provider send() MediaUrl (FR-3)', () => {
  const originalEnv = { ...process.env };
  let fetchMock;

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test';
    process.env.TWILIO_AUTH_TOKEN = 'token_test';
    process.env.TWILIO_MESSAGING_SERVICE = 'MG_test';
    delete process.env.TWILIO_STATUS_CALLBACK_URL;
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sid: 'SM_test' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  function bodyFromCall() {
    return new URLSearchParams(fetchMock.mock.calls[0][1].body);
  }

  it('sets the MediaUrl form param when mediaUrl is provided', async () => {
    await send({ to: '+15551234567', body: 'hi', mediaUrl: 'https://signed.example/gantt.png' });
    expect(bodyFromCall().get('MediaUrl')).toBe('https://signed.example/gantt.png');
  });

  it('omits MediaUrl when not provided -- byte-identical to pre-change behavior', async () => {
    await send({ to: '+15551234567', body: 'hi' });
    expect(bodyFromCall().has('MediaUrl')).toBe(false);
  });

  it('still sets To/Body/MessagingServiceSid regardless of mediaUrl', async () => {
    await send({ to: '+15551234567', body: 'hi', mediaUrl: 'https://signed.example/gantt.png' });
    const params = bodyFromCall();
    expect(params.get('To')).toBe('+15551234567');
    expect(params.get('Body')).toBe('hi');
    expect(params.get('MessagingServiceSid')).toBe('MG_test');
  });
});
