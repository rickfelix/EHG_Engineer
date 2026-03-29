/**
 * Unit tests for lib/cleanup/ provider modules
 *
 * Part of SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before imports
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}));

vi.mock('../../lib/genesis/vercel-deploy.js', () => ({
  deleteVercelDeployment: vi.fn(() => Promise.resolve({ success: true })),
}));

describe('lib/cleanup providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('docker-provider', () => {
    it('returns success no-op for any ventureId', async () => {
      const { cleanupDocker } = await import('../../lib/cleanup/docker-provider.js');
      const result = await cleanupDocker('test-venture-id');

      expect(result.success).toBe(true);
      expect(result.message).toBe('no-op: Docker cleanup not configured');
    });
  });

  describe('filesystem-provider', () => {
    it('returns empty result when no paths provided', async () => {
      const { cleanupFilesystem } = await import('../../lib/cleanup/filesystem-provider.js');
      const result = await cleanupFilesystem('test-venture-id');

      expect(result.success).toBe(true);
      expect(result.cleaned).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('rejects paths outside allowed roots', async () => {
      const { cleanupFilesystem } = await import('../../lib/cleanup/filesystem-provider.js');
      const result = await cleanupFilesystem('test-venture-id', {
        paths: ['/etc/important-system-dir'],
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain('not under allowed roots');
    });
  });

  describe('vercel-provider', () => {
    it('returns success with zero deleted when no deployments found', async () => {
      const { cleanupVercel } = await import('../../lib/cleanup/vercel-provider.js');
      const result = await cleanupVercel('test-venture-id');

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('cleanup orchestrator (index)', () => {
    it('runs all three providers and aggregates results', async () => {
      const { runTeardown } = await import('../../lib/cleanup/index.js');
      const result = await runTeardown('test-venture-id');

      expect(result.success).toBe(true);
      expect(result.providers).toHaveProperty('vercel');
      expect(result.providers).toHaveProperty('filesystem');
      expect(result.providers).toHaveProperty('docker');
      expect(result.providers.docker.success).toBe(true);
      expect(result.providers.docker.message).toBe('no-op: Docker cleanup not configured');
    });

    it('reports partial failure when one provider fails', async () => {
      // Override vercel provider to throw
      vi.doMock('../../lib/cleanup/vercel-provider.js', () => ({
        cleanupVercel: vi.fn(() => { throw new Error('Vercel CLI not found'); }),
      }));

      // Re-import to pick up the mock
      vi.resetModules();
      vi.mock('../../lib/supabase-client.js', () => ({
        createSupabaseServiceClient: vi.fn(() => ({
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
      }));
      vi.mock('../../lib/genesis/vercel-deploy.js', () => ({
        deleteVercelDeployment: vi.fn(() => Promise.resolve({ success: true })),
      }));

      const { runTeardown } = await import('../../lib/cleanup/index.js');
      const result = await runTeardown('test-venture-id');

      expect(result.success).toBe(false);
      expect(result.providers.vercel.success).toBe(false);
      expect(result.providers.vercel.error).toContain('Vercel CLI not found');
      // Other providers still ran
      expect(result.providers.filesystem).toBeDefined();
      expect(result.providers.docker.success).toBe(true);
    });
  });
});
