import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

// Mock supabase client
vi.mock('../../../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const { execSync } = await import('child_process');
const { existsSync } = await import('fs');
const { executeDeployment } = await import('../../../../../lib/eva/stage-templates/analysis-steps/stage-23-deployment.js');

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-23-deployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeDeployment', () => {
    it('skips deployment when release decision is not release', async () => {
      const result = await executeDeployment({
        stage22Data: { releaseDecision: { decision: 'hold' } },
        ventureId: 'test-id',
        logger: silentLogger,
      });

      expect(result.deployed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('hold');
    });

    it('skips deployment when Docker is not available', async () => {
      execSync.mockImplementation(() => { throw new Error('not found'); });

      const result = await executeDeployment({
        stage22Data: { releaseDecision: { decision: 'release' } },
        ventureId: 'test-id',
        logger: silentLogger,
      });

      expect(result.deployed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('not found');
    });

    it('skips deployment when no docker-compose.yml exists', async () => {
      // Docker available
      execSync.mockImplementation(() => 'Docker version 24.0');
      existsSync.mockReturnValue(false);

      const result = await executeDeployment({
        stage22Data: { releaseDecision: { decision: 'release' } },
        ventureId: 'test-id',
        ventureRepoPath: '/tmp/test-venture',
        logger: silentLogger,
      });

      expect(result.deployed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('docker-compose.yml');
    });

    it('handles docker compose up failure', async () => {
      let _callCount = 0;
      execSync.mockImplementation(() => {
        _callCount++;
        // First two calls are Docker version checks (pass)
        if (_callCount <= 2) return 'Docker version 24.0';
        // Third call is docker compose up (fail)
        throw new Error('build failed');
      });
      existsSync.mockReturnValue(true);

      const result = await executeDeployment({
        stage22Data: { releaseDecision: { decision: 'release' } },
        ventureId: 'test-id',
        ventureRepoPath: '/tmp/test-venture',
        logger: silentLogger,
      });

      expect(result.deployed).toBe(false);
      expect(result.error).toContain('build failed');
    });

    it('deploys successfully with healthy endpoint', async () => {
      execSync.mockImplementation(() => {
        return 'ok';
      });
      existsSync.mockReturnValue(true);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await executeDeployment({
        stage22Data: { releaseDecision: { decision: 'release' } },
        ventureId: 'test-id',
        ventureRepoPath: '/tmp/test-venture',
        logger: silentLogger,
      });

      expect(result.deployed).toBe(true);
      expect(result.healthy).toBe(true);
      expect(result.deployment_url).toBe('http://localhost:3000');
    });

    it('reports unhealthy when health check fails', async () => {
      execSync.mockImplementation(() => 'ok');
      existsSync.mockReturnValue(true);
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await executeDeployment({
        stage22Data: { releaseDecision: { decision: 'release' } },
        ventureId: 'test-id',
        ventureRepoPath: '/tmp/test-venture',
        logger: silentLogger,
      });

      expect(result.deployed).toBe(true);
      expect(result.healthy).toBe(false);
      expect(result.deployment_url).toBeNull();
    }, 90_000);

    it('skips when release decision is cancel', async () => {
      const result = await executeDeployment({
        stage22Data: { releaseDecision: { decision: 'cancel' } },
        ventureId: 'test-id',
        logger: silentLogger,
      });

      expect(result.skipped).toBe(true);
    });
  });
});
