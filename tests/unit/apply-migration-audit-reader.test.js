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

let listApplied, getLatestSuccessForPath, hasBeenApplied, normalizeMigrationPath;
beforeEach(async () => {
  rpcMock.mockReset();
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  vi.resetModules();
  ({ listApplied, getLatestSuccessForPath, hasBeenApplied, normalizeMigrationPath } = await import(
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
  it('returns first row from the normalized-comparison scan (FR-2 primary path)', async () => {
    rpcMock.mockResolvedValue({ data: [{ migration_path: '/m.sql', migration_sha256: 'abc' }], error: null });
    const r = await getLatestSuccessForPath('/m.sql');
    expect(r.migration_path).toBe('/m.sql');
    // FR-2: primary lookup scans ALL success rows (no server-side p_path filter) so it
    // can apply the normalized comparison client-side.
    const call = rpcMock.mock.calls[0][1];
    expect(call.p_path).toBeNull();
    expect(call.p_success).toBe(true);
    expect(call.p_limit).toBe(1000);
  });

  it('returns null when no rows', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const r = await getLatestSuccessForPath('/none.sql');
    expect(r).toBeNull();
  });
});

describe('normalizeMigrationPath (SD-LEO-INFRA-COMPLETION-GATE-DATA-001-A FR-2 / TS-2)', () => {
  it('strips the repo-root prefix (via the real getRepoRoot() helper) and converts to POSIX', async () => {
    const { getRepoRoot } = await import('../../lib/repo-paths.js');
    const root = getRepoRoot();
    const winStyle = `${root}\\database\\migrations\\20260829_x.sql`;
    expect(normalizeMigrationPath(winStyle)).toBe('database/migrations/20260829_x.sql');
  });

  it('leaves an already repo-relative POSIX path unchanged (byte-identical, no behavior change)', () => {
    expect(normalizeMigrationPath('database/migrations/20260829_x.sql')).toBe(
      'database/migrations/20260829_x.sql'
    );
  });

  it('preserves the full subdirectory so same-named files in different dirs never collide', () => {
    const a = normalizeMigrationPath('database/migrations/20260829_x.sql');
    const b = normalizeMigrationPath('database/chairman-gated/20260829_x.sql');
    expect(a).not.toBe(b);
  });

  it('passes falsy/non-string input through unchanged', () => {
    expect(normalizeMigrationPath('')).toBe('');
    expect(normalizeMigrationPath(null)).toBeNull();
    expect(normalizeMigrationPath(undefined)).toBeUndefined();
  });
});

describe('getLatestSuccessForPath — FR-2 normalization + rollback-safety fallback (TS-2)', () => {
  it('matches an absolute-Windows-recorded row against a repo-relative POSIX query path', async () => {
    const { getRepoRoot } = await import('../../lib/repo-paths.js');
    const root = getRepoRoot();
    rpcMock.mockResolvedValue({
      data: [{ migration_path: `${root}\\database\\migrations\\20260829_x.sql`, migration_sha256: 'abc', applied_at: '2026-08-29T00:00:00Z' }],
      error: null,
    });
    const r = await getLatestSuccessForPath('database/migrations/20260829_x.sql');
    expect(r).not.toBeNull();
    expect(r.migration_sha256).toBe('abc');
  });

  it('does NOT collapse same-named files in different directories (collision guard)', async () => {
    const { getRepoRoot } = await import('../../lib/repo-paths.js');
    const root = getRepoRoot();
    const chairmanGatedRow = { migration_path: `${root}\\database\\chairman-gated\\20260829_x.sql`, migration_sha256: 'wrong-dir', applied_at: '2026-08-29T00:00:00Z' };
    // Realistic mock: the normalized-scan call (p_path=null) sees every success row; the
    // raw-fallback call (p_path set) applies the SAME server-side exact match the real RPC
    // would -- so this row (a different absolute path) never satisfies the raw fallback
    // for the migrations/ query either.
    rpcMock.mockImplementation((_fn, params) => {
      if (params.p_path == null) return Promise.resolve({ data: [chairmanGatedRow], error: null });
      return Promise.resolve({ data: params.p_path === chairmanGatedRow.migration_path ? [chairmanGatedRow] : [], error: null });
    });
    const r = await getLatestSuccessForPath('database/migrations/20260829_x.sql');
    expect(r).toBeNull();
  });

  it('falls back to the original unnormalized comparison when the normalized scan finds nothing (rollback safety)', async () => {
    // First call (normalized scan, p_path omitted) returns no match at all; the fallback
    // call passes sincePath through, which the mock answers on the SECOND rpc call.
    rpcMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ migration_path: '/weird/legacy-format.sql', migration_sha256: 'legacy' }], error: null });
    const r = await getLatestSuccessForPath('/weird/legacy-format.sql');
    expect(r.migration_sha256).toBe('legacy');
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1][1].p_path).toBe('/weird/legacy-format.sql');
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
