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

  // SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-2 — DELIBERATE BEHAVIOUR CHANGE.
  // This previously asserted "should return 0 on error". That assertion pinned the
  // defect: returning 0 makes a FAILED WRITE indistinguishable from "nothing to clean",
  // so a broken teardown reported success. The sole production caller (deleteVentureFully
  // phase 3) wraps this in try/catch and is explicitly non-blocking, so throwing surfaces
  // the failure as phases.resources_error without changing control flow anywhere.
  it('THROWS on error rather than returning 0, so a failed write is not silent', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'connection error' } });
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    await expect(markResourcesCleaned('venture-123')).rejects.toThrow(/cleanup failed: connection error/);
  });
});

/**
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-2.
 *
 * These use an INJECTED stub client rather than the module-level supabase mock, because
 * the injection seam is precisely what FR-2 adds — before this change the function built
 * its own service client from process.env and could not be reached by a stub at all.
 * Every assertion below is about writes NOT happening, so the stub records each call.
 */
describe('markResourcesCleaned — dryRun is side-effect-free (FR-2)', () => {
  function makeStub({ rows = [{ id: '1' }, { id: '2' }], error = null } = {}) {
    const calls = { update: 0, select: 0, from: [] };
    const result = Promise.resolve({ data: rows, error });
    const chain = {
      eq: () => chain,
      select: () => { calls.select++; return chain; },
      then: (...a) => result.then(...a),
    };
    return {
      calls,
      from(table) {
        calls.from.push(table);
        return {
          select: () => { calls.select++; return chain; },
          update: (...args) => { calls.update++; calls.updateArgs = args; return chain; },
        };
      },
    };
  }

  it('issues NO update when dryRun is true, and still reports the count', async () => {
    const stub = makeStub();
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    const count = await markResourcesCleaned('venture-123', { dryRun: true, supabase: stub });

    expect(stub.calls.update).toBe(0);   // the whole point: preview must not write
    expect(stub.calls.from).toContain('venture_resources');
    expect(count).toBe(2);
  });

  it('DOES update when dryRun is false, so the test above could have failed', async () => {
    // Control case. Without this, "update was never called" would also pass if the
    // function were broken and never called anything at all.
    const stub = makeStub();
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    const count = await markResourcesCleaned('venture-123', { dryRun: false, supabase: stub });

    expect(stub.calls.update).toBe(1);
    expect(stub.calls.updateArgs[0]).toEqual({ status: 'cleaned' });
    expect(count).toBe(2);
  });

  it('uses the INJECTED client, not a self-built service client', async () => {
    // Before FR-2 this function called createSupabaseServiceClient() unconditionally,
    // so an injected stub was ignored and the real table was hit. If the injection seam
    // regresses, the stub records nothing and this fails.
    const stub = makeStub();
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    await markResourcesCleaned('venture-123', { dryRun: true, supabase: stub });

    expect(stub.calls.from).toEqual(['venture_resources']);
  });

  it('throws on a dry-run query error rather than reporting a false zero', async () => {
    const stub = makeStub({ rows: null, error: { message: 'boom' } });
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');

    await expect(
      markResourcesCleaned('venture-123', { dryRun: true, supabase: stub }),
    ).rejects.toThrow(/dry-run count failed: boom/);
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
