/**
 * SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 — FR-4 tests for lib/fleet/account-identity.cjs.
 *
 * getAccountIdentity() is exercised ONLY via the injection seam (a fixture object or a fixture
 * file path) so these tests never touch the real logged-in account's ~/.claude.json.
 *
 * detectAccountSwitch() is pure (no IO, no persisted state of its own — the tick script owns
 * persistence), so "ticks" are simulated in-test by threading the previous call's `current`
 * into the next call's `prior`, mirroring how scripts/adam-quiet-tick.mjs uses it against its
 * `.account-identity-last.json` state file.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getAccountIdentity, detectAccountSwitch } = require('../../../lib/fleet/account-identity.cjs');

// Token-shaped leak regex — pinned to the exact pattern from the SD spec.
const LEAK_RE = /(sk-[A-Za-z0-9]+|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+|[A-Za-z0-9_-]{40,})/;

function validFixture(overrides = {}) {
  return {
    oauthAccount: {
      emailAddress: 'chairman@example.com',
      organizationName: 'ExecHoldings Global LLC',
      accountUuid: 'abcd1234-5678-90ab-cdef-1234567890ab',
      billingType: 'enterprise',
      seatTier: 'max',
      userRateLimitTier: 'tier-5',
      ...overrides.oauthAccountExtra,
    },
    ...overrides.siblings,
  };
}

describe('getAccountIdentity (FR-1)', () => {
  it('Test 1 — positive whitelist: returns EXACTLY the 3 whitelisted keys', () => {
    const result = getAccountIdentity(validFixture());
    expect(result).not.toBeNull();
    expect(Object.keys(result).sort()).toEqual(['accountUuid8', 'email', 'orgName']);
    expect(result.email).toBe('chairman@example.com');
    expect(result.orgName).toBe('ExecHoldings Global LLC');
    expect(result.accountUuid8).toBe('abcd1234');
  });

  it('Test 2 — leak-safety: no token-shaped substring from oauthAccount or sibling keys ever appears in the result', () => {
    const fixture = validFixture({
      // NOTE: fixture strings below are intentionally SHORT fakes (under real credential
      // length) — long enough to trip this test's own LEAK_RE, short enough to stay clear of
      // the repo's pre-commit secret scanner's length-gated patterns (which require 16-20+
      // chars). See .husky/pre-commit's documented false-positive guidance for test/mock data.
      oauthAccountExtra: {
        // extra oauthAccount sub-fields carrying token-shaped strings — must never leak.
        accessToken: 'eyJfakeJwtFixtureNoRealToken',
        apiKeyHint: 'sk-fakeFixture1',
        authHeader: 'Bearer fake-fixture-not-a-real-token-0123456789-abcdef',
        longOpaqueId: 'a'.repeat(64),
      },
      siblings: {
        // sibling TOP-LEVEL config keys (outside oauthAccount) carrying token-shaped strings —
        // getAccountIdentity must never even look at these, let alone leak them.
        apiKey: 'sk-fakeTopFixture2',
        sessionToken: 'eyJfakeTopLevelJwtFixtureNoRealToken',
        someBearerHeader: 'Bearer fake-top-level-fixture-not-a-real-token-abcdef',
      },
    });

    const result = getAccountIdentity(fixture);
    expect(result).not.toBeNull();
    const serialized = JSON.stringify(result);

    // Sanity: the fixture DOES contain leak-shaped strings (proves the regex + fixture are wired
    // correctly, i.e. this isn't a vacuously-passing test).
    expect(LEAK_RE.test(JSON.stringify(fixture))).toBe(true);
    // The actual assertion: none of that leaks through the whitelisted result.
    expect(LEAK_RE.test(serialized)).toBe(false);
  });

  it('Test 6 — fail-soft: missing file path returns null, never throws', () => {
    expect(() => getAccountIdentity('/no/such/path/.claude.json')).not.toThrow();
    expect(getAccountIdentity('/no/such/path/.claude.json')).toBeNull();
  });

  it('Test 6 — fail-soft: malformed JSON file returns null, never throws', () => {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const tmpFile = path.join(os.tmpdir(), `account-identity-malformed-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, '{ not valid json ][');
    try {
      expect(() => getAccountIdentity(tmpFile)).not.toThrow();
      expect(getAccountIdentity(tmpFile)).toBeNull();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('Test 6 — fail-soft: oauthAccount missing a required sub-field returns null, never throws', () => {
    const missingEmail = validFixture();
    delete missingEmail.oauthAccount.emailAddress;
    expect(() => getAccountIdentity(missingEmail)).not.toThrow();
    expect(getAccountIdentity(missingEmail)).toBeNull();

    const missingOrg = validFixture();
    delete missingOrg.oauthAccount.organizationName;
    expect(getAccountIdentity(missingOrg)).toBeNull();

    const missingUuid = validFixture();
    delete missingUuid.oauthAccount.accountUuid;
    expect(getAccountIdentity(missingUuid)).toBeNull();
  });

  it('Test 6 — fail-soft: missing/malformed oauthAccount object returns null, never throws', () => {
    expect(getAccountIdentity({})).toBeNull();
    expect(getAccountIdentity({ oauthAccount: 'not-an-object' })).toBeNull();
    expect(getAccountIdentity({ oauthAccount: null })).toBeNull();
  });
});

describe('detectAccountSwitch (FR-3)', () => {
  const identityA = { email: 'a@example.com', orgName: 'Org A', accountUuid8: 'aaaa1111' };
  const identityB = { email: 'b@example.com', orgName: 'Org B', accountUuid8: 'bbbb2222' };

  /** Threads prior/current through detectAccountSwitch the same way the tick script does. */
  function simulateTicks(identitySequence) {
    let prior = null;
    const events = [];
    for (const current of identitySequence) {
      const result = detectAccountSwitch(prior, current);
      if (result.changed) events.push(result.event);
      prior = current; // baseline write happens every tick regardless of switch
    }
    return events;
  }

  it('Test 3 — switch fires exactly once from an established prior', () => {
    // tick 1: cold start (baseline write, no event) -> tick 2: stable -> tick 3: switch
    const events = simulateTicks([identityA, identityA, identityB]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ACCOUNT_SWITCH');
    expect(events[0].from.email).toBe('a@example.com');
    expect(events[0].to.email).toBe('b@example.com');
  });

  it('Test 3b — debounce holds on the tick immediately following a genuine switch', () => {
    // tick 1: cold start -> tick 2: stable -> tick 3: switch (fires) -> tick 4: stable at the
    // NEW identity — must stay silent. Regression guard against accidentally gating the
    // baseline-write behind the `changed` branch (which would make tick 4 fire again).
    const events = simulateTicks([identityA, identityA, identityB, identityB]);
    expect(events).toHaveLength(1);
    expect(events[0].to.email).toBe('b@example.com');
  });

  it('Test 4 — silent across N stable ticks with the same identity', () => {
    const events = simulateTicks([identityA, identityA, identityA, identityA]);
    expect(events).toHaveLength(0);
  });

  it('Test 5 — cold start is silent even though a current identity exists', () => {
    const result = detectAccountSwitch(null, identityA);
    expect(result.changed).toBe(false);
    expect(result.event).toBeNull();

    const events = simulateTicks([identityA]);
    expect(events).toHaveLength(0);
  });

  it('is silent when there is no current identity to compare (fail-soft)', () => {
    const result = detectAccountSwitch(identityA, null);
    expect(result.changed).toBe(false);
    expect(result.event).toBeNull();
  });
});
