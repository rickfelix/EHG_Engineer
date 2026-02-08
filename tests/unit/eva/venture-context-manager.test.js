/**
 * Tests for VentureContextManager
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-D
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { VentureContextManager, createVentureContextManager } from '../../../lib/eva/venture-context-manager.js';

function createMockSupabase(overrides = {}) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn(() => ({ ...mockQuery, ...overrides })),
    _mockQuery: mockQuery,
  };
}

describe('VentureContextManager', () => {
  let manager;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    manager = new VentureContextManager({ supabaseClient: mockSupabase, sessionId: 'test-session' });
  });

  describe('constructor', () => {
    it('should create instance with custom supabase client', () => {
      expect(manager).toBeInstanceOf(VentureContextManager);
      expect(manager.supabase).toBe(mockSupabase);
    });

    it('should accept sessionId option', () => {
      expect(manager.sessionId).toBe('test-session');
    });

    it('should initialize with null cache', () => {
      expect(manager._cachedVentureId).toBeNull();
      expect(manager._cachedVenture).toBeNull();
    });
  });

  describe('getActiveVentureId', () => {
    it('should return null when no active session', async () => {
      const result = await manager.getActiveVentureId();
      expect(result).toBeNull();
    });

    it('should return cached venture ID on subsequent calls', async () => {
      manager._cachedVentureId = 'test-venture-id';
      const result = await manager.getActiveVentureId();
      expect(result).toBe('test-venture-id');
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should return null when session has no active_venture_id in metadata', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { session_id: 's1', metadata: {}, status: 'active' },
          error: null,
        }),
      });

      const result = await manager.getActiveVentureId();
      expect(result).toBeNull();
    });

    it('should return and cache ventureId from session metadata', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { session_id: 's1', metadata: { active_venture_id: 'v-123' }, status: 'active' },
          error: null,
        }),
      });

      const result = await manager.getActiveVentureId();
      expect(result).toBe('v-123');
      expect(manager._cachedVentureId).toBe('v-123');
    });
  });

  describe('getActiveVenture', () => {
    it('should return null when no active venture id', async () => {
      const result = await manager.getActiveVenture();
      expect(result).toBeNull();
    });

    it('should return cached venture on second call', async () => {
      const venture = { id: 'v-1', name: 'TestVenture', status: 'active' };
      manager._cachedVentureId = 'v-1';
      manager._cachedVenture = venture;

      const result = await manager.getActiveVenture();
      expect(result).toBe(venture);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should fetch and cache venture from database', async () => {
      const venture = {
        id: 'v-1', name: 'TestVenture', status: 'active',
        current_lifecycle_stage: 5, archetype: 'saas', created_at: '2026-01-01',
      };
      manager._cachedVentureId = 'v-1';

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: venture, error: null }),
      });

      const result = await manager.getActiveVenture();
      expect(result).toEqual(venture);
      expect(manager._cachedVenture).toEqual(venture);
    });

    it('should return null when venture query errors', async () => {
      manager._cachedVentureId = 'v-1';

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      });

      const result = await manager.getActiveVenture();
      expect(result).toBeNull();
    });
  });

  describe('setActiveVenture', () => {
    it('should fail when venture does not exist', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      });

      const result = await manager.setActiveVenture('nonexistent-id');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Venture not found');
    });

    it('should fail when no active session', async () => {
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'v-1', name: 'Test', status: 'active', current_lifecycle_stage: 1 },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'No session' } }),
        };
      });

      const result = await manager.setActiveVenture('v-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No active session found');
    });

    it('should succeed when venture exists and session is active', async () => {
      const mockVenture = { id: 'v-123', name: 'TestVenture', status: 'active', current_lifecycle_stage: 3 };
      const mockSession = { session_id: 'sess-1', metadata: { auto_proceed: true }, status: 'active' };

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockVenture, error: null }),
          };
        }
        if (callCount === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      const result = await manager.setActiveVenture('v-123');
      expect(result.success).toBe(true);
      expect(result.venture).toEqual(mockVenture);
      expect(manager._cachedVentureId).toBe('v-123');
      expect(manager._cachedVenture).toEqual(mockVenture);
    });

    it('should return error when session update fails', async () => {
      const mockVenture = { id: 'v-1', name: 'Test', status: 'active', current_lifecycle_stage: 1 };
      const mockSession = { session_id: 's1', metadata: {}, status: 'active' };

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockVenture, error: null }),
          };
        }
        if (callCount === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: { message: 'DB timeout' } }),
        };
      });

      const result = await manager.setActiveVenture('v-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update session');
    });
  });

  describe('clearActiveVenture', () => {
    it('should fail when no active session', async () => {
      const result = await manager.clearActiveVenture();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active session');
    });

    it('should clear venture and reset cache', async () => {
      const session = {
        session_id: 's1',
        metadata: { active_venture_id: 'v-1', active_venture_name: 'Test', venture_set_at: '2026-01-01' },
        status: 'active',
      };

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: session, error: null }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      manager._cachedVentureId = 'v-1';
      manager._cachedVenture = { id: 'v-1' };

      const result = await manager.clearActiveVenture();
      expect(result.success).toBe(true);
      expect(manager._cachedVentureId).toBeNull();
      expect(manager._cachedVenture).toBeNull();
    });

    it('should return error on update failure', async () => {
      const session = { session_id: 's1', metadata: {}, status: 'active' };

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: session, error: null }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
        };
      });

      const result = await manager.clearActiveVenture();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to clear venture');
    });
  });

  describe('switchVenture', () => {
    it('should track previous venture ID on success', async () => {
      manager._cachedVentureId = 'old-venture';

      manager.setActiveVenture = vi.fn().mockResolvedValue({
        success: true,
        venture: { id: 'new-venture', name: 'New' },
      });

      const result = await manager.switchVenture('new-venture');
      expect(result.success).toBe(true);
      expect(result.previousVentureId).toBe('old-venture');
    });

    it('should not include previousVentureId on failure', async () => {
      manager._cachedVentureId = 'old-venture';

      manager.setActiveVenture = vi.fn().mockResolvedValue({
        success: false,
        error: 'Venture not found',
      });

      const result = await manager.switchVenture('nonexistent');
      expect(result.success).toBe(false);
      expect(result.previousVentureId).toBeUndefined();
    });
  });

  describe('listVentures', () => {
    it('should return all ventures', async () => {
      const ventures = [
        { id: 'v-1', name: 'A', status: 'active' },
        { id: 'v-2', name: 'B', status: 'ideation' },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: ventures, error: null }),
      });

      const result = await manager.listVentures();
      expect(result).toEqual(ventures);
    });

    it('should filter by status when provided', async () => {
      const ventures = [{ id: 'v-1', name: 'A', status: 'active' }];
      const mockEq = vi.fn().mockResolvedValue({ data: ventures, error: null });
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: mockEq,
      });

      const result = await manager.listVentures({ status: 'active' });
      expect(result).toEqual(ventures);
    });

    it('should return empty array on error', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      });

      const result = await manager.listVentures();
      expect(result).toEqual([]);
    });

    it('should return empty array when data is null', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await manager.listVentures();
      expect(result).toEqual([]);
    });
  });

  describe('getVentureScopedSDs', () => {
    it('should return empty array when no active venture', async () => {
      const result = await manager.getVentureScopedSDs();
      expect(result).toEqual([]);
    });

    it('should return SDs scoped to active venture', async () => {
      const venture = { id: 'v-1', name: 'TestV', status: 'active', current_lifecycle_stage: 3, archetype: 'saas', created_at: '2026-01-01' };
      const sds = [{ sd_key: 'SD-001', title: 'Test SD', status: 'in_progress' }];

      manager._cachedVentureId = 'v-1';
      manager._cachedVenture = venture;

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: sds, error: null }),
      });

      const result = await manager.getVentureScopedSDs();
      expect(result).toEqual(sds);
    });

    it('should return empty array on query error', async () => {
      manager._cachedVentureId = 'v-1';
      manager._cachedVenture = { id: 'v-1', name: 'Test' };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } }),
      });

      const result = await manager.getVentureScopedSDs();
      expect(result).toEqual([]);
    });
  });

  describe('hasActiveVenture', () => {
    it('should return false when no venture set', async () => {
      const result = await manager.hasActiveVenture();
      expect(result).toBe(false);
    });

    it('should return true when venture is cached', async () => {
      manager._cachedVentureId = 'some-venture';
      const result = await manager.hasActiveVenture();
      expect(result).toBe(true);
    });
  });

  describe('getStatusDisplay', () => {
    it('should show no active venture message', async () => {
      const display = await manager.getStatusDisplay();
      expect(display).toBe('No active venture (global context)');
    });

    it('should show formatted venture status', async () => {
      manager._cachedVentureId = 'v-1';
      manager._cachedVenture = { id: 'v-1', name: 'ProvenFlow', status: 'active', current_lifecycle_stage: 5 };

      const display = await manager.getStatusDisplay();
      expect(display).toBe('Active venture: ProvenFlow (Stage 5, active)');
    });

    it('should default to Stage 1 when lifecycle_stage is null', async () => {
      manager._cachedVentureId = 'v-1';
      manager._cachedVenture = { id: 'v-1', name: 'New', status: 'ideation', current_lifecycle_stage: null };

      const display = await manager.getStatusDisplay();
      expect(display).toBe('Active venture: New (Stage 1, ideation)');
    });
  });

  describe('invalidateCache', () => {
    it('should clear all cached data', () => {
      manager._cachedVentureId = 'test';
      manager._cachedVenture = { id: 'test' };

      manager.invalidateCache();

      expect(manager._cachedVentureId).toBeNull();
      expect(manager._cachedVenture).toBeNull();
    });
  });

  describe('createVentureContextManager factory', () => {
    it('should return a VentureContextManager instance', () => {
      const mgr = createVentureContextManager({ supabaseClient: mockSupabase });
      expect(mgr).toBeInstanceOf(VentureContextManager);
    });
  });
});
