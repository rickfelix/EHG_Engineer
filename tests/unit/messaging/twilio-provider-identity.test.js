/**
 * SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 (FR-3) — twilio-provider.js's additive optional
 * `identity` parameter on send()/isConfigured(). TESTING H4 (measured): a PARTIAL identity (e.g.
 * sid+token set, messagingService unset) must NOT fall through to a real, malformed Twilio call --
 * every test below that claims to exercise the identity path stubs fetch explicitly (TR-7 /
 * TESTING C13's vacuous-pass warning: shouldRefuseRealSend() short-circuits BEFORE the identity
 * branch under VITEST unless fetch is mocked, so an unstubbed test would pass without ever
 * reaching the code this file exists to prove).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { send, isConfigured } from '../../../lib/messaging/providers/twilio-provider.js';

const FULL_IDENTITY = { accountSid: 'AC_michael', authToken: 'token_michael', messagingService: 'MG_michael' };

describe('twilio-provider identity parameter (FR-3)', () => {
  const originalEnv = { ...process.env };
  let fetchMock;

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_fleet';
    process.env.TWILIO_AUTH_TOKEN = 'token_fleet';
    process.env.TWILIO_MESSAGING_SERVICE = 'MG_fleet';
    process.env.TWILIO_STATUS_CALLBACK_URL = 'https://example.test/twilio-callback';
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ sid: 'SM_test' }) }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  function callUrl() { return fetchMock.mock.calls[0][0]; }
  function callAuthHeader() { return fetchMock.mock.calls[0][1].headers.Authorization; }
  function bodyFromCall() { return new URLSearchParams(fetchMock.mock.calls[0][1].body); }

  describe('isConfigured(identity)', () => {
    it('true for a full identity, regardless of env', () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      expect(isConfigured(FULL_IDENTITY)).toBe(true);
    });
    it('H4: false for EVERY partial identity (never "close enough")', () => {
      expect(isConfigured({ accountSid: 'AC', authToken: 'tok' })).toBe(false); // missing messagingService
      expect(isConfigured({ accountSid: 'AC', messagingService: 'MG' })).toBe(false); // missing authToken
      expect(isConfigured({ authToken: 'tok', messagingService: 'MG' })).toBe(false); // missing accountSid
      expect(isConfigured({ accountSid: 'AC' })).toBe(false);
      expect(isConfigured({})).toBe(false);
    });
    it('with no identity argument, behaves exactly as before (env-based)', () => {
      expect(isConfigured()).toBe(true);
      delete process.env.TWILIO_AUTH_TOKEN;
      expect(isConfigured()).toBe(false);
    });
  });

  describe('send({identity})', () => {
    it('uses the identity credentials, never the env TWILIO_* values, for the request URL and auth header', async () => {
      await send({ to: '+15551234567', body: 'checkpoint', identity: FULL_IDENTITY });
      expect(callUrl()).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_michael/Messages.json');
      expect(callAuthHeader()).toBe(`Basic ${Buffer.from('AC_michael:token_michael').toString('base64')}`);
      expect(bodyFromCall().get('MessagingServiceSid')).toBe('MG_michael');
    });

    it('H4 (MEASURED, fetch stubbed): a partial identity refuses closed with ZERO fetch calls -- never a real malformed POST', async () => {
      const partial = { accountSid: 'AC_michael', authToken: 'token_michael' }; // messagingService missing
      const result = await send({ to: '+15551234567', body: 'checkpoint', identity: partial });
      expect(result).toEqual({ provider_message_id: null, status: 'failed', reason: 'twilio_not_configured' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('H4: every other partial-identity shape also refuses with zero fetch calls', async () => {
      const shapes = [
        { authToken: 'token_michael', messagingService: 'MG_michael' }, // missing accountSid
        { accountSid: 'AC_michael', messagingService: 'MG_michael' }, // missing authToken
        { accountSid: 'AC_michael' },
        {},
      ];
      for (const identity of shapes) {
        fetchMock.mockClear();
        const result = await send({ to: '+15551234567', body: 'checkpoint', identity });
        expect(result).toEqual({ provider_message_id: null, status: 'failed', reason: 'twilio_not_configured' });
        expect(fetchMock).not.toHaveBeenCalled();
      }
    });

    it('M5: an identity-bearing send OMITS StatusCallback even though TWILIO_STATUS_CALLBACK_URL is set', async () => {
      await send({ to: '+15551234567', body: 'checkpoint', identity: FULL_IDENTITY });
      expect(bodyFromCall().has('StatusCallback')).toBe(false);
    });

    it('a send with NO identity argument is byte-identical to pre-FR-3 behavior: env credentials, StatusCallback present', async () => {
      await send({ to: '+15551234567', body: 'fleet message' });
      expect(callUrl()).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_fleet/Messages.json');
      expect(callAuthHeader()).toBe(`Basic ${Buffer.from('AC_fleet:token_fleet').toString('base64')}`);
      const params = bodyFromCall();
      expect(params.get('MessagingServiceSid')).toBe('MG_fleet');
      expect(params.get('StatusCallback')).toBe('https://example.test/twilio-callback');
    });

    it('FR-3 AC: unsetting only the identity-scoped values never touches the env-based (Adam-lane) send in the same process', async () => {
      // The Michael identity is a plain object here, not env-derived -- but the point under test
      // is that a send WITHOUT identity in the same process/test run is completely unaffected by
      // whatever the identity object was on a prior call.
      await send({ to: '+15551234567', body: 'checkpoint', identity: FULL_IDENTITY });
      fetchMock.mockClear();
      await send({ to: '+15559999999', body: 'fleet message' }); // no identity -> env path
      expect(callUrl()).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_fleet/Messages.json');
      expect(bodyFromCall().get('StatusCallback')).toBe('https://example.test/twilio-callback');
    });
  });
});
