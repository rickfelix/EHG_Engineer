/**
 * Unit tests for Genesis Branch Lifecycle
 * Part of SD-GENESIS-V31-MASON-BRANCH
 */

import { jest } from '@jest/globals';

// Mock Supabase before importing module
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockOrder = jest.fn();
const mockFilter = jest.fn();

const mockFrom = jest.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate
}));

mockSelect.mockReturnValue({
  eq: mockEq,
  order: mockOrder,
  single: mockSingle
});

mockInsert.mockReturnValue({
  select: jest.fn().mockReturnValue({
    single: mockSingle
  })
});

mockUpdate.mockReturnValue({
  eq: mockEq
});

mockEq.mockReturnValue({
  single: mockSingle
});

mockOrder.mockReturnValue({
  filter: mockFilter
});

mockFilter.mockReturnValue(Promise.resolve({ data: [], error: null }));

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom
  }))
}));

// Import after mocking
const {
  generateBranchName,
  createSimulationBranch,
  getSimulationBranch,
  listSimulationBranches,
  archiveSimulation
} = await import('../../../lib/genesis/branch-lifecycle.js');

describe('Genesis Branch Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateBranchName', () => {
    it('should generate branch name with sim/ prefix', () => {
      const name = generateBranchName('A marketplace for vintage synthesizers');
      expect(name).toMatch(/^sim\/.+/);
    });

    it('should create slug from first 3 words', () => {
      const name = generateBranchName('My Amazing Project');
      expect(name).toMatch(/^sim\/my-amazing-project-.+/);
    });

    it('should handle special characters', () => {
      const name = generateBranchName('A test! With @special# chars');
      expect(name).toMatch(/^sim\/a-test-with-.+/);
    });

    it('should limit slug length', () => {
      const name = generateBranchName('This is a very long project name that should be truncated');
      // Should be sim/ + up to 30 chars + hash
      expect(name.length).toBeLessThan(50);
    });
  });

  describe('createSimulationBranch', () => {
    it('should create simulation with default TTL', async () => {
      const mockSession = {
        id: 'test-uuid',
        seed_text: 'Test venture',
        repo_url: null,
        preview_url: null,
        created_at: new Date().toISOString(),
        ttl_days: 90,
        epistemic_status: 'simulation'
      };

      mockSingle.mockResolvedValueOnce({ data: mockSession, error: null });

      const result = await createSimulationBranch('Test venture');

      expect(result.id).toBe('test-uuid');
      expect(result.ttlDays).toBe(90);
      expect(result.status).toBe('simulation');
    });

    it('should create simulation with custom TTL', async () => {
      const mockSession = {
        id: 'test-uuid-2',
        seed_text: 'Custom TTL test',
        repo_url: null,
        preview_url: null,
        created_at: new Date().toISOString(),
        ttl_days: 30,
        epistemic_status: 'simulation'
      };

      mockSingle.mockResolvedValueOnce({ data: mockSession, error: null });

      const result = await createSimulationBranch('Custom TTL test', { ttlDays: 30 });

      expect(result.ttlDays).toBe(30);
    });

    it('should throw on database error', async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(createSimulationBranch('Test'))
        .rejects.toThrow('Failed to create simulation session');
    });
  });

  describe('getSimulationBranch', () => {
    it('should return null for non-existent simulation', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

      const result = await getSimulationBranch('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return simulation data', async () => {
      const mockSession = {
        id: 'found-uuid',
        repo_url: 'https://github.com/test/repo',
        preview_url: 'https://test.vercel.app',
        created_at: new Date().toISOString(),
        ttl_days: 90,
        epistemic_status: 'simulation'
      };

      mockSingle.mockResolvedValueOnce({ data: mockSession, error: null });

      const result = await getSimulationBranch('found-uuid');

      expect(result).not.toBeNull();
      expect(result.id).toBe('found-uuid');
      expect(result.repoUrl).toBe('https://github.com/test/repo');
    });
  });

  describe('archiveSimulation', () => {
    it('should update status to archived', async () => {
      mockEq.mockResolvedValueOnce({ error: null });

      await archiveSimulation('test-uuid');

      expect(mockFrom).toHaveBeenCalledWith('simulation_sessions');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockEq.mockResolvedValueOnce({ error: { message: 'Archive failed' } });

      await expect(archiveSimulation('test-uuid'))
        .rejects.toThrow('Failed to archive simulation');
    });
  });
});
