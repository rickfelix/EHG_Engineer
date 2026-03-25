import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  fetchLatestWorkflowRun,
  fetchRunArtifacts,
  fetchGitHubArtifacts,
  ingestVentureTestResults,
} from '../bridge/github-artifact-fetcher.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  process.env.GITHUB_TOKEN = 'test-token-123';
});

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
});

describe('fetchLatestWorkflowRun', () => {
  it('returns the latest successful workflow run', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        workflow_runs: [
          { id: 100, conclusion: 'failure' },
          { id: 99, conclusion: 'success', name: 'CI' },
        ],
      }),
    });

    const { data, error } = await fetchLatestWorkflowRun('owner/repo');
    expect(error).toBeNull();
    expect(data.id).toBe(99);
    expect(data.conclusion).toBe('success');
  });

  it('returns error when GITHUB_TOKEN not set', async () => {
    delete process.env.GITHUB_TOKEN;
    const { data, error } = await fetchLatestWorkflowRun('owner/repo');
    expect(data).toBeNull();
    expect(error).toContain('GITHUB_TOKEN');
  });

  it('returns error on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
    const { data, error } = await fetchLatestWorkflowRun('owner/nonexistent');
    expect(data).toBeNull();
    expect(error).toContain('not found');
  });

  it('returns error on rate limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Map([
        ['X-RateLimit-Remaining', '0'],
        ['X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 3600)],
      ]),
    });
    const { data, error } = await fetchLatestWorkflowRun('owner/repo');
    expect(data).toBeNull();
    expect(error).toContain('rate limited');
  });

  it('returns error when no runs found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ workflow_runs: [] }),
    });
    const { data, error } = await fetchLatestWorkflowRun('owner/repo');
    expect(data).toBeNull();
    expect(error).toContain('No workflow runs');
  });

  it('falls back to first run when no successful run exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        workflow_runs: [{ id: 50, conclusion: 'failure' }],
      }),
    });
    const { data } = await fetchLatestWorkflowRun('owner/repo');
    expect(data.id).toBe(50);
  });
});

describe('fetchRunArtifacts', () => {
  it('returns artifact list for a run', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifacts: [
          { id: 1, name: 'test-results', expired: false, archive_download_url: 'https://api.github.com/dl/1' },
          { id: 2, name: 'coverage', expired: false, archive_download_url: 'https://api.github.com/dl/2' },
        ],
      }),
    });

    const { data, error } = await fetchRunArtifacts('owner/repo', 99);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('test-results');
  });

  it('returns error when GITHUB_TOKEN not set', async () => {
    delete process.env.GITHUB_TOKEN;
    const { data, error } = await fetchRunArtifacts('owner/repo', 99);
    expect(data).toBeNull();
    expect(error).toContain('GITHUB_TOKEN');
  });
});

describe('fetchGitHubArtifacts', () => {
  it('returns empty paths when no workflow runs found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ workflow_runs: [] }),
    });

    const result = await fetchGitHubArtifacts('owner/repo');
    expect(Object.keys(result.artifactPaths)).toHaveLength(0);
    expect(result.tmpDir).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns empty paths when artifacts are empty', async () => {
    // Mock workflow run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ workflow_runs: [{ id: 1, conclusion: 'success' }] }),
    });
    // Mock artifacts - empty list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ artifacts: [] }),
    });

    const result = await fetchGitHubArtifacts('owner/repo');
    expect(Object.keys(result.artifactPaths)).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.stringContaining('No artifacts'));
  });

  it('skips expired artifacts with warning', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ workflow_runs: [{ id: 1, conclusion: 'success' }] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifacts: [{ id: 1, name: 'test-results', expired: true, archive_download_url: 'url' }],
      }),
    });

    const result = await fetchGitHubArtifacts('owner/repo');
    expect(result.warnings).toContainEqual(expect.stringContaining('expired'));
  });
});

describe('ingestVentureTestResults', () => {
  it('returns failure when no artifacts found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ workflow_runs: [] }),
    });

    const result = await ingestVentureTestResults('venture-123', 'owner/repo', { skipWrite: true });
    expect(result.success).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns failure when GITHUB_TOKEN not set', async () => {
    delete process.env.GITHUB_TOKEN;
    const result = await ingestVentureTestResults('venture-123', 'owner/repo', { skipWrite: true });
    expect(result.success).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining('GITHUB_TOKEN'));
  });

  it('exports ingestVentureTestResults as a function', () => {
    expect(typeof ingestVentureTestResults).toBe('function');
  });

  it('exports fetchGitHubArtifacts as a function', () => {
    expect(typeof fetchGitHubArtifacts).toBe('function');
  });
});
