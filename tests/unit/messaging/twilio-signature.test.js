/**
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-2 — Twilio inbound signature verification.
 * Fully in-process: builds a deterministic signature via the test helper (no
 * network, no live account), then verifies it through the actual provider code.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyInboundSignature } from '../../../lib/messaging/providers/twilio-provider.js';
import { buildTwilioSignature } from '../../../lib/test-helpers/twilio-signature.js';

const AUTH_TOKEN = 'test_auth_token_12345';
const URL = 'https://example.com/api/webhooks/twilio-sms';
const PARAMS = { From: '+15551234567', To: '+15559876543', Body: 'yes, approve it', MessageSid: 'SM123' };

describe('twilio-provider verifyInboundSignature', () => {
  let prevToken;
  beforeEach(() => {
    prevToken = process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  });
  afterEach(() => {
    process.env.TWILIO_AUTH_TOKEN = prevToken;
  });

  it('accepts a validly signed request', () => {
    const signature = buildTwilioSignature(URL, PARAMS, AUTH_TOKEN);
    expect(verifyInboundSignature({ url: URL, params: PARAMS, signature })).toBe(true);
  });

  it('rejects a mutated param', () => {
    const signature = buildTwilioSignature(URL, PARAMS, AUTH_TOKEN);
    const tampered = { ...PARAMS, Body: 'no, reject it' };
    expect(verifyInboundSignature({ url: URL, params: tampered, signature })).toBe(false);
  });

  it('rejects a stripped/empty signature', () => {
    expect(verifyInboundSignature({ url: URL, params: PARAMS, signature: '' })).toBe(false);
    expect(verifyInboundSignature({ url: URL, params: PARAMS, signature: undefined })).toBe(false);
  });

  it('rejects when auth token is not configured (fail closed)', () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const signature = buildTwilioSignature(URL, PARAMS, AUTH_TOKEN);
    expect(verifyInboundSignature({ url: URL, params: PARAMS, signature })).toBe(false);
  });

  it('rejects a signature computed with the wrong auth token', () => {
    const signature = buildTwilioSignature(URL, PARAMS, 'wrong_token');
    expect(verifyInboundSignature({ url: URL, params: PARAMS, signature })).toBe(false);
  });
});
