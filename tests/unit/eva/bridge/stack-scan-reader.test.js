/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-6.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveVentureGithubRepo, readStackScanConclusion, STACK_SCAN_WORKFLOW_FILE } from '../../../../lib/eva/bridge/stack-scan-reader.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ resourceIdentifier = 'rickfelix/altifyai', errorOnRead = false } = {}) {
  return {
    from(table) {
      if (table === 'venture_resources') {
        return {
          select() {
            return {
              eq() { return this; },
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
});
