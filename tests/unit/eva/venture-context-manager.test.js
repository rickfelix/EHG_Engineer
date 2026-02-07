/**
 * Tests for VentureContextManager
 * SD-LEO-INFRA-VENTURE-CONTEXT-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VentureContextManager } from '../../../lib/eva/venture-context-manager.js';

// Mock Supabase client
function createMockSupabase(overrides = {}) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
    manager = new VentureContextManager({ supabaseClient: mockSupabase });
  });

  describe('constructor', () => {
    it('should create instance with custom supabase client', () => {
      expect(manager).toBeInstanceOf(VentureContextManager);
      expect(manager.supabase).toBe(mockSupabase);
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
      // Should not call supabase when cached
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('setActiveVenture', () => {
    it('should fail when venture does not exist', async () => {
      // Mock venture lookup returns no data
      const mockFrom = vi.fn().mockImplementation((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          };
        }
        return createMockSupabase().from(table);
      });
      manager.supabase = { from: mockFrom };

      const result = await manager.setActiveVenture('nonexistent-id');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Venture not found');
    });

    it('should succeed when venture exists and session is active', async () => {
      const mockVenture = { id: 'v-123', name: 'TestVenture', status: 'active', current_lifecycle_stage: 3 };
      const mockSession = { session_id: 'sess-1', metadata: { auto_proceed: true }, status: 'active' };

      const mockFrom = vi.fn().mockImplementation((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockVenture, error: null }),
          };
        }
        if (table === 'claude_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return createMockSupabase().from(table);
      });
      manager.supabase = { from: mockFrom };

      const result = await manager.setActiveVenture('v-123');
      expect(result.success).toBe(true);
      expect(result.venture).toEqual(mockVenture);
      expect(manager._cachedVentureId).toBe('v-123');
    });
  });

  describe('clearActiveVenture', () => {
    it('should fail when no active session', async () => {
      const result = await manager.clearActiveVenture();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active session');
    });
  });

  describe('switchVenture', () => {
    it('should track previous venture ID', async () => {
      manager._cachedVentureId = 'old-venture';

      // Mock setActiveVenture
      manager.setActiveVenture = vi.fn().mockResolvedValue({
        success: true,
        venture: { id: 'new-venture', name: 'New' },
      });

      const result = await manager.switchVenture('new-venture');
      expect(result.success).toBe(true);
      expect(result.previousVentureId).toBe('old-venture');
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
      expect(display).toContain('No active venture');
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
});
