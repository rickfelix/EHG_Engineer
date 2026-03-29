/**
 * Tests for lib/cleanup/archive.js
 * SD: SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-D
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportVentureSnapshot, softDelete, restore, permanentDelete, cleanExpiredSoftDeletes } from '../../../lib/cleanup/archive.js';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

// Mock Supabase client factory
function createMockSupabase(data = {}) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };

  // Default single() to return venture data
  mockChain.single.mockResolvedValue({ data: data.venture || null, error: data.ventureError || null });

  const supabase = {
    from: vi.fn((table) => {
      if (data.tableOverrides && data.tableOverrides[table]) {
        return data.tableOverrides[table];
      }
      return { ...mockChain };
    }),
  };

  return { supabase, mockChain };
}

describe('exportVentureSnapshot', () => {
  it('should export venture data to a JSON file', async () => {
    const ventureId = 'test-venture-001';
    const tmpDir = join(os.tmpdir(), 'archive-test-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });

    const ventureData = { id: ventureId, name: 'Test Venture', status: 'active' };

    // Create mock that returns venture on single() and empty arrays for related tables
    const mockFrom = vi.fn((table) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: table === 'ventures' ? ventureData : null, error: null }),
      };
      // For non-ventures tables, return array data (not single)
      if (table !== 'ventures') {
        chain.eq = vi.fn().mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    const supabase = { from: mockFrom };

    const result = await exportVentureSnapshot(ventureId, { supabase, outputDir: tmpDir });

    expect(result.success).toBe(true);
    expect(result.path).toBeDefined();
    expect(result.path).toContain('venture-test-venture-001');
    expect(result.tables).toBeDefined();
    expect(result.tables.ventures).toBe(1);
  });

  it('should return error when venture not found', async () => {
    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    }));
    const supabase = { from: mockFrom };

    const result = await exportVentureSnapshot('nonexistent', { supabase });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Venture not found');
  });
});

describe('softDelete', () => {
  it('should set deleted_at timestamp on venture', async () => {
    const ventureId = 'test-venture-002';
    let callCount = 0;

    const mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First call: select().eq().single() for fetch
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: ventureId, deleted_at: null }, error: null }),
        };
        return chain;
      } else {
        // Second call: update().eq() for setting deleted_at
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
    });
    const supabase = { from: mockFrom };

    const result = await softDelete(ventureId, { supabase });

    expect(result.success).toBe(true);
    expect(result.deleted_at).toBeDefined();
  });

  it('should be idempotent when already soft-deleted', async () => {
    const existingDeletedAt = '2026-03-29T20:00:00.000Z';

    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'test', deleted_at: existingDeletedAt },
        error: null,
      }),
    }));
    const supabase = { from: mockFrom };

    const result = await softDelete('test', { supabase });

    expect(result.success).toBe(true);
    expect(result.deleted_at).toBe(existingDeletedAt);
    expect(result.note).toBe('already soft-deleted');
  });

  it('should return error when venture not found', async () => {
    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    }));
    const supabase = { from: mockFrom };

    const result = await softDelete('nonexistent', { supabase });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Venture not found');
  });
});

describe('restore', () => {
  it('should clear deleted_at within cooling period', async () => {
    const recentDelete = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    let callCount = 0;

    const mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'test', deleted_at: recentDelete },
            error: null,
          }),
        };
      } else {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
    });
    const supabase = { from: mockFrom };

    const result = await restore('test', { supabase });

    expect(result.success).toBe(true);
  });

  it('should reject restore after cooling period', async () => {
    const oldDelete = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(); // 73 hours ago

    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'test', deleted_at: oldDelete },
        error: null,
      }),
    }));
    const supabase = { from: mockFrom };

    const result = await restore('test', { supabase });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cooling period expired');
  });

  it('should error when venture is not soft-deleted', async () => {
    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'test', deleted_at: null },
        error: null,
      }),
    }));
    const supabase = { from: mockFrom };

    const result = await restore('test', { supabase });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not soft-deleted');
  });
});

describe('permanentDelete', () => {
  it('should delete venture and related data when cooling period expired', async () => {
    const oldDelete = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
    let callCount = 0;

    const mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // First call: select for cooling period check
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'test', deleted_at: oldDelete },
            error: null,
          }),
        };
      } else {
        // Subsequent calls: delete from related tables and ventures
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
    });
    const supabase = { from: mockFrom };

    const result = await permanentDelete('test', { supabase });

    expect(result.success).toBe(true);
    expect(result.deleted_tables).toContain('ventures');
    expect(result.deleted_tables.length).toBeGreaterThan(1);
  });

  it('should reject deletion during cooling period', async () => {
    const recentDelete = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'test', deleted_at: recentDelete },
        error: null,
      }),
    }));
    const supabase = { from: mockFrom };

    const result = await permanentDelete('test', { supabase });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cooling period still active');
  });

  it('should allow forced deletion during cooling period', async () => {
    const recentDelete = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    const mockFrom = vi.fn(() => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'test', deleted_at: recentDelete },
          error: null,
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
      return chain;
    });
    const supabase = { from: mockFrom };

    const result = await permanentDelete('test', { supabase, force: true });

    expect(result.success).toBe(true);
    expect(result.deleted_tables).toContain('ventures');
  });
});

describe('cleanExpiredSoftDeletes', () => {
  it('should return empty results when no expired ventures', async () => {
    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
    const supabase = { from: mockFrom };

    const result = await cleanExpiredSoftDeletes({ supabase });

    expect(result.processed).toBe(0);
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('should handle query errors gracefully', async () => {
    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }));
    const supabase = { from: mockFrom };

    const result = await cleanExpiredSoftDeletes({ supabase });

    expect(result.processed).toBe(0);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].error).toContain('DB error');
  });
});
