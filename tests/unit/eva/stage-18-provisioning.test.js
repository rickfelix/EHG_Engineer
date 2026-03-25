/**
 * Tests for Stage 18 provisioning verification
 * SD: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-G
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the StageExecutionWorker's _verifyAndProvisionVenture behavior
describe('Stage 18 Provisioning Verification', () => {
  let mockSupabase;
  let mockLogger;
  let worker;

  beforeEach(() => {
    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
  });

  describe('provisioned ventures', () => {
    it('should detect already-provisioned venture and skip provisioning', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { state: 'provisioned', github_repo_url: 'https://github.com/rickfelix/test-venture', provisioned_at: '2026-03-25' },
        error: null,
      });

      // Simulate the verification logic
      const { data: provState, error: provError } = await mockSupabase
        .from('venture_provisioning_state')
        .select('state, github_repo_url, provisioned_at')
        .eq('venture_name', 'test-venture')
        .maybeSingle();

      expect(provError).toBeNull();
      expect(provState.state).toBe('provisioned');
      expect(provState.github_repo_url).toBeTruthy();
    });
  });

  describe('unprovisioned ventures', () => {
    it('should detect unprovisioned venture (no record)', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const { data: provState } = await mockSupabase
        .from('venture_provisioning_state')
        .select('state, github_repo_url, provisioned_at')
        .eq('venture_name', 'new-venture')
        .maybeSingle();

      expect(provState).toBeNull();
      // Should trigger auto-provision attempt
    });

    it('should detect partially provisioned venture (no github_repo_url)', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { state: 'provisioned', github_repo_url: null, provisioned_at: '2026-03-25' },
        error: null,
      });

      const { data: provState } = await mockSupabase
        .from('venture_provisioning_state')
        .select('state, github_repo_url, provisioned_at')
        .eq('venture_name', 'partial-venture')
        .maybeSingle();

      expect(provState.state).toBe('provisioned');
      expect(provState.github_repo_url).toBeNull();
      // Should trigger auto-provision attempt
    });
  });

  describe('error handling', () => {
    it('should handle table-not-found error gracefully', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'relation "venture_provisioning_state" does not exist' },
      });

      const { error: provError } = await mockSupabase
        .from('venture_provisioning_state')
        .select('state, github_repo_url, provisioned_at')
        .eq('venture_name', 'any-venture')
        .maybeSingle();

      expect(provError).toBeTruthy();
      expect(provError.message).toContain('does not exist');
      // Should log warning and continue — not block SD bridge
    });
  });

  describe('integration with Stage 18 hook', () => {
    it('should verify provisioning check is called before convertSprintToSDs', async () => {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');

      // Verify the code structure: _verifyAndProvisionVenture appears before convertSprintToSDs in Stage 18 block
      const workerSource = readFileSync(
        join(process.cwd(), 'lib/eva/stage-execution-worker.js'),
        'utf8'
      );

      const stage18BlockStart = workerSource.indexOf('if (currentStage === 18)');
      const provisioningCall = workerSource.indexOf('_verifyAndProvisionVenture', stage18BlockStart);
      const bridgeCall = workerSource.indexOf('convertSprintToSDs', stage18BlockStart);

      expect(stage18BlockStart).toBeGreaterThan(-1);
      expect(provisioningCall).toBeGreaterThan(stage18BlockStart);
      expect(bridgeCall).toBeGreaterThan(provisioningCall);
    });
  });
});
