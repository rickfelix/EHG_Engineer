/**
 * Test Utilities Unit Tests
 *
 * Part of Phase 1 Testing Infrastructure (B1.3)
 * Tests: 5 unit tests
 */

import { describe, it, expect } from 'vitest';
import {
  waitForCondition,
  generateTestId,
  createTestContext,
  retryAction,
} from '../../helpers/test-utils.js';

describe('Test Utilities', () => {
  describe('waitForCondition', () => {
    it('should wait until condition is met', async () => {
      let counter = 0;
      const condition = () => {
        counter++;
        return counter >= 3;
      };

      await waitForCondition(condition, {
        timeout: 1000,
        interval: 50,
      });

      expect(counter).toBeGreaterThanOrEqual(3);
    });

    it('should timeout if condition never met', async () => {
      const condition = () => false;

      await expect(
        waitForCondition(condition, {
          timeout: 500,
          interval: 100,
          timeoutMessage: 'Custom timeout',
        })
      ).rejects.toThrow('Custom timeout');
    });
  });

  describe('generateTestId', () => {
    it('should generate unique test IDs with prefix', () => {
      const id1 = generateTestId('test');
      const id2 = generateTestId('test');

      expect(id1).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should use default prefix if not provided', () => {
      const id = generateTestId();

      expect(id).toMatch(/^test-\d+-[a-z0-9]+$/);
    });
  });

  describe('createTestContext', () => {
    it('should create test context with metadata', () => {
      const ctx = createTestContext({
        prefix: 'my-test',
        metadata: { feature: 'auth', story: 'SD-001' },
      });

      expect(ctx.testId).toMatch(/^my-test-\d+-[a-z0-9]+$/);
      expect(ctx.startTime).toBeTruthy();
      expect(ctx.metadata.feature).toBe('auth');
      expect(ctx.metadata.story).toBe('SD-001');
      expect(Array.isArray(ctx.screenshots)).toBe(true);
      expect(Array.isArray(ctx.logs)).toBe(true);
      expect(Array.isArray(ctx.errors)).toBe(true);
    });

    it('should work without options', () => {
      const ctx = createTestContext();

      expect(ctx.testId).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(ctx.startTime).toBeTruthy();
      expect(ctx.metadata).toEqual({});
    });
  });

  describe('retryAction', () => {
    it('should retry action until success', async () => {
      let attempts = 0;

      const action = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Not yet');
        }
        return 'success';
      };

      const result = await retryAction(action, {
        maxAttempts: 5,
        delay: 10,
        backoff: 1,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw error after max attempts', async () => {
      let attempts = 0;

      const action = async () => {
        attempts++;
        throw new Error('Always fails');
      };

      await expect(
        retryAction(action, {
          maxAttempts: 3,
          delay: 10,
          backoff: 1,
        })
      ).rejects.toThrow('Action failed after 3 attempts');

      expect(attempts).toBe(3);
    });
  });
});
