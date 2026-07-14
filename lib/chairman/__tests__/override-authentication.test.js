/**
 * Chairman override authentication tests (L6, FR-1..FR-4).
 * (SD-LEO-INFRA-AUTHENTICATE-CHAIRMAN-OVERRIDES-001)
 */
import { describe, it, expect } from 'vitest';
import {
  resolveAuthenticatedIdentity,
  recordAuthenticatedOverride,
  authenticationRatio,
  surfaceAuthMechanismQuestion,
} from '../override-authentication.js';

const UID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('resolveAuthenticatedIdentity (FR-2 — never fabricate)', () => {
  it('returns a UUID from an explicit authenticated id', () => {
    expect(resolveAuthenticatedIdentity({ authenticatedUserId: UID })).toBe(UID);
  });
  it('returns a UUID from a supabase auth session', () => {
    expect(resolveAuthenticatedIdentity({ session: { user: { id: UID } } })).toBe(UID);
  });
  it('returns NULL when no authenticated identity is present', () => {
    expect(resolveAuthenticatedIdentity({})).toBeNull();
  });
  it('does NOT accept a free-text decided_by string as an identity', () => {
    expect(resolveAuthenticatedIdentity({ authenticatedUserId: 'chairman-verbal-relay:codestreetlabs@gmail.com' })).toBeNull();
    expect(resolveAuthenticatedIdentity({ authenticatedUserId: 'adam' })).toBeNull();
  });
});

describe('recordAuthenticatedOverride (FR-1/FR-2 — fail-soft, honest)', () => {
  function mockSupabase() {
    const calls = { updates: [] };
    return {
      calls,
      from() {
        return {
          update(patch) { this._p = patch; return this; },
          eq(_c, v) { calls.updates.push({ id: v, patch: this._p }); return Promise.resolve({ error: null }); },
        };
      },
    };
  }

  it('stamps decided_by_user_id when authenticated', async () => {
    const sb = mockSupabase();
    const r = await recordAuthenticatedOverride({ supabase: sb }, { decisionId: 'd1', decision: 'approved', identityContext: { authenticatedUserId: UID } });
    expect(r.authenticated).toBe(true);
    expect(r.userId).toBe(UID);
    expect(sb.calls.updates[0].patch.decided_by_user_id).toBe(UID);
  });

  it('leaves decided_by_user_id UNSET when no identity (honest unauthenticated)', async () => {
    const sb = mockSupabase();
    const r = await recordAuthenticatedOverride({ supabase: sb }, { decisionId: 'd2', decision: 'approved', decidedBy: 'chairman-verbal-relay:x@y.com' });
    expect(r.authenticated).toBe(false);
    expect(r.userId).toBeNull();
    expect(sb.calls.updates[0].patch).not.toHaveProperty('decided_by_user_id');
    expect(sb.calls.updates[0].patch.decided_by).toBe('chairman-verbal-relay:x@y.com'); // free-text kept as provenance
  });

  it('FAIL-SOFT: a tracker throw does not block the decision', async () => {
    const sb = mockSupabase();
    const recordOverride = async () => { throw new Error('tracker boom'); };
    const r = await recordAuthenticatedOverride({ supabase: sb, recordOverride }, { decisionId: 'd3', decision: 'approved', identityContext: { authenticatedUserId: UID } });
    expect(r.decisionUpdated).toBe(true);
    expect(r.trackerRecorded).toBe(false); // tracker failed, but decision succeeded
  });

  it('fires the tracker with decided_by_user_id=null when unauthenticated', async () => {
    const sb = mockSupabase();
    let trackerArg = null;
    const recordOverride = async (_d, arg) => { trackerArg = arg; };
    await recordAuthenticatedOverride({ supabase: sb, recordOverride }, { decisionId: 'd4', decision: 'rejected' });
    expect(trackerArg.authenticated).toBe(false);
    expect(trackerArg.decided_by_user_id).toBeNull();
  });
});

describe('authenticationRatio (FR-3 — honest, legacy stays unauthenticated)', () => {
  it('computes authenticated/total with legacy NULL rows as unauthenticated', async () => {
    const supabase = {
      from() {
        const q = {
          _notNull: false,
          select() { return this; },
          not() { this._notNull = true; return this; },
          then(res) { return Promise.resolve({ count: this._notNull ? 3 : 100, error: null }).then(res); },
        };
        return q;
      },
    };
    const r = await authenticationRatio(supabase);
    expect(r.ok).toBe(true);
    expect(r.total).toBe(100);
    expect(r.authenticated).toBe(3);
    expect(r.unauthenticated).toBe(97); // the ~97% NULL legacy rows, honestly unauthenticated
    expect(r.ratio).toBeCloseTo(0.03);
  });

  it('fail-soft on a query error', async () => {
    const supabase = { from() { return { select() { return this; }, not() { return this; }, then(res) { return Promise.resolve({ error: { message: 'boom' } }).then(res); } }; } };
    const r = await authenticationRatio(supabase);
    expect(r.ok).toBe(false);
  });
});

describe('surfaceAuthMechanismQuestion (FR-4 — chairman-owned, not invented)', () => {
  it('records a blocking chairman question via the canonical recorder', async () => {
    let recorded = null;
    const recordPendingDecision = async (_sb, args) => { recorded = args; return { recorded: true, id: 'q1' }; };
    const r = await surfaceAuthMechanismQuestion({ supabase: {}, recordPendingDecision });
    expect(r.recorded).toBe(true);
    expect(recorded.blocking).toBe(true);
    expect(recorded.title).toMatch(/authenticate/i);
    expect(recorded.context).toMatch(/verbal-relay/); // carries the live-proof context
    expect(recorded.context).toMatch(/OPTIONS/); // presents options, does not decide
  });
});
