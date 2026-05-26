/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 — FR-2 / TS-4: DB-first path resolution.
 *
 * resolveRepoPathDbFirst prefers the authoritative applications.local_path DB column
 * and only falls back to the synchronous registry.json resolver when the DB is
 * unavailable / has no row / the row's local_path is NULL. TS-4: a value present in
 * the DB column is what gets returned — registry.json staleness does not change it.
 *
 * Also asserts: the FR-6 platform invariant (null/EHG_Engineer never consult the DB),
 * normalizeAppName matching across name forms, and that DB errors degrade to the
 * registry fallback rather than returning null (which would mis-route to EHG_Engineer).
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { resolveRepoPathDbFirst, resolveRepoPath, ENGINEER_ROOT } from '../../lib/repo-paths.js';

function mockSupabase(rows, { throwOnQuery = false } = {}) {
  const eq = vi.fn(() =>
    throwOnQuery ? Promise.reject(new Error('db down')) : Promise.resolve({ data: rows, error: null }),
  );
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, spies: { from, select, eq } };
}

describe('FR-6 platform invariant holds in resolveRepoPathDbFirst', () => {
  for (const targetApp of [null, undefined, 'EHG_Engineer', 'ehg_engineer']) {
    it(`target=${JSON.stringify(targetApp)} → ENGINEER_ROOT without consulting the DB`, async () => {
      const { client, spies } = mockSupabase([{ name: 'EHG_Engineer', local_path: 'D:/wrong', status: 'active' }]);
      const result = await resolveRepoPathDbFirst(targetApp, client);
      expect(result).toBe(ENGINEER_ROOT);
      expect(spies.from).not.toHaveBeenCalled();
    });
  }
});

describe('FR-2 / TS-4: DB column is authoritative over registry.json', () => {
  it('returns the DB local_path (not the registry value) for a matched venture', async () => {
    const dbPath = 'D:/db-authoritative/commitcraft-ai';
    const { client } = mockSupabase([{ name: 'CommitCraft AI', local_path: dbPath, status: 'active' }]);
    // 'commitcraft-ai' normalizes to the same key as the DB row's 'CommitCraft AI'.
    const result = await resolveRepoPathDbFirst('commitcraft-ai', client);
    expect(result).toBe(path.resolve(dbPath));
    // Prove it is the DB value, not the registry value, by construction (sentinel path).
    expect(result).not.toBe(resolveRepoPath('commitcraft-ai'));
  });

  it('matches across name forms via normalizeAppName (CronLinter / cron-linter / cronlinter)', async () => {
    const dbPath = 'D:/db-authoritative/cronlinter';
    for (const form of ['CronLinter', 'cron-linter', 'cronlinter', 'CRON LINTER']) {
      const { client } = mockSupabase([{ name: 'CronLinter', local_path: dbPath, status: 'active' }]);
      expect(await resolveRepoPathDbFirst(form, client)).toBe(path.resolve(dbPath));
    }
  });
});

describe('FR-2: registry fallback (DB miss / NULL / error / no client)', () => {
  it('DB has no matching row → falls back to the sync registry resolver', async () => {
    const { client } = mockSupabase([]);
    const target = 'definitely-not-a-real-venture-xyz';
    expect(await resolveRepoPathDbFirst(target, client)).toBe(resolveRepoPath(target));
  });

  it('matched row with NULL local_path is ignored → registry fallback', async () => {
    const { client } = mockSupabase([{ name: 'CronLinter', local_path: null, status: 'active' }]);
    expect(await resolveRepoPathDbFirst('cronlinter', client)).toBe(resolveRepoPath('cronlinter'));
  });

  it('no supabase client → registry resolver (e.g. ehg resolves from registry.json)', async () => {
    expect(await resolveRepoPathDbFirst('ehg')).toBe(resolveRepoPath('ehg'));
  });

  it('DB query throws → degrades to registry fallback, never throws or returns a bare null mis-route', async () => {
    const { client } = mockSupabase(null, { throwOnQuery: true });
    expect(await resolveRepoPathDbFirst('ehg', client)).toBe(resolveRepoPath('ehg'));
  });
});
