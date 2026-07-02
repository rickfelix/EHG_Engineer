import { describe, it, expect } from 'vitest';
const { readHandoffMemory, writeHandoffMemory, isMissingFunctionError } = require('./handoff-memory-store.cjs');

// Stub records every call so we can PROVE the writer never performs a JS read-modify-write
// (.from().update()) fallback, mirroring tests/unit/coordination/working-context.test.js.
function storeStub({ rpcResult, readMetadata, insertResult } = {}) {
  const calls = { rpc: [], from: [], update: 0, insert: [] };
  return {
    calls,
    rpc(fn, args) { calls.rpc.push({ fn, args }); return Promise.resolve(rpcResult || { error: null }); },
    from(table) {
      calls.from.push(table);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: readMetadata !== undefined ? readMetadata : null, error: null }); },
        update() { calls.update += 1; return chain; },
        insert(row) { calls.insert.push({ table, row }); return Promise.resolve(insertResult || { error: null }); },
      };
      return chain;
    },
  };
}

describe('handoff-memory-store writeHandoffMemory (TS-2 write path / TS-3 fail-soft)', () => {
  it('persists via the RPC and never issues a metadata update (RMW)', async () => {
    const sb = storeStub({ rpcResult: { error: null } });
    const hm = { items: [{ kind: 'reply_owed', summary: 'x' }], captured_at: '2026-07-02T10:00:00Z', predecessor_session_id: null };
    const r = await writeHandoffMemory(sb, 'sess-old', hm);
    expect(r.persisted).toBe(true);
    expect(sb.calls.rpc).toHaveLength(1);
    expect(sb.calls.rpc[0].fn).toBe('set_session_handoff_memory');
    expect(sb.calls.rpc[0].args).toMatchObject({ p_session_id: 'sess-old', p_hm: hm });
    expect(sb.calls.update).toBe(0); // NEVER a read-modify-write
    // audit event logged
    expect(sb.calls.insert).toHaveLength(1);
    expect(sb.calls.insert[0].table).toBe('session_lifecycle_events');
    expect(sb.calls.insert[0].row.event_type).toBe('HANDOFF_MEMORY_WRITTEN');
  });

  it('fail-softs (rpc_absent) when the migration is unapplied — still no RMW (TS-3)', async () => {
    const sb = storeStub({ rpcResult: { error: { code: 'PGRST202', message: 'Could not find the function set_session_handoff_memory' } } });
    const r = await writeHandoffMemory(sb, 'sess-old', {});
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('rpc_absent');
    expect(r.warn).toMatch(/persistence pending/i);
    expect(sb.calls.update).toBe(0);
  });

  it('surfaces other DB errors without crashing or RMW', async () => {
    const sb = storeStub({ rpcResult: { error: { code: '500', message: 'boom' } } });
    const r = await writeHandoffMemory(sb, 'sess-old', {});
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('error');
    expect(sb.calls.update).toBe(0);
  });

  it('returns no_client_or_session when supabase or sessionId missing', async () => {
    const sb = storeStub();
    expect((await writeHandoffMemory(null, 'sess', {})).reason).toBe('no_client_or_session');
    expect((await writeHandoffMemory(sb, null, {})).reason).toBe('no_client_or_session');
  });
});

describe('handoff-memory-store readHandoffMemory (FR-2 round trip + absent-predecessor)', () => {
  it('round-trips the exact items written for the same session_id', async () => {
    const written = { items: [{ kind: 'consult', summary: 'demo', correlation_id: 'c1', opened_at: null }], captured_at: '2026-07-02T10:00:00Z', predecessor_session_id: null };
    const sb = storeStub({ readMetadata: { metadata: { handoff_memory: written } } });
    const hm = await readHandoffMemory(sb, 'sess-old');
    expect(hm.items).toEqual(written.items);
    // consuming logs an audit event
    expect(sb.calls.insert[0].row.event_type).toBe('HANDOFF_MEMORY_CONSUMED');
  });

  it('returns an empty-but-valid shape (never null, never throws) when the predecessor row/key is absent', async () => {
    const sb = storeStub({ readMetadata: null });
    const hm = await readHandoffMemory(sb, 'sess-does-not-exist');
    expect(hm.items).toEqual([]);
    expect(hm).not.toBeNull();
  });

  it('returns an empty-but-valid shape when supabase or sessionId missing', async () => {
    expect((await readHandoffMemory(null, 'sess')).items).toEqual([]);
    expect((await readHandoffMemory(storeStub(), null)).items).toEqual([]);
  });
});

describe('isMissingFunctionError', () => {
  it('recognizes 42883 and PGRST202', () => {
    expect(isMissingFunctionError({ code: '42883' })).toBe(true);
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunctionError({ code: '23505' })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });

  it('matches on message alone (no .code) against the REAL PostgREST/Postgres wording (adversarial-review regression)', () => {
    // The exact PostgREST message for a missing RPC — previously never matched because the old
    // regex required a separate "not found"/"not exist" substring this message does not contain.
    expect(isMissingFunctionError({ message: 'Could not find the function public.set_session_handoff_memory(p_hm, p_session_id) in the schema cache' })).toBe(true);
    // The exact Postgres direct-connection message for a missing function.
    expect(isMissingFunctionError({ message: 'function set_session_handoff_memory(text, jsonb) does not exist' })).toBe(true);
    // A permission error mentioning the function name must NOT be treated as rpc_absent.
    expect(isMissingFunctionError({ message: 'permission denied for function set_session_handoff_memory' })).toBe(false);
  });
});
