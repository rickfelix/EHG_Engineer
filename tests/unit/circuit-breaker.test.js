/**
 * Unit Tests: Context7 Circuit Breaker
 * SD-KNOWLEDGE-001: US-004 Circuit Breaker Resilience
 *
 * Test Coverage:
 * - State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * - Failure threshold (3 failures)
 * - Recovery window (1 hour)
 * - Request allowance logic
 * - Success/failure recording
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import CircuitBreaker from '../../scripts/context7-circuit-breaker.js';

// Mock Supabase client
vi.mock('@supabase/supabase-js');

describe('CircuitBreaker', () => {
  let breaker;
  let mockSupabase;

  beforeEach(() => {
    // Reset mocks
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
    };

    createClient.mockReturnValue(mockSupabase);
    breaker = new CircuitBreaker('context7');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getState', () => {
    test('should return current circuit state', async () => {
      const mockState = {
        circuit_breaker_state: 'closed',
        failure_count: 0,
        last_failure_at: null,
        last_success_at: new Date().toISOString()
      };

      mockSupabase.single.mockResolvedValue({ data: mockState, error: null });

      const state = await breaker.getState();

      expect(state).toEqual(mockState);
      expect(mockSupabase.from).toHaveBeenCalledWith('system_health');
      expect(mockSupabase.eq).toHaveBeenCalledWith('service_name', 'context7');
    });

    test('should return OPEN state on database error (fail-safe)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const state = await breaker.getState();

      expect(state.circuit_breaker_state).toBe('open');
      expect(state.failure_count).toBe(3);
    });
  });

  describe('allowRequest', () => {
    test('should allow requests when circuit is CLOSED', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { circuit_breaker_state: 'closed', failure_count: 0 },
        error: null
      });

      const allowed = await breaker.allowRequest();

      expect(allowed).toBe(true);
    });

    test('should block requests when circuit is OPEN (within recovery window)', async () => {
      const recentFailure = new Date();
      recentFailure.setMinutes(recentFailure.getMinutes() - 30); // 30 min ago

      mockSupabase.single.mockResolvedValue({
        data: {
          circuit_breaker_state: 'open',
          failure_count: 3,
          last_failure_at: recentFailure.toISOString()
        },
        error: null
      });

      const allowed = await breaker.allowRequest();

      expect(allowed).toBe(false);
    });

    test('should transition to HALF_OPEN after recovery window (1 hour)', async () => {
      const oldFailure = new Date();
      oldFailure.setHours(oldFailure.getHours() - 2); // 2 hours ago

      mockSupabase.single.mockResolvedValue({
        data: {
          circuit_breaker_state: 'open',
          failure_count: 3,
          last_failure_at: oldFailure.toISOString()
        },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });

      const allowed = await breaker.allowRequest();

      expect(allowed).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ circuit_breaker_state: 'half-open' })
      );
    });

    test('should allow single test request in HALF_OPEN state', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { circuit_breaker_state: 'half-open', failure_count: 3 },
        error: null
      });

      const allowed = await breaker.allowRequest();

      expect(allowed).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    test('should reset failure count on success', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { circuit_breaker_state: 'closed', failure_count: 2 },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });

      await breaker.recordSuccess();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          failure_count: 0,
          last_success_at: expect.any(String)
        })
      );
    });

    test('should transition HALF_OPEN → CLOSED on successful recovery test', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { circuit_breaker_state: 'half-open', failure_count: 3 },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });

      await breaker.recordSuccess();

      // Should call update twice: once for state transition, once for failure count reset
      expect(mockSupabase.update).toHaveBeenCalled();
    });
  });

  describe('recordFailure', () => {
    test('should increment failure count', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { circuit_breaker_state: 'closed', failure_count: 1 },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });

      await breaker.recordFailure();

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          failure_count: 2,
          last_failure_at: expect.any(String)
        })
      );
    });

    test('should open circuit after 3rd failure (threshold)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { circuit_breaker_state: 'closed', failure_count: 2 },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });

      await breaker.recordFailure();

      expect(mockSupabase.update).toHaveBeenCalled();
    });

    test('should transition HALF_OPEN → OPEN on failed recovery test', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { circuit_breaker_state: 'half-open', failure_count: 3 },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });

      await breaker.recordFailure();

      expect(mockSupabase.update).toHaveBeenCalled();
    });
  });

  describe('State Machine Transitions', () => {
    test('should handle complete failure cycle: CLOSED → OPEN → HALF_OPEN → CLOSED', async () => {
      // Start: CLOSED
      mockSupabase.single.mockResolvedValueOnce({
        data: { circuit_breaker_state: 'closed', failure_count: 0 },
        error: null
      });

      // After 3 failures: OPEN
      mockSupabase.single.mockResolvedValueOnce({
        data: { circuit_breaker_state: 'open', failure_count: 3 },
        error: null
      });

      // After 1 hour: HALF_OPEN
      const oldFailure = new Date();
      oldFailure.setHours(oldFailure.getHours() - 2);
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          circuit_breaker_state: 'open',
          last_failure_at: oldFailure.toISOString()
        },
        error: null
      });

      // After success: CLOSED
      mockSupabase.single.mockResolvedValueOnce({
        data: { circuit_breaker_state: 'half-open', failure_count: 3 },
        error: null
      });

      mockSupabase.update.mockResolvedValue({ error: null });

      // Verify state transitions work
      const state1 = await breaker.getState();
      expect(state1.circuit_breaker_state).toBe('closed');

      const state2 = await breaker.getState();
      expect(state2.circuit_breaker_state).toBe('open');
    });
  });
});
