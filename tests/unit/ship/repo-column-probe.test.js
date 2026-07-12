/**
 * SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001 (FR-4/5/6)
 * repo-column-probe.mjs — capability probe for the chairman-gated
 * ship_review_findings.repo column, which may ship un-applied for an
 * indeterminate period (confirmed live for two sibling migrations on this
 * same table). Every writer/reader must degrade gracefully, never error.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  probeRepoColumnExists,
  __resetRepoColumnProbeForTests,
  normalizeGithubRepo,
} from '../../../lib/ship/repo-column-probe.mjs';

beforeEach(() => {
  __resetRepoColumnProbeForTests();
});

function makeSupabase(error) {
  return {
    from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: error ? null : [], error }) }) }),
  };
}

describe('probeRepoColumnExists', () => {
  it('returns true when the select succeeds (column present)', async () => {
    expect(await probeRepoColumnExists(makeSupabase(null))).toBe(true);
  });

  it('returns false on 42703 (Postgres undefined_column)', async () => {
    expect(await probeRepoColumnExists(makeSupabase({ code: '42703', message: 'column "repo" does not exist' }))).toBe(false);
  });

  it('returns false on PGRST204 (PostgREST schema-cache miss)', async () => {
    expect(await probeRepoColumnExists(makeSupabase({ code: 'PGRST204', message: 'schema cache' }))).toBe(false);
  });

  it('returns false (uncached) on an unrelated error, and retries fresh next call', async () => {
    const flaky = makeSupabase({ code: 'ECONNRESET', message: 'network blip' });
    expect(await probeRepoColumnExists(flaky)).toBe(false);
    // Not cached -- a subsequent healthy call should flip to true.
    expect(await probeRepoColumnExists(makeSupabase(null))).toBe(true);
  });

  it('caches a confirmed "absent" result across calls, even if supabase would now say present', async () => {
    await probeRepoColumnExists(makeSupabase({ code: '42703', message: 'nope' }));
    // Cached false wins even though this call would otherwise succeed.
    expect(await probeRepoColumnExists(makeSupabase(null))).toBe(false);
  });

  it('caches a confirmed "present" result across calls', async () => {
    await probeRepoColumnExists(makeSupabase(null));
    expect(await probeRepoColumnExists(makeSupabase({ code: '42703' }))).toBe(true);
  });

  it('returns false when supabase is missing', async () => {
    expect(await probeRepoColumnExists(null)).toBe(false);
  });
});

describe('normalizeGithubRepo', () => {
  it('strips .git suffix and lowercases', () => {
    expect(normalizeGithubRepo('rickfelix/MarketLens.GIT')).toBe('rickfelix/marketlens');
  });
  it('null in, null out', () => {
    expect(normalizeGithubRepo(null)).toBeNull();
  });
});
