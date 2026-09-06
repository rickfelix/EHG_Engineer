/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F — scripts/verify-quick-fixes-metadata-activation.mjs.
 *
 * TS-2: ACTIVATED classification via dependency injection (no live DB).
 * TS-3: REGRESSED classification via dependency injection.
 * TS-5: INDETERMINATE classification via dependency injection.
 * TS-6: scratch QF payload is never belt-auto-startable (status != 'open', claiming_session_id set).
 * TS-7: scratch id matches QF_ID_RE (/^QF-/).
 *
 * All cases use resolveActivationState()'s own injection seam (dbClientFactory,
 * mergeQfMetadataFn, stampClaimFn) — no real DB connection, no schema mutation. Matches the
 * TESTING-agent finding (evidence 65c242f0) that scripts/lib/supabase-connection.js exposes
 * only the ehg/engineer projects, both live production databases with no staging equivalent, so
 * ACTIVATED/REGRESSED/INDETERMINATE must be provable without ever touching real schema.
 */
import { describe, it, expect } from 'vitest';
import { resolveActivationState, probeColumnPresent, EXIT_CODES } from '../../../scripts/verify-quick-fixes-metadata-activation.mjs';

const fakeAbsentDb = async () => ({
  query: async () => { const e = new Error('column "metadata" does not exist'); e.code = '42703'; throw e; },
  end: async () => {},
});
const fakePresentDb = async () => ({ query: async () => ({ rows: [] }), end: async () => {} });
const fakeConnectFailedDb = async () => { throw new Error('ECONNREFUSED'); };

describe('probeColumnPresent', () => {
  it('reports absent on Postgres 42703', async () => {
    const result = await probeColumnPresent(fakeAbsentDb);
    expect(result).toEqual({ present: false });
  });
  it('reports present when the query succeeds', async () => {
    const result = await probeColumnPresent(fakePresentDb);
    expect(result).toEqual({ present: true });
  });
  it('reports indeterminate when the client cannot even connect', async () => {
    const result = await probeColumnPresent(fakeConnectFailedDb);
    expect(result.present).toBe(false);
    expect(result.indeterminate).toBe(true);
  });
});

describe('resolveActivationState', () => {
  it('NOT_YET_APPLIED: column absent, exit 0, zero writes (no insert/delete fns invoked)', async () => {
    let inserted = false;
    let deleted = false;
    const result = await resolveActivationState({
      dbClientFactory: fakeAbsentDb,
      insertScratchQfFn: async () => { inserted = true; },
      deleteScratchQfFn: async () => { deleted = true; },
    });
    expect(result.state).toBe('NOT_YET_APPLIED');
    expect(result.exitCode).toBe(EXIT_CODES.NOT_YET_APPLIED);
    expect(inserted).toBe(false);
    expect(deleted).toBe(false);
  });

  it('TS-2: ACTIVATED when the merge succeeds and the returned entry carries pick_reason', async () => {
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        const merged = await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return merged.merged ? { session_id: sessionId, claimed_at: 'x', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } } : null;
      },
    });
    expect(result.state).toBe('ACTIVATED');
    expect(result.exitCode).toBe(EXIT_CODES.ACTIVATED);
  });

  it('TS-3: REGRESSED when the merge returns a definite failure reason (cas_lost)', async () => {
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: false, reason: 'cas_lost' }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return null;
      },
    });
    expect(result.state).toBe('REGRESSED');
    expect(result.exitCode).toBe(EXIT_CODES.REGRESSED);
    expect(result.detail).toMatch(/cas_lost/);
  });

  it('REGRESSED when stampClaim reports merged but the entry is missing pick_reason (write-path defect)', async () => {
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        const merged = await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return merged.merged ? { session_id: sessionId, claimed_at: 'x' } : null; // no pick_reason
      },
    });
    expect(result.state).toBe('REGRESSED');
    expect(result.exitCode).toBe(EXIT_CODES.REGRESSED);
  });

  it('TS-5: INDETERMINATE when the merge fails with connect_failed', async () => {
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: false, reason: 'connect_failed' }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return null;
      },
    });
    expect(result.state).toBe('INDETERMINATE');
    expect(result.exitCode).toBe(EXIT_CODES.INDETERMINATE);
    expect(result.detail).not.toMatch(/real defect/);
  });

  it('TS-5: INDETERMINATE (not REGRESSED) when the schema probe itself cannot connect', async () => {
    const result = await resolveActivationState({ dbClientFactory: fakeConnectFailedDb });
    expect(result.state).toBe('INDETERMINATE');
    expect(result.exitCode).toBe(EXIT_CODES.INDETERMINATE);
  });

  it('TS-7: the default scratch id generator produces an id matching QF_ID_RE (/^QF-/)', async () => {
    let capturedId = null;
    await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async (_supabase, qfId) => { capturedId = qfId; return { pick_reason: {} }; },
    });
    expect(capturedId).toMatch(/^QF-/);
  });

  it('TS-6: the scratch-row payload is born claimed and non-open (never belt-auto-startable)', async () => {
    let insertedPayload = null;
    await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async () => ({ pick_reason: {} }),
      insertScratchQfFn: async (qfId, sessionId) => { insertedPayload = { qfId, sessionId }; },
    });
    // The script's real insert (realInsertScratchQf) always sets status:'in_progress' and a
    // non-null claiming_session_id at creation time -- this asserts the injected hook receives
    // a session id it will use for exactly that (never null/open), matching lib/fleet/
    // belt-depth.cjs's auto-start predicate (status='open' AND claiming_session_id IS NULL)
    // being unsatisfiable by construction.
    expect(insertedPayload.sessionId).toBeTruthy();
    expect(insertedPayload.qfId).toMatch(/^QF-/);
  });

  it('cleans up (calls deleteScratchQfFn) even when stampClaimFn throws', async () => {
    let deleted = false;
    await expect(resolveActivationState({
      dbClientFactory: fakePresentDb,
      stampClaimFn: async () => { throw new Error('boom'); },
      deleteScratchQfFn: async () => { deleted = true; },
    })).rejects.toThrow('boom');
    expect(deleted).toBe(true);
  });
});
