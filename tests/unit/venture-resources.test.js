/**
 * Unit tests for lib/venture-resources.js
 * SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockUpsert = vi.fn();
const mockOrder = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: mockFrom,
  }),
}));

// Wire up fluent chain
beforeEach(() => {
  vi.clearAllMocks();

  // Default chain: from().upsert().select().single()
  mockSingle.mockResolvedValue({ data: { id: 'test-id', status: 'active' }, error: null });
  mockSelect.mockReturnValue({ single: mockSingle });
  mockUpsert.mockReturnValue({ select: mockSelect });

  // For update chain: from().update().eq().eq().select()
  mockEq.mockReturnValue({ eq: mockEq, select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });

  // For query chain: from().select().eq().order()
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockEq.mockReturnValue({ eq: mockEq, select: mockSelect, order: mockOrder });

  mockFrom.mockReturnValue({
    upsert: mockUpsert,
    update: mockUpdate,
    select: (...args) => {
      mockSelect(...args);
      return { eq: mockEq, order: mockOrder, single: mockSingle };
    },
  });
});

describe('registerVentureResource', () => {
  it('should upsert a resource with correct parameters', async () => {
    const { registerVentureResource } = await import('../../lib/venture-resources.js');

    const result = await registerVentureResource(
      'venture-123', 'github_repo', 'rickfelix/test', 'github', { url: 'https://github.com/rickfelix/test' }
    );

    expect(mockFrom).toHaveBeenCalledWith('venture_resources');
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        venture_id: 'venture-123',
        resource_type: 'github_repo',
        resource_identifier: 'rickfelix/test',
        provider: 'github',
        status: 'active',
        metadata: { url: 'https://github.com/rickfelix/test' },
      },
      { onConflict: 'venture_id,resource_type,resource_identifier' }
    );
    expect(result).toEqual({ id: 'test-id', status: 'active' });
  });

  it('should return null on error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'FK violation' } });
    const { registerVentureResource } = await import('../../lib/venture-resources.js');

    const result = await registerVentureResource('bad-id', 'github_repo', 'test', 'github');
    expect(result).toBeNull();
  });

  it('should default metadata to empty object', async () => {
    const { registerVentureResource } = await import('../../lib/venture-resources.js');

    await registerVentureResource('v-1', 'local_directory', '/tmp/test', 'local');

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} }),
      expect.any(Object)
    );
  });
});

describe('markResourcesCleaned', () => {
  it('should update active resources to cleaned', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: '1' }, { id: '2' }], error: null });
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    const count = await markResourcesCleaned('venture-123');

    expect(mockFrom).toHaveBeenCalledWith('venture_resources');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'cleaned' });
    expect(count).toBe(2);
  });

  it('should return 0 when no resources exist', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    const count = await markResourcesCleaned('empty-venture');
    expect(count).toBe(0);
  });

  it('should return 0 on error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'connection error' } });
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    const count = await markResourcesCleaned('venture-123');
    expect(count).toBe(0);
  });
});

describe('getVentureResources', () => {
  it('should query resources by venture_id', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: '1', resource_type: 'github_repo' }], error: null });
    const { getVentureResources } = await import('../../lib/venture-resources.js');

    const resources = await getVentureResources('venture-123');
    expect(mockFrom).toHaveBeenCalledWith('venture_resources');
    expect(resources).toHaveLength(1);
  });

  it('should return empty array on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'oops' } });
    const { getVentureResources } = await import('../../lib/venture-resources.js');

    const resources = await getVentureResources('venture-123');
    expect(resources).toEqual([]);
  });
});
