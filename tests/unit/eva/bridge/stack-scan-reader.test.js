/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-6.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveVentureGithubRepo, readStackScanConclusion, isSafeRepoShorthand, STACK_SCAN_WORKFLOW_FILE } from '../../../../lib/eva/bridge/stack-scan-reader.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ resourceIdentifier = 'rickfelix/altifyai', errorOnRead = false } = {}) {
  return {
    from(table) {
      if (table === 'venture_resources') {
        return {
          select() {
            return {
              eq() { return this; },
              order() { return this; },
              limit() { return this; },
              maybeSingle: () => errorOnRead
                ? Promise.resolve({ data: null, error: { message: 'boom' } })
                : Promise.resolve({ data: resourceIdentifier ? { resource_identifier: resourceIdentifier } : null, error: null }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

/**
 * SEC-2: resolveVentureGithubRepo must filter to status='active' and deterministically
 * pick the most recent row (order by created_at desc, limit 1) before maybeSingle() --
 * mirrors the query shape at stage-20-code-quality.js:742-749. This spy asserts the
 * chained calls happen, not just that a mocked result is returned.
 */
function buildSpySupabase({ resourceIdentifier = 'rickfelix/altifyai' } = {}) {
  const calls = { eq: [], order: [], limit: [] };
  return {
    calls,
    from(table) {
      if (table !== 'venture_resources') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq(field, value) { calls.eq.push([field, value]); return this; },
            order(field, opts) { calls.order.push([field, opts]); return this; },
            limit(n) { calls.limit.push(n); return this; },
            maybeSingle: () => Promise.resolve({ data: { resource_identifier: resourceIdentifier }, error: null }),
          };
        },
      };
    },
  };
}

describe('resolveVentureGithubRepo', () => {
  it('AltifyAI-shaped: resolves rickfelix/altifyai from venture_resources', async () => {
    const supabase = buildMockSupabase();
    const result = await resolveVentureGithubRepo({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result).toEqual({ ok: true, repo: 'rickfelix/altifyai' });
  });

  it('returns not-configured when no venture_resources github_repo record exists', async () => {
    const supabase = buildMockSupabase({ resourceIdentifier: null });
    const result = await resolveVentureGithubRepo({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result).toEqual({ ok: false, reason: 'no_venture_resources_github_repo_record' });
  });

  it('does not throw on a DB read error', async () => {
    const supabase = buildMockSupabase({ errorOnRead: true });
    const result = await resolveVentureGithubRepo({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('venture_resources_read_error');
  });

  it('does not throw when supabase or ventureId is missing', async () => {
    await expect(resolveVentureGithubRepo({ supabase: null, ventureId: 'v1' })).resolves.toEqual({ ok: false, reason: 'missing_supabase_or_ventureId' });
  });

  // SEC-1 (EXEC-phase SECURITY review, CONFIRMED via direct exploit reproduction):
  // a resource_identifier crafted to embed a second path + query string used to be
  // interpolated unvalidated into the GitHub API URL, redirecting the runs lookup to
  // an attacker-chosen workflow file. Must now be rejected at the source.
  it('SEC-1: rejects a resource_identifier crafted to redirect the GitHub API URL to another workflow', async () => {
    const hostile = 'rickfelix/altifyai/actions/workflows/always-green.yml/runs?branch=main&status=completed&per_page=1&x=';
    const supabase = buildMockSupabase({ resourceIdentifier: hostile });
    const result = await resolveVentureGithubRepo({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result).toEqual({ ok: false, reason: 'unsafe_repo_identifier' });
  });

  it('SEC-2: filters to status=active and orders by created_at desc, limit 1, before maybeSingle', async () => {
    const supabase = buildSpySupabase();
    const result = await resolveVentureGithubRepo({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result).toEqual({ ok: true, repo: 'rickfelix/altifyai' });
    expect(supabase.calls.eq).toContainEqual(['status', 'active']);
    expect(supabase.calls.order).toContainEqual(['created_at', { ascending: false }]);
    expect(supabase.calls.limit).toContain(1);
  });
});

describe('isSafeRepoShorthand', () => {
  it('accepts a well-formed owner/repo shorthand', () => {
    expect(isSafeRepoShorthand('rickfelix/altifyai')).toBe(true);
    expect(isSafeRepoShorthand('some-org/some_repo.name')).toBe(true);
  });

  it('rejects the SEC-1 exploit value (extra path segments + query string)', () => {
    expect(isSafeRepoShorthand('rickfelix/altifyai/actions/workflows/always-green.yml/runs?branch=main&status=completed&per_page=1&x=')).toBe(false);
  });

  it('rejects non-string, empty, and overlong values', () => {
    expect(isSafeRepoShorthand(null)).toBe(false);
    expect(isSafeRepoShorthand(undefined)).toBe(false);
    expect(isSafeRepoShorthand(42)).toBe(false);
    expect(isSafeRepoShorthand('')).toBe(false);
    expect(isSafeRepoShorthand('a/' + 'b'.repeat(200))).toBe(false);
  });

  it('rejects a bare repo name with no owner segment, and a full URL', () => {
    expect(isSafeRepoShorthand('altifyai')).toBe(false);
    expect(isSafeRepoShorthand('https://github.com/rickfelix/altifyai')).toBe(false);
  });

  // SECURITY post-fix re-review, LOW residual: an all-dots repo segment (e.g.
  // "owner/..") passed the original allowlist and normalized out a path segment
  // in the built URL. Not exploitable (measured: 404s upstream), but rejected
  // by construction now rather than relying on that 404.
  it('rejects an all-dots repo segment (SECURITY LOW residual, defense-in-depth)', () => {
    expect(isSafeRepoShorthand('owner/..')).toBe(false);
    expect(isSafeRepoShorthand('owner/.')).toBe(false);
    expect(isSafeRepoShorthand('owner/...')).toBe(false);
  });
});

describe('readStackScanConclusion', () => {
  it('returns the specific stack-scan run conclusion, never falling back to any other workflow', async () => {
    const supabase = buildMockSupabase();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workflow_runs: [{ id: 42, conclusion: 'success' }] }),
    });
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: 'fake-token', fetchImpl, logger: silentLogger });
    expect(result.available).toBe(true);
    expect(result.conclusion).toBe('success');
    expect(result.runId).toBe(42);
    // The URL must target the SPECIFIC stack-scan.yml workflow, not a generic runs endpoint.
    const calledUrl = fetchImpl.mock.calls[0][0];
    expect(calledUrl).toContain(`/workflows/${STACK_SCAN_WORKFLOW_FILE}/runs`);
  });

  it('reports a failing stack-scan conclusion honestly, never swallowed', async () => {
    const supabase = buildMockSupabase();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workflow_runs: [{ id: 43, conclusion: 'failure' }] }),
    });
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: 'fake-token', fetchImpl, logger: silentLogger });
    expect(result.available).toBe(true);
    expect(result.conclusion).toBe('failure');
  });

  it('returns not-configured when the venture has no registered repo (never throws)', async () => {
    const supabase = buildMockSupabase({ resourceIdentifier: null });
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: 'fake-token', fetchImpl: vi.fn(), logger: silentLogger });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('no_venture_resources_github_repo_record');
  });

  it('returns not-configured (never throws) when no GitHub token is available', async () => {
    const supabase = buildMockSupabase();
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: undefined, fetchImpl: vi.fn(), logger: silentLogger });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('no_github_token_configured');
  });

  it('degrades gracefully (never throws) on a GitHub API error status', async () => {
    const supabase = buildMockSupabase();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: 'fake-token', fetchImpl, logger: silentLogger });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('github_api_error_404');
  });

  it('degrades gracefully (never throws) when no completed run exists yet', async () => {
    const supabase = buildMockSupabase();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ workflow_runs: [] }) });
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: 'fake-token', fetchImpl, logger: silentLogger });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('no_completed_stack_scan_run');
  });

  it('degrades gracefully (never throws) when fetch itself throws', async () => {
    const supabase = buildMockSupabase();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: 'fake-token', fetchImpl, logger: silentLogger });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/network down/);
  });

  // PLAN-phase VALIDATION (V-3): this call is awaited inside the S24 choke-point, so
  // it must carry a real time budget rather than hanging on a stalled third-party call.
  it('passes an AbortSignal to fetchImpl and reports a distinct "timeout" reason on abort (never throws)', async () => {
    const supabase = buildMockSupabase();
    const fetchImpl = vi.fn((url, opts) => {
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      const err = new Error('The operation was aborted');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    });
    const result = await readStackScanConclusion({ supabase, ventureId: 'v1', token: 'fake-token', fetchImpl, logger: silentLogger });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('timeout');
  });
});
