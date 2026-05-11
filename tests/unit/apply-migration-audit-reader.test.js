/**
 * SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 — FR-6 / TS-8
 * Unit tests for lib/migration-audit-reader.js (no real DB).
 *
 * Mocks @supabase/supabase-js's createClient → returns a stub with rpc() so we
 * can assert: listApplied calls migration_audit_public_read RPC (NOT raw
 * SELECT), forwards params correctly, clamps limit, and that
 * getLatestSuccessForPath + hasBeenApplied compose on top of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: rpcMock })),
}));

const ENV_BAK = { ...process.env };

let listApplied, getLatestSuccessForPath, hasBeenApplied;
beforeEach(async () => {
  rpcMock.mockReset();
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  vi.resetModules();
  ({ listApplied, getLatestSuccessForPath, hasBeenApplied } = await import(
    '../../lib/migration-audit-reader.js'
  ));
});

afterEach: void 0;
// vitest resets timers per file by default; restore env at end
import { afterAll } from 'vitest';
afterAll(() => { process.env = { ...ENV_BAK }; });

describe('listApplied', () => {
  it('calls migration_audit_public_read RPC (not raw SELECT) with forwarded params', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await listApplied({ since: '2026-01-01T00:00:00Z', sincePath: '/m.sql', success: true, limit: 50 });
    expect(rpcMock).toHaveBeenCalledWith('migration_audit_public_read', {
      p_since: '2026-01-01T00:00:00Z',
      p_path: '/m.sql',
      p_success: true,
      p_limit: 50,
    });
  });

  it('clamps limit into [1, 1000]', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await listApplied({ limit: 99999 });
    expect(rpcMock.mock.calls[0][1].p_limit).toBe(1000);
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: [], error: null });
    await listApplied({ limit: 0 });
    expect(rpcMock.mock.calls[0][1].p_limit).toBe(1);
  });

  it('throws when RPC returns error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listApplied()).rejects.toThrow(/boom/);
  });

  it('passes Date objects as ISO strings', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const d = new Date('2026-05-11T00:00:00Z');
    await listApplied({ since: d });
    expect(rpcMock.mock.calls[0][1].p_since).toBe(d.toISOString());
  });
});

describe('getLatestSuccessForPath', () => {
  it('returns first row from filtered listApplied', async () => {
    rpcMock.mockResolvedValue({ data: [{ migration_path: '/m.sql', migration_sha256: 'abc' }], error: null });
    const r = await getLatestSuccessForPath('/m.sql');
    expect(r.migration_path).toBe('/m.sql');
    const call = rpcMock.mock.calls[0][1];
    expect(call.p_path).toBe('/m.sql');
    expect(call.p_success).toBe(true);
    expect(call.p_limit).toBe(1);
  });

  it('returns null when no rows', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const r = await getLatestSuccessForPath('/none.sql');
    expect(r).toBeNull();
  });
});

describe('hasBeenApplied (FR-4 idempotence)', () => {
  it('returns true when sha matches', async () => {
    rpcMock.mockResolvedValue({ data: [{ migration_path: '/m.sql', migration_sha256: 'abc' }], error: null });
    expect(await hasBeenApplied('/m.sql', 'abc')).toBe(true);
  });
  it('returns false when sha differs (TAMPERED scenario)', async () => {
    rpcMock.mockResolvedValue({ data: [{ migration_path: '/m.sql', migration_sha256: 'OLD' }], error: null });
    expect(await hasBeenApplied('/m.sql', 'NEW')).toBe(false);
  });
  it('returns false when no prior apply', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await hasBeenApplied('/m.sql', 'abc')).toBe(false);
  });
  it('returns false on empty inputs', async () => {
    expect(await hasBeenApplied('', 'x')).toBe(false);
    expect(await hasBeenApplied('/m.sql', '')).toBe(false);
  });
});
