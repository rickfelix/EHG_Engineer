/**
 * Unit tests for QF-20260509-REPLIT-SEEDER-PERSIST-URL
 *
 * Verifies that lib/eva/bridge/replit-repo-seeder.js::seedRepo() persists the
 * GitHub repo URL after a successful (or attempted) push, by:
 *   1. Calling registerVentureResource(ventureId, 'github_repo', repoUrl, 'github', {...})
 *   2. UPDATEing ventures.repo_url
 *
 * Background — feedback 9af99a84 (LexiGuard, 2026-04-29): seedRepo accepted
 * the GitHub URL as a parameter, used it to clone/commit/push, but never
 * recorded it back to either venture_resources or ventures.repo_url. As a
 * result, every venture seeded via the CLI / programmatic path lost provenance
 * of its repo URL — Stage 19/20 lookups failed and required manual backfill.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-level mock state — wired into vi.mock factories below.
const registerCalls = [];
const venturesUpdateCalls = [];

// Track which `.from(table)` chain is being walked at any moment.
let lastFromTable = null;

vi.mock('../../../lib/venture-resources.js', () => ({
  registerVentureResource: vi.fn((...args) => {
    registerCalls.push(args);
    return Promise.resolve({ id: 'res-1', status: 'active' });
  }),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true), // skip clone — pretend repo dir already there
}));

function buildSupabaseMock() {
  // Minimal fluent chain that supports:
  //   from(t).select(c).eq(k,v).single()                             — returns ventureRow / artifactRow
  //   from(t).select(c).eq(k,v).eq(k2,v2).maybeSingle()              — returns artifactRow
  //   from(t).select(c).eq(k,v).eq(k2,v2).limit(N).maybeSingle()     — returns artifactRow
  //   from(t).select(c).eq(k,v).eq(k2,v2).order(k3,opt).limit(N).maybeSingle() — returns artifactRow
  //   from(t).select(c).eq(k,v).eq(k2,v2).eq(k3,v3).order(k4,opt)    — returns array
  //   from(t).update(payload).eq(k,v)                                 — captures venturesUpdateCalls
  //   from(t).in(c, list)                                             — returns array
  //   rpc(name, params)                                               — returns {data:{groups:[...]}}

  const chain = {
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    single() {
      // Used by ventures lookup (line ~595): { name, target_platform } and metadata
      if (lastFromTable === 'ventures') {
        return Promise.resolve({
          data: { name: 'TestVenture', target_platform: 'web', metadata: { doc_format: 'agent-optimized' } },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve) {
      // For chains that resolve directly (e.g. update().eq() awaited).
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
    update(payload) {
      if (lastFromTable === 'ventures') {
        venturesUpdateCalls.push(payload);
      }
      return chain;
    },
    upsert() { return chain; },
  };

  return {
    from: vi.fn((table) => {
      lastFromTable = table;
      return chain;
    }),
    rpc: vi.fn(() => Promise.resolve({
      data: { groups: [{ group_key: 'what_to_build', artifacts: [] }] },
      error: null,
    })),
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => buildSupabaseMock()),
}));

beforeEach(() => {
  registerCalls.length = 0;
  venturesUpdateCalls.length = 0;
  lastFromTable = null;
});

describe('seedRepo() — venture_resources URL persistence', () => {
  it('calls registerVentureResource with (ventureId, "github_repo", repoUrl, "github", metadata)', async () => {
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');

    const result = await seedRepo('v-abc', 'https://github.com/foo/bar.git');

    expect(registerCalls.length).toBe(1);
    const [vid, type, ident, provider, meta] = registerCalls[0];
    expect(vid).toBe('v-abc');
    expect(type).toBe('github_repo');
    expect(ident).toBe('https://github.com/foo/bar.git');
    expect(provider).toBe('github');
    expect(meta).toMatchObject({
      seeded_by: 'replit-repo-seeder',
      docs_committed_count: expect.any(Number),
    });
    expect(meta.seeded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO date
    expect(result).toBeDefined();
  });

  it('UPDATEs ventures.repo_url after successful push', async () => {
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');

    await seedRepo('v-xyz', 'https://github.com/owner/myrepo.git');

    expect(venturesUpdateCalls).toContainEqual({ repo_url: 'https://github.com/owner/myrepo.git' });
  });

  it('does not throw when registerVentureResource rejects — captures error in result.errors', async () => {
    const venturesMod = await import('../../../lib/venture-resources.js');
    venturesMod.registerVentureResource.mockRejectedValueOnce(new Error('FK violation'));

    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');

    const result = await seedRepo('v-bad', 'https://github.com/foo/bar.git');

    // Persistence error captured but seedRepo returned normally
    expect(result).toBeDefined();
    expect(result.errors.some(e => e.includes('venture_resources persistence failed'))).toBe(true);
  });

  it('passes the same repoUrl to both registerVentureResource and ventures.update — preserves exact identity', async () => {
    const { seedRepo } = await import('../../../lib/eva/bridge/replit-repo-seeder.js');

    const url = 'https://github.com/rickfelix/lexiguard.git';
    await seedRepo('lexiguard-v1', url);

    expect(registerCalls[0][2]).toBe(url);
    expect(venturesUpdateCalls.find(p => p.repo_url === url)).toBeDefined();
  });
});
