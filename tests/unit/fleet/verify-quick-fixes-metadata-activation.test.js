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
import { resolveActivationState, probeColumnPresent, buildScratchQfInsertPayload, EXIT_CODES } from '../../../scripts/verify-quick-fixes-metadata-activation.mjs';

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

  it('TS-2: ACTIVATED when the merge succeeds, the returned entry carries pick_reason, AND an independent read-back confirms persistence', async () => {
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        const merged = await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return merged.merged ? { session_id: sessionId, claimed_at: 'x', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } } : null;
      },
      readBackFn: async () => ({ entry: { session_id: 'sess-1', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } } }),
    });
    expect(result.state).toBe('ACTIVATED');
    expect(result.exitCode).toBe(EXIT_CODES.ACTIVATED);
    expect(result.detail).toMatch(/independently read back/);
  });

  it('V-F1: REGRESSED (not ACTIVATED) when the in-memory entry claims success but an independent read-back finds nothing persisted', async () => {
    // VALIDATION-AGENT FINDING (evidence 64ea554f, now resolved): the in-memory `entry`
    // object claim-stamp.cjs returns proves nothing about what actually landed in the
    // database -- this pins that ACTIVATED requires the independent read-back to agree.
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return { session_id: sessionId, claimed_at: 'x', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } };
      },
      readBackFn: async () => ({ entry: null }), // nothing found on independent re-read
    });
    expect(result.state).toBe('REGRESSED');
    expect(result.exitCode).toBe(EXIT_CODES.REGRESSED);
    expect(result.detail).toMatch(/read-after-write/);
  });

  it('V-F3: an INDETERMINATE (not REGRESSED) read-back connection failure never gets conflated with a real read-after-write defect', async () => {
    // VALIDATION-AGENT FINDING (evidence 5c499972, now resolved): the read-back's own
    // connect/query errors were previously swallowed into a bare null, which the caller
    // then reported as REGRESSED ("a real read-after-write defect") -- a connection blip
    // must never be misreported as a chain defect (this is the same class of bug FR-1
    // already required probeColumnPresent to avoid, now mirrored in the read-back).
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return { session_id: sessionId, claimed_at: 'x', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } };
      },
      readBackFn: async () => ({ entry: null, indeterminate: true, error: 'ECONNRESET' }),
    });
    expect(result.state).toBe('INDETERMINATE');
    expect(result.exitCode).toBe(EXIT_CODES.INDETERMINATE);
    expect(result.detail).not.toMatch(/real read-after-write defect/);
  });

  it('readBackClaimHistory returns {entry} from a real-shaped pg result, and {entry:null, indeterminate:true} when the client cannot connect', async () => {
    const { readBackClaimHistory } = await import('../../../scripts/verify-quick-fixes-metadata-activation.mjs');
    const withHistory = async () => ({
      query: async () => ({ rows: [{ claim_history: [{ session_id: 'old' }, { session_id: 'new', pick_reason: {} }] }] }),
      end: async () => {},
    });
    const found = await readBackClaimHistory(withHistory, 'QF-X');
    expect(found).toEqual({ entry: { session_id: 'new', pick_reason: {} } });

    const empty = async () => ({ query: async () => ({ rows: [{ claim_history: [] }] }), end: async () => {} });
    expect(await readBackClaimHistory(empty, 'QF-X')).toEqual({ entry: null });

    const unreachable = async () => { throw new Error('ECONNREFUSED'); };
    const failed = await readBackClaimHistory(unreachable, 'QF-X');
    expect(failed.entry).toBeNull();
    expect(failed.indeterminate).toBe(true);
    expect(failed.error).toMatch(/ECONNREFUSED/);
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

  it('TS-6: the REAL scratch-row payload (buildScratchQfInsertPayload) is born claimed, non-open, and carries target_application', () => {
    // TESTING-AGENT FINDING (evidence a9bac2fa, HIGH, now resolved): asserting only what an
    // injected test double received (the prior version of this test) proves nothing about the
    // deployed realInsertScratchQf payload -- assert the exported builder directly instead.
    const payload = buildScratchQfInsertPayload('QF-VERIFYACT-123-ABC', 'sess-1');
    expect(payload.status).not.toBe('open');
    expect(payload.claiming_session_id).toBe('sess-1');
    expect(payload.target_application).toBe('EHG_Engineer');
    expect(payload.id).toMatch(/^QF-/);
  });

  it('TS-6b: an insert failure (e.g. missing target_application on a live trigger) classifies INDETERMINATE, never REGRESSED', async () => {
    let deleteCalled = false;
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      insertScratchQfFn: async () => { throw new Error('null value in column "target_application" violates not-null constraint'); },
      deleteScratchQfFn: async () => { deleteCalled = true; },
      stampClaimFn: async () => { throw new Error('should never be reached -- insert failed first'); },
    });
    expect(result.state).toBe('INDETERMINATE');
    expect(result.exitCode).toBe(EXIT_CODES.INDETERMINATE);
    expect(result.detail).toMatch(/environmental\/setup problem, not a code defect/);
    // Cleanup still runs (finally) even though the insert itself never succeeded -- a
    // delete-by-id on a row that was never created is a harmless no-op.
    expect(deleteCalled).toBe(true);
  });

  it('SEC-F2: a cleanup (delete) failure is surfaced in result.detail, verdict/state left unchanged', async () => {
    const result = await resolveActivationState({
      dbClientFactory: fakePresentDb,
      mergeQfMetadataFn: async () => ({ merged: true }),
      stampClaimFn: async (_supabase, qfId, sessionId, _id, _m, opts) => {
        const merged = await opts.mergeQfMetadataFn(qfId, sessionId, {});
        return merged.merged ? { session_id: sessionId, claimed_at: 'x', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } } : null;
      },
      deleteScratchQfFn: async () => { throw new Error('delete failed: RLS denied'); },
      readBackFn: async () => ({ entry: { session_id: 'sess-1', pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } } }),
    });
    expect(result.state).toBe('ACTIVATED'); // verdict unchanged by a cleanup failure
    expect(result.detail).toMatch(/CLEANUP FAILED/);
    expect(result.detail).toMatch(/RLS denied/);
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
