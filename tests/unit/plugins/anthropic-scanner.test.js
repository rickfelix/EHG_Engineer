import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetContent = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    constructor() {
      this.repos = { getContent: mockGetContent };
    }
  },
}));

const { scanAnthropicRepos, ANTHROPIC_REPOS } = await import('../../../lib/plugins/anthropic-scanner.js');

describe('anthropic-scanner', () => {
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  });

  it('returns discovered count for successful scan', async () => {
    mockGetContent.mockResolvedValue({
      data: [
        { name: 'calculator', type: 'dir', path: 'tool_use/calculator', sha: 'abc123' },
        { name: 'weather', type: 'dir', path: 'tool_use/weather', sha: 'def456' },
      ],
    });

    const result = await scanAnthropicRepos(mockSupabase, { githubToken: 'test' });
    expect(result.discovered).toBeGreaterThan(0);
  });

  it('handles repo not found gracefully', async () => {
    const error = new Error('Not Found');
    error.status = 404;
    mockGetContent.mockRejectedValue(error);

    const result = await scanAnthropicRepos(mockSupabase, { githubToken: 'test' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('not found or private'))).toBe(true);
  });

  it('handles upsert errors', async () => {
    mockGetContent.mockResolvedValue({
      data: [{ name: 'plugin1', type: 'dir', path: 'tool_use/plugin1', sha: '123' }],
    });
    mockSupabase.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { message: 'upsert failed' } }),
    });

    const result = await scanAnthropicRepos(mockSupabase, { githubToken: 'test' });
    expect(result.errors.some(e => e.includes('upsert failed'))).toBe(true);
  });

  it('exports ANTHROPIC_REPOS constant', () => {
    expect(ANTHROPIC_REPOS).toBeDefined();
    expect(Array.isArray(ANTHROPIC_REPOS)).toBe(true);
    expect(ANTHROPIC_REPOS.length).toBeGreaterThan(0);
    expect(ANTHROPIC_REPOS[0]).toHaveProperty('owner');
    expect(ANTHROPIC_REPOS[0]).toHaveProperty('repo');
  });
});
