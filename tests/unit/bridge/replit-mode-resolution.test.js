/**
 * QF-20260523-164: integration assertion for SSOT-authoritative mode resolution
 * in formatReplitOptimized (follow-on to SD-LEO-FEAT-STAGE-REPLIT-PROMPTS-001).
 * Asserts: ventures.repo_url resolves -> manifest.mode='build-into'; null -> 'create-new'.
 * Mocks @supabase/supabase-js + resolve-venture-repo; the format strategies run for real.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { resolveMock, mkSupabase } = vi.hoisted(() => {
  const resolveMock = vi.fn();
  const mkSupabase = () => ({
    rpc: vi.fn().mockResolvedValue({
      data: {
        groups: [{
          group_key: 'sprint_plan',
          artifacts: [{ content: JSON.stringify({ items: [{ name: 'Login', story_points: 1, priority: 'high' }] }) }],
        }],
        summary: {},
      },
      error: null,
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { name: 'TestVenture', description: 'd', target_platform: 'web' } }),
        }),
      }),
    }),
  });
  return { resolveMock, mkSupabase };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mkSupabase() }));
vi.mock('../../../lib/eva/bridge/resolve-venture-repo.js', () => ({ resolveVentureRepoUrl: resolveMock }));

const { formatReplitOptimized } = await import('../../../lib/eva/bridge/replit-prompt-formatter.js');

const VID = '4f71b3bd-8a1e-462e-a8b2-76efb8607206';

describe('formatReplitOptimized — SSOT-authoritative mode resolution', () => {
  beforeEach(() => resolveMock.mockReset());

  it('resolves build-into when ventures.repo_url resolves to a repo', async () => {
    resolveMock.mockResolvedValue('https://github.com/rickfelix/contribution-hub');
    const r = await formatReplitOptimized(VID, {});
    expect(r.manifest.mode).toBe('build-into');
  });

  it('resolves create-new when no repo resolves', async () => {
    resolveMock.mockResolvedValue(null);
    const r = await formatReplitOptimized(VID, {});
    expect(r.manifest.mode).toBe('create-new');
  });

  it('SSOT is authoritative: a repo overrides even an absent/“create-new” caller hint', async () => {
    resolveMock.mockResolvedValue('https://github.com/rickfelix/contribution-hub');
    const r = await formatReplitOptimized(VID, { mode: 'create-new' });
    expect(r.manifest.mode).toBe('build-into');
  });
});
