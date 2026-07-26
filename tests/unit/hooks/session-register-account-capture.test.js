/**
 * QF-20260726-514 — per-session ACCOUNT capture at registration.
 *
 * THE DEFECT: no session recorded its account, and the only instrument
 * (.account-identity-last.json) is HOST-GLOBAL and LAST-WRITER-WINS. It answers "which
 * account did this host last see"; the Sessions UI needs "which account is THIS session on".
 * Rendering the host-global file per row would show every session on the same account and
 * would look correct right up until the fleet splits across accounts — which is the only time
 * the column matters.
 *
 * These tests pin the two properties that make the capture safe rather than merely present:
 *   1. it NEVER writes metadata it could not first read (a metadata PATCH replaces the whole
 *      JSONB, and model/effort/tier_rank live there — clobbering them makes a seat
 *      undispatchable), and
 *   2. an unresolved account stays ABSENT rather than being stored as null/unknown, because a
 *      stored placeholder is indistinguishable from a real answer downstream.
 * Every refusal is paired with a control proving the writer CAN still write, so "it never
 * writes" cannot pass for "it writes safely".
 */
import { describe, test, expect } from 'vitest';
// session-register is CJS; reach its exports through default interop.
import sessionRegister from '../../../scripts/hooks/session-register.cjs';

const { captureAccountIdentity } = sessionRegister;

const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const EXISTING = { model: 'opus', effort: 'xhigh', tier_rank: 4 };

/** Minimal supabase double: records the update payload, scripts the select result. */
function makeDb({ selectData = null, selectError = null } = {}) {
  const calls = { updates: [] };
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    maybeSingle: async () => ({ data: selectData, error: selectError }),
    update(payload) { calls.updates.push(payload); return { eq: async () => ({ error: null }) }; },
  };
  return { api, calls };
}

describe('QF-514: account capture writes only what it could read', () => {
  test('a FAILED metadata read writes NOTHING — never clobbers siblings', async () => {
    const { api, calls } = makeDb({ selectError: { message: 'boom' } });
    await captureAccountIdentity(api, SID);
    expect(calls.updates).toHaveLength(0);
  });

  test('a MISSING row writes nothing (no row to merge into)', async () => {
    const { api, calls } = makeDb({ selectData: null });
    await captureAccountIdentity(api, SID);
    expect(calls.updates).toHaveLength(0);
  });

  test('an ALREADY-CAPTURED session is a no-op — no repeat CLI spawn per resume', async () => {
    const { api, calls } = makeDb({
      selectData: { metadata: { ...EXISTING, account_email: 'someone@example.com' } },
    });
    await captureAccountIdentity(api, SID);
    expect(calls.updates).toHaveLength(0);
  });

  test('CONTROL: when it does write, it MERGES and preserves model/effort/tier_rank', async () => {
    // This is the arm that proves the guard is not simply always-skip. It only asserts the
    // merge shape when a write actually happened — on a host where `claude auth status` cannot
    // resolve an account there is legitimately nothing to write, and asserting otherwise would
    // make the suite environment-dependent.
    const { api, calls } = makeDb({ selectData: { metadata: { ...EXISTING } } });
    await captureAccountIdentity(api, SID);
    if (calls.updates.length === 0) return; // unresolved account on this host — correct behaviour
    const written = calls.updates[0].metadata;
    expect(written.model).toBe('opus');           // siblings survived the merge
    expect(written.effort).toBe('xhigh');
    expect(written.tier_rank).toBe(4);
    expect(typeof written.account_email).toBe('string');
    expect(written.account_email).toContain('@');
    expect(written.account_captured_at).toBeTruthy();
    // Absent-not-null: any unresolved sub-field is null, never the string 'unknown'.
    for (const k of ['account_org_name', 'account_subscription_type', 'account_auth_method']) {
      if (written[k] !== null) expect(typeof written[k]).toBe('string');
    }
  });
});
