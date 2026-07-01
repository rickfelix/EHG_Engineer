/**
 * SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 (FR-4) — working-signal-store.cjs.
 * Pattern mirrors any working-context-store test: assert writes go EXCLUSIVELY through the RPC
 * (never a JS read-modify-write), and fail-soft when the RPC is absent.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getRawWorkingSignal, writeWorkingSignal, isMissingFunctionError } = require('../../lib/coordinator/working-signal-store.cjs');

describe('writeWorkingSignal (FR-4) — RPC-only write path', () => {
  it('calls set_session_working_signal RPC with the expected params, never a raw .update()', async () => {
    let rpcCall = null;
    const sb = {
      rpc(name, params) {
        rpcCall = { name, params };
        return Promise.resolve({ error: null });
      },
      from() {
        throw new Error('writeWorkingSignal must never call .from() (that would be a read-modify-write)');
      },
    };
    const r = await writeWorkingSignal(sb, 'sess-1', { body: 'investigating S17', etaMs: 300000 });
    expect(r).toEqual({ persisted: true });
    expect(rpcCall.name).toBe('set_session_working_signal');
    expect(rpcCall.params.p_session_id).toBe('sess-1');
    expect(rpcCall.params.p_body).toBe('investigating S17');
    expect(rpcCall.params.p_eta_ms).toBe(300000);
    expect(typeof rpcCall.params.p_expires_at).toBe('string');
  });

  it('fail-soft: reports rpc_absent (not a crash) when the migration is unapplied', async () => {
    const sb = { rpc: () => Promise.resolve({ error: { code: '42883', message: 'function set_session_working_signal does not exist' } }) };
    const r = await writeWorkingSignal(sb, 'sess-1', { body: 'x' });
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('rpc_absent');
    expect(r.warn).toMatch(/RPC is not applied/);
  });

  it('fail-soft: reports rpc_absent on a PostgREST 404 (PGRST202)', async () => {
    const sb = { rpc: () => Promise.resolve({ error: { code: 'PGRST202', message: 'not found' } }) };
    const r = await writeWorkingSignal(sb, 'sess-1', { body: 'x' });
    expect(r.reason).toBe('rpc_absent');
  });

  it('reports a generic error for any other RPC failure, still never throws', async () => {
    const sb = { rpc: () => Promise.resolve({ error: { code: '23505', message: 'unique violation' } }) };
    const r = await writeWorkingSignal(sb, 'sess-1', { body: 'x' });
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('error');
  });

  it('rejects a missing body without calling the RPC', async () => {
    let called = false;
    const sb = { rpc: () => { called = true; return Promise.resolve({ error: null }); } };
    const r = await writeWorkingSignal(sb, 'sess-1', {});
    expect(r).toEqual({ persisted: false, reason: 'no_body' });
    expect(called).toBe(false);
  });

  it('returns no_client_or_session for missing supabase/sessionId', async () => {
    await expect(writeWorkingSignal(null, 'sess-1', { body: 'x' })).resolves.toEqual({ persisted: false, reason: 'no_client_or_session' });
    await expect(writeWorkingSignal({}, null, { body: 'x' })).resolves.toEqual({ persisted: false, reason: 'no_client_or_session' });
  });
});

describe('getRawWorkingSignal', () => {
  it('reads metadata.working_signal from the session row', async () => {
    const signal = { body: 'x', eta_ms: 1000 };
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { metadata: { working_signal: signal } }, error: null }) }) }) }) };
    await expect(getRawWorkingSignal(sb, 'sess-1')).resolves.toEqual(signal);
  });

  it('fail-open: resolves to null on error/missing data', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) };
    await expect(getRawWorkingSignal(sb, 'sess-1')).resolves.toBeNull();
    await expect(getRawWorkingSignal(null, 'sess-1')).resolves.toBeNull();
  });
});

describe('isMissingFunctionError', () => {
  it('recognizes undefined_function and PostgREST-not-found codes', () => {
    expect(isMissingFunctionError({ code: '42883' })).toBe(true);
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunctionError({ code: '23505', message: 'unique violation' })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });
});
