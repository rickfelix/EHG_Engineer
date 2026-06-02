/**
 * Tests for repo-detection (QF-20260602-767 / RCA 4460c80b):
 * R1 — detectImplementationRepos is memoized per sd_id (collapses the ~11 redundant GATE2 calls).
 * R2 — resolveReposForSD matches target_application case-INSENSITIVELY (titlecase "EHG" must not
 *      fall through to scanning all active repos when the registry name is lowercase "ehg").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveReposForSD,
  detectImplementationRepos,
  clearImplementationReposCache,
} from '../repo-detection.js';

// Minimal chainable supabase stub: every resolveReposForSD/getSDSearchTerms query resolves to
// { data: { target_application } }. getSDSearchTerms tolerates the shape (it catches + falls back).
function mockSupabase(targetApp) {
  const result = { data: { target_application: targetApp }, error: null };
  const chain = {
    select: () => chain,
    or: () => chain,
    eq: () => chain,
    limit: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
  };
  return { from: () => chain };
}

describe('resolveReposForSD — case-insensitive target_application match (R2)', () => {
  it('resolves a title-cased registered app to exactly ONE repo (does not fall through to all)', async () => {
    // "EHG" is a registered active app; its registry name is lowercase "ehg".
    const repos = await resolveReposForSD('fake-sd-r2a', mockSupabase('EHG'));
    expect(Array.isArray(repos)).toBe(true);
    expect(repos).toHaveLength(1); // strict === would have returned ALL active repos
  });

  it('resolves title-case and lowercase of the same app IDENTICALLY (the invariant)', async () => {
    const upper = await resolveReposForSD('fake-sd-r2b', mockSupabase('EHG'));
    const lower = await resolveReposForSD('fake-sd-r2b', mockSupabase('ehg'));
    expect(upper).toEqual(lower);
  });
});

describe('detectImplementationRepos — per-sd_id memoization (R1)', () => {
  beforeEach(() => clearImplementationReposCache());

  it('returns the SAME cached promise for a repeated sd_id (collapses N calls to 1)', async () => {
    const sb = mockSupabase('EHG');
    const p1 = detectImplementationRepos('fake-sd-mem', sb);
    const p2 = detectImplementationRepos('fake-sd-mem', sb);
    expect(p1).toBe(p2); // identical promise object => the second call did zero new work
    await Promise.allSettled([p1]); // let the underlying git scan settle (no unhandled rejection)
  });

  it('keys the cache by sd_id (different SDs get different promises)', async () => {
    const sb = mockSupabase('EHG');
    const a = detectImplementationRepos('fake-sd-A', sb);
    const b = detectImplementationRepos('fake-sd-B', sb);
    expect(a).not.toBe(b);
    await Promise.allSettled([a, b]);
  });

  it('clearImplementationReposCache forces a fresh promise', async () => {
    const sb = mockSupabase('EHG');
    const first = detectImplementationRepos('fake-sd-clear', sb);
    clearImplementationReposCache();
    const second = detectImplementationRepos('fake-sd-clear', sb);
    expect(first).not.toBe(second);
    await Promise.allSettled([first, second]);
  });
});
