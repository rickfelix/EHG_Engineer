/**
 * Tests for Mock Mode Module
 * SD-GENESIS-V31-MASON-P2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  assertMockMode,
  isMockModeEnabled,
  requireMockMode,
} from '../mock-mode.js';

describe('Mock Mode Module', () => {
  const originalEnv = process.env.EHG_MOCK_MODE;

  beforeEach(() => {
    // Reset environment before each test
    delete process.env.EHG_MOCK_MODE;
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.EHG_MOCK_MODE = originalEnv;
    } else {
      delete process.env.EHG_MOCK_MODE;
    }
  });

  describe('assertMockMode', () => {
    it('should throw when EHG_MOCK_MODE is not set', () => {
      expect(() => assertMockMode()).toThrow('[GENESIS SAFETY]');
    });

    it('should throw when EHG_MOCK_MODE is false', () => {
      process.env.EHG_MOCK_MODE = 'false';
      expect(() => assertMockMode()).toThrow('[GENESIS SAFETY]');
    });

    it('should not throw when EHG_MOCK_MODE is true', () => {
      process.env.EHG_MOCK_MODE = 'true';
      expect(() => assertMockMode()).not.toThrow();
    });

    it('should throw with descriptive message', () => {
      expect(() => assertMockMode()).toThrow('simulation code cannot run in production');
    });
  });

  describe('isMockModeEnabled', () => {
    it('should return false when not set', () => {
      expect(isMockModeEnabled()).toBe(false);
    });

    it('should return false when set to false', () => {
      process.env.EHG_MOCK_MODE = 'false';
      expect(isMockModeEnabled()).toBe(false);
    });

    it('should return true when set to true', () => {
      process.env.EHG_MOCK_MODE = 'true';
      expect(isMockModeEnabled()).toBe(true);
    });
  });

  describe('requireMockMode', () => {
    it('should throw with custom context', () => {
      expect(() => requireMockMode('TestFeature')).toThrow('TestFeature requires EHG_MOCK_MODE=true');
    });

    it('should not throw when mock mode enabled', () => {
      process.env.EHG_MOCK_MODE = 'true';
      expect(() => requireMockMode('TestFeature')).not.toThrow();
    });
  });
});
