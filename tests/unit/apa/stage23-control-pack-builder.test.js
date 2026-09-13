/**
 * SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 -- unit tests for lib/apa/stage23-control-pack-builder.mjs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/synthetic-actor-guard.js', () => ({
  checkSyntheticActorFencing: vi.fn(),
}));
vi.mock('../../../lib/apa/altifyai-uat-session-token.mjs', () => ({
  mintUatSessionToken: vi.fn(async () => 'minted-jwt'),
}));

import { checkSyntheticActorFencing } from '../../../lib/eva/synthetic-actor-guard.js';
import { mintUatSessionToken } from '../../../lib/apa/altifyai-uat-session-token.mjs';
import {
  buildFenceEvidence,
  buildLiveDeploymentBindingEvidence,
  resolveLiveDeploymentSha,
} from '../../../lib/apa/stage23-control-pack-builder.mjs';

const OK = (body) => ({ ok: true, json: async () => body });
const FAIL = (status) => ({ ok: false, status, json: async () => ({}) });

function fakeSupabase(ventureRow) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: ventureRow, error: null }),
        }),
      }),
    }),
  };
}

describe('buildFenceEvidence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws without a githubToken', async () => {
    await expect(buildFenceEvidence({ supabase: fakeSupabase({}), ventureId: 'v1', githubToken: undefined }))
      .rejects.toThrow(/githubToken is required/);
  });

  it('derives canExerciseApp from checkSyntheticActorFencing and exclusionPredicateDeclared from the DB, and pulls the ci.yml test step for exclusionPredicateAssertedInVentureCi', async () => {
    checkSyntheticActorFencing.mockResolvedValue({ satisfied: true, reason: 'live UAT step verified PASS' });
    const supabase = fakeSupabase({ metadata: { synthetic_actor: { exclusion_predicate_ref: 'lib/synthetic-actor.js#isSyntheticActor' } } });
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/actions/workflows/ci.yml/runs')) return OK({ workflow_runs: [{ id: 42, head_sha: 'deadbeef' }] });
      // altifyai's ci.yml `- run: npm test` has no explicit `name:`, so GitHub Actions renders
      // the step as "Run npm test" (confirmed live against run 34727450324) -- NOT the bare
      // "npm test" a naive fixture would assume.
      if (url.includes('/actions/runs/42/jobs')) return OK({ jobs: [{ name: 'test', steps: [{ name: 'Run npm test', conclusion: 'success' }] }] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await buildFenceEvidence({ supabase, ventureId: 'v1', githubToken: 'gh-tok', fetchImpl });
    expect(result.canExerciseApp).toBe(true);
    expect(result.exclusionPredicateDeclared).toBe(true);
    expect(result.exclusionPredicateAssertedInVentureCi).toBe(true);
    expect(checkSyntheticActorFencing).toHaveBeenCalledWith(supabase, 'v1', expect.objectContaining({ githubToken: 'gh-tok' }));
  });

  it('exclusionPredicateDeclared is false for a placeholder/absent exclusion_predicate_ref', async () => {
    checkSyntheticActorFencing.mockResolvedValue({ satisfied: false, reason: 'not opted in' });
    const supabase = fakeSupabase({ metadata: { synthetic_actor: { exclusion_predicate_ref: 'TBD' } } });
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/actions/workflows/ci.yml/runs')) return OK({ workflow_runs: [{ id: 1, head_sha: 'x' }] });
      return OK({ jobs: [{ name: 'test', steps: [{ name: 'Run npm test', conclusion: 'failure' }] }] });
    });
    const result = await buildFenceEvidence({ supabase, ventureId: 'v1', githubToken: 'gh-tok', fetchImpl });
    expect(result.exclusionPredicateDeclared).toBe(false);
    expect(result.exclusionPredicateAssertedInVentureCi).toBe(false);
  });

  it('also matches a bare (unprefixed) step name, in case the workflow ever gains an explicit `name: npm test`', async () => {
    checkSyntheticActorFencing.mockResolvedValue({ satisfied: true, reason: 'ok' });
    const supabase = fakeSupabase({ metadata: { synthetic_actor: { exclusion_predicate_ref: 'ref' } } });
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/actions/workflows/ci.yml/runs')) return OK({ workflow_runs: [{ id: 1, head_sha: 'x' }] });
      return OK({ jobs: [{ name: 'test', steps: [{ name: 'npm test', conclusion: 'success' }] }] });
    });
    const result = await buildFenceEvidence({ supabase, ventureId: 'v1', githubToken: 'gh-tok', fetchImpl });
    expect(result.exclusionPredicateAssertedInVentureCi).toBe(true);
  });

  it('throws (fail-loud) if the ci.yml step cannot be found, rather than defaulting to false', async () => {
    checkSyntheticActorFencing.mockResolvedValue({ satisfied: true, reason: 'ok' });
    const supabase = fakeSupabase({ metadata: { synthetic_actor: { exclusion_predicate_ref: 'ref' } } });
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/actions/workflows/ci.yml/runs')) return OK({ workflow_runs: [{ id: 1, head_sha: 'x' }] });
      return OK({ jobs: [{ name: 'test', steps: [] }] }); // no npm test step found
    });
    await expect(buildFenceEvidence({ supabase, ventureId: 'v1', githubToken: 'gh-tok', fetchImpl })).rejects.toThrow(/not found/);
  });
});

describe('buildLiveDeploymentBindingEvidence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs a real write+readback and reports outcome=ok when the nonce round-trips', async () => {
    let posted = null;
    const fetchImpl = vi.fn(async (url, opts) => {
      if (opts?.method === 'POST') {
        posted = JSON.parse(opts.body);
        return OK({ id: 'evt-1', createdAt: 'now' });
      }
      return OK({ events: [{ properties: posted.properties }] });
    });
    const result = await buildLiveDeploymentBindingEvidence({
      secretKey: 'sk_test_x', deployedOrigin: 'https://x.dev', fapiOrigin: 'https://fapi.dev', deploymentSha: 'abc1234', fetchImpl,
    });
    expect(result.nonceWriteResult.outcome).toBe('ok');
    expect(result.nonceWriteResult.echoedNonce).toBe(result.expectedNonce);
    expect(result.deploymentSha).toBe('abc1234');
    expect(mintUatSessionToken).toHaveBeenCalled();
  });

  it('reports outcome=error when the readback does not contain the written nonce', async () => {
    const fetchImpl = vi.fn(async (url, opts) => {
      if (opts?.method === 'POST') return OK({ id: 'evt-1' });
      return OK({ events: [] }); // never echoed back
    });
    const result = await buildLiveDeploymentBindingEvidence({
      secretKey: 'sk_test_x', deployedOrigin: 'https://x.dev', fapiOrigin: 'https://fapi.dev', deploymentSha: 'abc1234', fetchImpl,
    });
    expect(result.nonceWriteResult.outcome).toBe('error');
    expect(result.nonceWriteResult.echoedNonce).toBeNull();
  });

  it('throws if the write itself fails', async () => {
    const fetchImpl = vi.fn(async (url, opts) => (opts?.method === 'POST' ? FAIL(500) : OK({ events: [] })));
    await expect(buildLiveDeploymentBindingEvidence({
      secretKey: 'sk_test_x', deployedOrigin: 'https://x.dev', fapiOrigin: 'https://fapi.dev', deploymentSha: 'abc1234', fetchImpl,
    })).rejects.toThrow(/nonce write POST/);
  });

  it('requires secretKey, deployedOrigin, and deploymentSha', async () => {
    await expect(buildLiveDeploymentBindingEvidence({ deployedOrigin: 'x', deploymentSha: 'y', fetchImpl: vi.fn() })).rejects.toThrow(/secretKey/);
    await expect(buildLiveDeploymentBindingEvidence({ secretKey: 'x', deploymentSha: 'y', fetchImpl: vi.fn() })).rejects.toThrow(/deployedOrigin/);
    await expect(buildLiveDeploymentBindingEvidence({ secretKey: 'x', deployedOrigin: 'y', fetchImpl: vi.fn() })).rejects.toThrow(/deploymentSha/);
  });
});

describe('resolveLiveDeploymentSha', () => {
  it('returns the head_sha of the latest successful deploy.yml run', async () => {
    const fetchImpl = vi.fn(async () => OK({ workflow_runs: [{ head_sha: 'realsha123' }] }));
    const sha = await resolveLiveDeploymentSha({ githubToken: 'tok', fetchImpl });
    expect(sha).toBe('realsha123');
  });

  it('throws if no successful run is found', async () => {
    const fetchImpl = vi.fn(async () => OK({ workflow_runs: [] }));
    await expect(resolveLiveDeploymentSha({ githubToken: 'tok', fetchImpl })).rejects.toThrow(/no successful/);
  });
});
