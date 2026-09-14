// SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 (FR-3 AC-2, TESTING M3) -- the actual resolver
// was previously exercised only via an injected `resolveIdentity: () => null` stand-in in
// checkpoint-send.test.js, so a typo in one of the three env var NAMES would never have been
// caught by a green suite. This file executes resolveCheckpointIdentity() itself against every
// one of the 8 possible presence/absence subsets of the three vars.
import { describe, it, expect, afterEach } from 'vitest';
import { resolveCheckpointIdentity } from './checkpoint-identity.mjs';

const VARS = ['MICHAEL_TWILIO_ACCOUNT_SID', 'MICHAEL_TWILIO_AUTH_TOKEN', 'MICHAEL_TWILIO_MESSAGING_SERVICE'];
const originalEnv = {};
for (const v of VARS) originalEnv[v] = process.env[v];

function setSubset(mask) {
  // mask is a 3-bit number; bit i set => VARS[i] is present with a distinct test value.
  VARS.forEach((v, i) => {
    if (mask & (1 << i)) process.env[v] = `${v}_test_value`;
    else delete process.env[v];
  });
}

afterEach(() => {
  for (const v of VARS) { if (originalEnv[v] === undefined) delete process.env[v]; else process.env[v] = originalEnv[v]; }
});

describe('resolveCheckpointIdentity (FR-3 AC-2)', () => {
  it('mask 7 (all three set): returns the full identity object with the real env var names', () => {
    setSubset(0b111);
    expect(resolveCheckpointIdentity()).toEqual({
      accountSid: 'MICHAEL_TWILIO_ACCOUNT_SID_test_value',
      authToken: 'MICHAEL_TWILIO_AUTH_TOKEN_test_value',
      messagingService: 'MICHAEL_TWILIO_MESSAGING_SERVICE_test_value',
    });
  });

  it.each([
    [0b000, 'none set'],
    [0b001, 'only accountSid'],
    [0b010, 'only authToken'],
    [0b100, 'only messagingService'],
    [0b011, 'accountSid + authToken, messagingService missing'],
    [0b101, 'accountSid + messagingService, authToken missing'],
    [0b110, 'authToken + messagingService, accountSid missing'],
  ])('mask %i (%s): a partial subset resolves to null, never a partial object', (mask) => {
    setSubset(mask);
    expect(resolveCheckpointIdentity()).toBeNull();
  });

  it('an empty-string value counts as absent, same as unset', () => {
    setSubset(0b111);
    process.env.MICHAEL_TWILIO_AUTH_TOKEN = '';
    expect(resolveCheckpointIdentity()).toBeNull();
  });

  it('reads the exact three env var names named in FR-3 -- a typo in the source would fail this test', () => {
    setSubset(0);
    process.env.MICHAEL_TWILIO_ACCOUNT_SID = 'sid';
    process.env.MICHAEL_TWILIO_AUTH_TOKEN = 'token';
    process.env.MICHAEL_TWILIO_MESSAGING_SERVICE = 'svc';
    expect(resolveCheckpointIdentity()).toEqual({ accountSid: 'sid', authToken: 'token', messagingService: 'svc' });
  });

  it('never reads the fleet-lane TWILIO_* names (FR-3 isolation)', () => {
    setSubset(0);
    process.env.TWILIO_ACCOUNT_SID = 'fleet-sid';
    process.env.TWILIO_AUTH_TOKEN = 'fleet-token';
    process.env.TWILIO_MESSAGING_SERVICE = 'fleet-svc';
    expect(resolveCheckpointIdentity()).toBeNull();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_MESSAGING_SERVICE;
  });
});
