/**
 * SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001 -- guard predicates unit tests.
 * Covers PRD test_scenarios TS-1, TS-2, TS-3, TS-4, TS-5, TS-7 at the guard-function level (driveAction
 * integration is covered separately in tests/unit/fleet/browser-control.test.js).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  isKillSwitchEngaged,
  isActionAllowlisted,
  isFencedIdentity,
  tryConsumeSessionActionCap,
  checkOutboundActionAuthorized,
  DEFAULT_SESSION_ACTION_CAP,
} from '../../../lib/fleet/browser-actuation-guards.js';

/** Minimal fluent mock for a single app_config key lookup. */
function makeAppConfigMock(value, { error = null } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: value === undefined ? null : { value }, error })),
        })),
      })),
    })),
  };
}

describe('isKillSwitchEngaged — FR-2 (TS-3, TS-4)', () => {
  it('is STOPPED (engaged=true) when the config row is missing (fail closed)', async () => {
    expect(await isKillSwitchEngaged(makeAppConfigMock(undefined))).toBe(true);
  });

  it('is STOPPED when the read errors (TS-4)', async () => {
    expect(await isKillSwitchEngaged(makeAppConfigMock({ engaged: false }, { error: { message: 'simulated' } }))).toBe(true);
  });

  it('is STOPPED when the value is malformed JSON', async () => {
    expect(await isKillSwitchEngaged(makeAppConfigMock('{not json'))).toBe(true);
  });

  it('is STOPPED when engaged is anything other than explicit false', async () => {
    expect(await isKillSwitchEngaged(makeAppConfigMock({}))).toBe(true);
    expect(await isKillSwitchEngaged(makeAppConfigMock({ engaged: true }))).toBe(true);
    expect(await isKillSwitchEngaged(makeAppConfigMock({ engaged: 'false' }))).toBe(true);
  });

  it('is NOT engaged only with an explicit {engaged:false} value (TS-3)', async () => {
    expect(await isKillSwitchEngaged(makeAppConfigMock({ engaged: false }))).toBe(false);
  });

  it('is STOPPED when supabase.from throws synchronously (e.g. a test stub without .from)', async () => {
    expect(await isKillSwitchEngaged({})).toBe(true);
  });
});

describe('isActionAllowlisted — FR-1 deny-by-default write allowlist (TS-1, TS-2)', () => {
  it('is NOT allowlisted when the config row is missing (fail closed / deny by default)', async () => {
    expect(await isActionAllowlisted(makeAppConfigMock(undefined), 'browser_write_click_submit')).toBe(false);
  });

  it('is NOT allowlisted when the read errors (TS-2)', async () => {
    const client = makeAppConfigMock(['browser_write_click_submit'], { error: { message: 'simulated' } });
    expect(await isActionAllowlisted(client, 'browser_write_click_submit')).toBe(false);
  });

  it('accepts a bare array or a {allowed:[...]} shape', async () => {
    expect(await isActionAllowlisted(makeAppConfigMock(['browser_write_click_submit']), 'browser_write_click_submit')).toBe(true);
    expect(await isActionAllowlisted(makeAppConfigMock({ allowed: ['browser_write_click_submit'] }), 'browser_write_click_submit')).toBe(true);
  });

  it('refuses an eventType not present in the allowlist (TS-1)', async () => {
    expect(await isActionAllowlisted(makeAppConfigMock(['browser_write_click_submit']), 'browser_write_delete_account')).toBe(false);
  });
});

describe('isFencedIdentity — FR-6 (TS-7)', () => {
  it('is false when the field is absent/false', () => {
    expect(isFencedIdentity({ metadata: {} })).toBe(false);
    expect(isFencedIdentity({ metadata: { fenced_venture: false } })).toBe(false);
    expect(isFencedIdentity(null)).toBe(false);
  });

  it('is true only when explicitly true (TS-7 permits; a non-fenced session is refused elsewhere)', () => {
    expect(isFencedIdentity({ metadata: { fenced_venture: true } })).toBe(true);
  });
});

describe('tryConsumeSessionActionCap — FR-4 atomic per-session cap (TS-5)', () => {
  it('allows and consumes when the RPC returns true', async () => {
    const client = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    const result = await tryConsumeSessionActionCap(client, 'session-x', 5);
    expect(result.allowed).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('fn_try_consume_browser_actuation_cap', { p_session_id: 'session-x', p_cap_limit: 5 });
  });

  it('refuses when the RPC returns false (cap reached, no mutation)', async () => {
    const client = { rpc: vi.fn(async () => ({ data: false, error: null })) };
    const result = await tryConsumeSessionActionCap(client, 'session-x', 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('session_cap_exceeded');
  });

  it('fails closed on an RPC error', async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: 'simulated' } })) };
    const result = await tryConsumeSessionActionCap(client, 'session-x', 5);
    expect(result.allowed).toBe(false);
  });

  it('fails closed when the client throws synchronously', async () => {
    const client = { rpc: vi.fn(() => { throw new Error('boom'); }) };
    const result = await tryConsumeSessionActionCap(client, 'session-x', 5);
    expect(result.allowed).toBe(false);
  });

  it('defaults to DEFAULT_SESSION_ACTION_CAP when no cap limit is passed', async () => {
    const client = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    await tryConsumeSessionActionCap(client, 'session-x');
    expect(client.rpc).toHaveBeenCalledWith('fn_try_consume_browser_actuation_cap', { p_session_id: 'session-x', p_cap_limit: DEFAULT_SESSION_ACTION_CAP });
  });
});

describe('checkOutboundActionAuthorized — FR-5 (delegates entirely to autonomy-gate, no local re-implementation)', () => {
  it('fails closed (never allowed=true) when the delegate throws or its dependencies are unusable', async () => {
    // A deliberately malformed supabase forces checkPublishAuthorization's own internal calls to
    // throw; this test asserts THIS wrapper's own catch-and-fail-closed contract, not
    // checkPublishAuthorization's internal logic (covered by autonomy-gate's own test suite).
    const result = await checkOutboundActionAuthorized({ supabase: null, ventureId: undefined });
    expect(result.allowed).not.toBe(true);
  });
});
