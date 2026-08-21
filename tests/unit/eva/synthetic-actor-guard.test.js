/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-6) — unit tests for
 * checkSyntheticActorFencing's own logic: fleet-safety opt-in short-circuit,
 * hollow/absent config detection, step-granularity GitHub Actions pull (via
 * a mocked fetch), fail-closed on DB/GitHub error, and the short-TTL
 * cached-last-known-good fallback on a transient GitHub error.
 *
 * Each test uses a UNIQUE ventureId -- the module's lastKnownGood cache is
 * process-lifetime (module-scoped, not reset between tests in this file), so
 * distinct ventureIds keep tests from cross-contaminating each other's cache
 * state without needing vi.resetModules() per test.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkSyntheticActorFencing } from '../../../lib/eva/synthetic-actor-guard.js';

const VALID_SA = {
  exclusion_predicate_ref: 'lib/synthetic-actor.js#isSyntheticActor',
  github_repo: 'rickfelix/altifyai',
  workflow_file: 'deploy.yml',
  uat_step_name: 'post-deploy-signed-in-uat',
};

// registeredRepo defaults to VALID_SA.github_repo so existing tests that
// don't care about the venture_resources cross-check keep passing by
// default; pass a different value (or null) to exercise a mismatch/absent
// case specifically.
function makeSupabase(ventureMetadata, { registeredRepo = VALID_SA.github_repo, ventureRowAbsent = false } = {}) {
  return {
    from: (table) => {
      if (table === 'venture_resources') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: registeredRepo ? { resource_identifier: registeredRepo } : null, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: ventureRowAbsent ? null : { metadata: ventureMetadata }, error: null }),
          }),
        }),
      };
    },
  };
}

function makeThrowingSupabase(errorMessage) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => { throw new Error(errorMessage); },
        }),
      }),
    }),
  };
}

function githubFetchSequence({ runs = [{ id: 1, head_sha: 'abc123' }], jobs = [] } = {}) {
  return vi.fn(async (url) => {
    if (url.includes('/actions/workflows/')) {
      return { ok: true, json: async () => ({ workflow_runs: runs }) };
    }
    if (url.includes('/jobs')) {
      return { ok: true, json: async () => ({ jobs }) };
    }
    throw new Error(`unexpected fetch URL: ${url}`);
  });
}

describe('checkSyntheticActorFencing — opt-in short-circuit (fleet safety)', () => {
  it('applies:false, satisfied:true, ZERO fetch calls when uat_probe_required is not set', async () => {
    const fetchImpl = vi.fn();
    const result = await checkSyntheticActorFencing(makeSupabase({}), 'v-fleet-1', { fetchImpl, githubToken: 'x' });
    expect(result).toEqual({ applies: false, satisfied: true, reason: expect.stringContaining('has not opted in') });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('applies:false when uat_probe_required is present but not exactly true', async () => {
    const fetchImpl = vi.fn();
    const result = await checkSyntheticActorFencing(makeSupabase({ uat_probe_required: 'yes' }), 'v-fleet-2', { fetchImpl });
    expect(result.applies).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // SEC-51 (round 9): a missing ventures row must fail CLOSED, matching
  // every other absent-record path in this function -- previously it took
  // the opposite polarity (silently treated as "not opted in").
  it('fails CLOSED (does not silently pass) when the ventures row itself does not exist', async () => {
    const fetchImpl = vi.fn();
    const result = await checkSyntheticActorFencing(makeSupabase({}, { ventureRowAbsent: true }), 'v-nonexistent', { fetchImpl });
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/no ventures row found/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('checkSyntheticActorFencing — hollow/absent config detection', () => {
  it('blocks when synthetic_actor is entirely absent despite opting in', async () => {
    const result = await checkSyntheticActorFencing(makeSupabase({ uat_probe_required: true }), 'v-hollow-1', {});
    expect(result).toEqual({ applies: true, satisfied: false, reason: expect.stringContaining('is absent') });
  });

  it('blocks when exclusion_predicate_ref is a placeholder', async () => {
    const result = await checkSyntheticActorFencing(
      makeSupabase({ uat_probe_required: true, synthetic_actor: { ...VALID_SA, exclusion_predicate_ref: 'TODO' } }),
      'v-hollow-2', {},
    );
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/placeholder/);
  });

  it('blocks when github_repo/workflow_file/uat_step_name are incomplete', async () => {
    const result = await checkSyntheticActorFencing(
      makeSupabase({ uat_probe_required: true, synthetic_actor: { exclusion_predicate_ref: 'lib/synthetic-actor.js#isSyntheticActor' } }),
      'v-hollow-3', {},
    );
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/incomplete/);
  });

  // SEC-55 (round 9): uat_step_name is validated against a code-side
  // allowlist rather than left as unchecked free text -- repointing it at
  // an unrelated always-green step (even within the correct, cross-checked
  // repo) must fail closed, never reach the network.
  it('blocks (fail-closed, zero fetch calls) when uat_step_name is not in the allowlist', async () => {
    const fetchImpl = vi.fn();
    const result = await checkSyntheticActorFencing(
      makeSupabase({ uat_probe_required: true, synthetic_actor: { ...VALID_SA, uat_step_name: 'Checkout' } }),
      'v-hollow-4', { fetchImpl, githubToken: 'tok' },
    );
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/not in the allowlist/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('checkSyntheticActorFencing — venture_resources independent cross-check (round 8)', () => {
  const meta = { uat_probe_required: true, synthetic_actor: VALID_SA };

  it('blocks (fail-closed) when synthetic_actor.github_repo does not match the venture_resources record -- repointing attack', async () => {
    const supabase = makeSupabase(meta, { registeredRepo: 'rickfelix/some-other-repo' });
    const fetchImpl = vi.fn();
    const result = await checkSyntheticActorFencing(supabase, 'v-xcheck-1', { fetchImpl, githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/does not match the venture's independently-registered repo/);
    expect(fetchImpl).not.toHaveBeenCalled(); // never even attempts the pull against an unverified repo
  });

  it('blocks (fail-closed) when no venture_resources github_repo record exists at all', async () => {
    const supabase = makeSupabase(meta, { registeredRepo: null });
    const result = await checkSyntheticActorFencing(supabase, 'v-xcheck-2', { fetchImpl: vi.fn(), githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/no venture_resources github_repo record exists/);
  });

  it('fails closed when the venture_resources read itself throws', async () => {
    const supabase = {
      from: (table) => {
        if (table === 'venture_resources') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('db down'); } }) }) }) };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: meta }, error: null }) }) }) };
      },
    };
    const result = await checkSyntheticActorFencing(supabase, 'v-xcheck-3', { fetchImpl: vi.fn(), githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/fail-closed/);
  });

  it('proceeds to the GitHub pull when github_repo matches the venture_resources record', async () => {
    const supabase = makeSupabase(meta, { registeredRepo: VALID_SA.github_repo });
    const fetchImpl = githubFetchSequence({
      jobs: [{ name: 'deploy', steps: [{ name: 'post-deploy-signed-in-uat', conclusion: 'success' }] }],
    });
    const result = await checkSyntheticActorFencing(supabase, 'v-xcheck-4', { fetchImpl, githubToken: 'tok' });
    expect(result.satisfied).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe('checkSyntheticActorFencing — DB read error (fail closed)', () => {
  it('applies:true, satisfied:false when the ventures read throws', async () => {
    const result = await checkSyntheticActorFencing(makeThrowingSupabase('connection refused'), 'v-db-err', {});
    expect(result).toEqual({ applies: true, satisfied: false, reason: expect.stringContaining('fail-closed') });
  });
});

describe('checkSyntheticActorFencing — GitHub step-granularity pull', () => {
  const meta = { uat_probe_required: true, synthetic_actor: VALID_SA };

  it('satisfied:true when the named step concludes success', async () => {
    const fetchImpl = githubFetchSequence({
      jobs: [{ name: 'deploy', steps: [{ name: 'post-deploy-signed-in-uat', conclusion: 'success' }] }],
    });
    const result = await checkSyntheticActorFencing(makeSupabase(meta), 'v-gh-1', { fetchImpl, githubToken: 'tok' });
    expect(result).toEqual({ applies: true, satisfied: true, reason: expect.stringContaining('verified PASS'), details: expect.any(Object) });
  });

  it('satisfied:false when the named step concludes failure (job-level success does not matter)', async () => {
    const fetchImpl = githubFetchSequence({
      jobs: [{ name: 'deploy', steps: [{ name: 'post-deploy-signed-in-uat', conclusion: 'failure' }] }],
    });
    const result = await checkSyntheticActorFencing(makeSupabase(meta), 'v-gh-2', { fetchImpl, githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
  });

  it('satisfied:false when the named step was skipped (job still concludes success)', async () => {
    const fetchImpl = githubFetchSequence({
      jobs: [{ name: 'deploy', steps: [{ name: 'post-deploy-signed-in-uat', conclusion: 'skipped' }] }],
    });
    const result = await checkSyntheticActorFencing(makeSupabase(meta), 'v-gh-3', { fetchImpl, githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
    expect(result.details.stepConclusion).toBe('skipped');
  });

  it('satisfied:false when the named step is not found in any job (renamed/removed)', async () => {
    const fetchImpl = githubFetchSequence({
      jobs: [{ name: 'deploy', steps: [{ name: 'some-other-step', conclusion: 'success' }] }],
    });
    const result = await checkSyntheticActorFencing(makeSupabase(meta), 'v-gh-4', { fetchImpl, githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });

  it('satisfied:false when no completed run exists on main', async () => {
    const fetchImpl = githubFetchSequence({ runs: [] });
    const result = await checkSyntheticActorFencing(makeSupabase(meta), 'v-gh-5', { fetchImpl, githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/no completed run/);
  });

  it('fails CLOSED (no cache yet) when the GitHub API returns a non-OK status and there is no prior cached result', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }));
    const result = await checkSyntheticActorFencing(makeSupabase(meta), 'v-gh-6', { fetchImpl, githubToken: 'tok' });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/fail-closed/);
  });

  it('fails CLOSED when no token is configured', async () => {
    const fetchImpl = vi.fn();
    const result = await checkSyntheticActorFencing(makeSupabase(meta), 'v-gh-7', { fetchImpl, githubToken: undefined });
    expect(result.satisfied).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('checkSyntheticActorFencing — short-TTL cached-last-known-good fallback', () => {
  const meta = { uat_probe_required: true, synthetic_actor: VALID_SA };

  it('uses the cached result from a prior successful pull when a LATER call hits a transient GitHub error', async () => {
    const ventureId = 'v-cache-1';
    const goodFetch = githubFetchSequence({
      jobs: [{ name: 'deploy', steps: [{ name: 'post-deploy-signed-in-uat', conclusion: 'success' }] }],
    });
    const first = await checkSyntheticActorFencing(makeSupabase(meta), ventureId, { fetchImpl: goodFetch, githubToken: 'tok' });
    expect(first.satisfied).toBe(true);

    const failingFetch = vi.fn(async () => ({ ok: false, status: 503 }));
    const second = await checkSyntheticActorFencing(makeSupabase(meta), ventureId, { fetchImpl: failingFetch, githubToken: 'tok' });
    expect(second.satisfied).toBe(true); // cached last-known-good, not fail-closed
    expect(second.reason).toMatch(/cached result/);
  });
});
