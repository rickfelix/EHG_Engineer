/**
 * Agent Observability Unit Tests
 *
 * Part of Quick Wins Path - Week 1 (Task 4)
 * Tests: Core observability functionality without database dependency
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AgentObservability } from '../../../lib/agents/observability.cjs';

describe('Agent Observability System', () => {
  let observability;

  beforeEach(() => {
    // Create fresh instance for each test
    observability = new AgentObservability();
    // Set initialized to true to bypass database checks
    observability.initialized = true;
  });

  // Test 1: Tracker creation and lifecycle
  describe('startTracking', () => {
    it('should create a tracker with unique ID and timestamp', () => {
      const tracker1 = observability.startTracking('VALIDATION');
      const tracker2 = observability.startTracking('VALIDATION');

      expect(tracker1).toBeTruthy();
      expect(tracker1.trackerId).toBeTruthy();
      expect(tracker1.agentCode).toBe('VALIDATION');
      expect(tracker1.startTime).toBeTruthy();
      expect(typeof tracker1.end).toBe('function');

      // Each tracker should have unique ID
      expect(tracker1.trackerId).not.toBe(tracker2.trackerId);
    });

    it('should store context data', () => {
      const context = {
        path: './src',
        fileCount: 125,
        validationType: 'strict',
      };

      const tracker = observability.startTracking('VALIDATION', context);

      expect(tracker.context).toEqual(context);
    });

    it('should add tracker to active trackers', () => {
      const tracker = observability.startTracking('TESTING');

      const activeTrackers = observability.getActiveTrackers();
      expect(activeTrackers.length).toBe(1);
      expect(activeTrackers[0].agentCode).toBe('TESTING');
      expect(activeTrackers[0].trackerId).toBe(tracker.trackerId);
    });

    it('should handle multiple concurrent trackers', () => {
      observability.startTracking('VALIDATION');
      observability.startTracking('TESTING');
      observability.startTracking('DATABASE');

      const activeTrackers = observability.getActiveTrackers();
      expect(activeTrackers.length).toBe(3);

      const agentCodes = activeTrackers.map((t) => t.agentCode);
      expect(agentCodes).toContain('VALIDATION');
      expect(agentCodes).toContain('TESTING');
      expect(agentCodes).toContain('DATABASE');
    });
  });

  // Test 2: Tracker end and metrics calculation
  describe('tracker.end', () => {
    it('should calculate execution time', async () => {
      const tracker = observability.startTracking('VALIDATION');

      // Wait a bit to ensure measurable time
      await new Promise((resolve) => setTimeout(resolve, 10));

      const metrics = await tracker.end({ success: true });

      expect(metrics).toBeTruthy();
      expect(metrics.executionTime).toBeGreaterThan(0);
      expect(metrics.agentCode).toBe('VALIDATION');
      expect(metrics.success).toBe(true);
    });

    it('should mark as success by default', async () => {
      const tracker = observability.startTracking('TESTING');
      const metrics = await tracker.end({});

      expect(metrics.success).toBe(true);
    });

    it('should handle explicit failure', async () => {
      const tracker = observability.startTracking('DATABASE');
      const metrics = await tracker.end({
        success: false,
        error: 'Connection timeout',
      });

      expect(metrics.success).toBe(false);
      expect(metrics.error).toBe('Connection timeout');
    });

    it('should merge context from start and end', async () => {
      const tracker = observability.startTracking('VALIDATION', {
        path: './src',
      });

      const metrics = await tracker.end({
        success: true,
        context: { filesChecked: 125 },
      });

      expect(metrics.context).toEqual({
        path: './src',
        filesChecked: 125,
      });
    });

    it('should include data payload', async () => {
      const tracker = observability.startTracking('TESTING');

      const testData = {
        testsRun: 50,
        testsPassed: 48,
        testsFailed: 2,
        coverage: 85.5,
      };

      const metrics = await tracker.end({
        success: true,
        data: testData,
      });

      expect(metrics.data).toEqual(testData);
    });

    it('should remove tracker from active trackers', async () => {
      const tracker = observability.startTracking('VALIDATION');

      expect(observability.getActiveTrackers().length).toBe(1);

      await tracker.end({ success: true });

      expect(observability.getActiveTrackers().length).toBe(0);
    });
  });

  // Test 3: Active tracker management
  describe('getActiveTrackers', () => {
    it('should return empty array when no trackers active', () => {
      const active = observability.getActiveTrackers();

      expect(Array.isArray(active)).toBe(true);
      expect(active.length).toBe(0);
    });

    it('should include duration for active trackers', async () => {
      observability.startTracking('VALIDATION');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 20));

      const active = observability.getActiveTrackers();

      expect(active.length).toBe(1);
      expect(active[0].duration).toBeGreaterThan(10);
    });

    it('should track all required fields', () => {
      const context = { path: './src' };
      observability.startTracking('TESTING', context);

      const active = observability.getActiveTrackers();

      expect(active[0].agentCode).toBe('TESTING');
      expect(active[0].trackerId).toBeTruthy();
      expect(active[0].startTime).toBeTruthy();
      expect(active[0].duration).toBeGreaterThanOrEqual(0);
      expect(active[0].context).toEqual(context);
    });
  });

  // Test 4: Summary calculation
  describe('_calculateSummary', () => {
    it('should return zero metrics for empty records', () => {
      const summary = observability._calculateSummary([]);

      expect(summary.totalExecutions).toBe(0);
      expect(summary.successfulExecutions).toBe(0);
      expect(summary.failedExecutions).toBe(0);
      expect(summary.successRate).toBe(0);
      expect(summary.avgExecutionTime).toBe(0);
      expect(summary.maxExecutionTime).toBe(0);
      expect(summary.firstSeen).toBeNull();
      expect(summary.lastSeen).toBeNull();
    });

    it('should calculate metrics for single record', () => {
      const records = [
        {
          total_executions: 10,
          successful_executions: 8,
          failed_executions: 2,
          avg_execution_time: 500,
          max_execution_time: 1200,
          measurement_date: '2025-10-26',
        },
      ];

      const summary = observability._calculateSummary(records);

      expect(summary.totalExecutions).toBe(10);
      expect(summary.successfulExecutions).toBe(8);
      expect(summary.failedExecutions).toBe(2);
      expect(summary.successRate).toBe(0.8);
      expect(summary.avgExecutionTime).toBe(500);
      expect(summary.maxExecutionTime).toBe(1200);
      expect(summary.firstSeen).toBe('2025-10-26');
      expect(summary.lastSeen).toBe('2025-10-26');
    });

    it('should aggregate metrics across multiple records', () => {
      const records = [
        {
          total_executions: 10,
          successful_executions: 9,
          failed_executions: 1,
          avg_execution_time: 400,
          max_execution_time: 800,
          measurement_date: '2025-10-26',
        },
        {
          total_executions: 5,
          successful_executions: 4,
          failed_executions: 1,
          avg_execution_time: 600,
          max_execution_time: 1200,
          measurement_date: '2025-10-25',
        },
      ];

      const summary = observability._calculateSummary(records);

      expect(summary.totalExecutions).toBe(15);
      expect(summary.successfulExecutions).toBe(13);
      expect(summary.failedExecutions).toBe(2);
      expect(summary.successRate).toBeCloseTo(13 / 15, 2);
      expect(summary.maxExecutionTime).toBe(1200);
      expect(summary.lastSeen).toBe('2025-10-26');
      expect(summary.firstSeen).toBe('2025-10-25');
    });

    it('should calculate weighted average execution time', () => {
      const records = [
        {
          total_executions: 100,
          successful_executions: 100,
          failed_executions: 0,
          avg_execution_time: 500, // 100 executions at 500ms avg
          max_execution_time: 1000,
          measurement_date: '2025-10-26',
        },
        {
          total_executions: 50,
          successful_executions: 50,
          failed_executions: 0,
          avg_execution_time: 800, // 50 executions at 800ms avg
          max_execution_time: 1500,
          measurement_date: '2025-10-25',
        },
      ];

      const summary = observability._calculateSummary(records);

      // Weighted average: (100*500 + 50*800) / 150 = 90,000 / 150 = 600
      expect(summary.avgExecutionTime).toBe(600);
    });

    it('should handle records with zero executions', () => {
      const records = [
        {
          total_executions: 0,
          successful_executions: 0,
          failed_executions: 0,
          avg_execution_time: 0,
          max_execution_time: 0,
          measurement_date: '2025-10-26',
        },
      ];

      const summary = observability._calculateSummary(records);

      expect(summary.totalExecutions).toBe(0);
      expect(summary.successRate).toBe(0);
      expect(summary.avgExecutionTime).toBe(0);
    });
  });

  // Test 5: Date utility
  describe('_getDateDaysAgo', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const date = observability._getDateDaysAgo(0);

      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should calculate correct date for 0 days ago (today)', () => {
      const date = observability._getDateDaysAgo(0);
      const today = new Date().toISOString().split('T')[0];

      expect(date).toBe(today);
    });

    it('should calculate date 7 days ago', () => {
      const date = observability._getDateDaysAgo(7);
      const expected = new Date();
      expected.setDate(expected.getDate() - 7);
      const expectedStr = expected.toISOString().split('T')[0];

      expect(date).toBe(expectedStr);
    });

    it('should handle 30 days ago', () => {
      const date = observability._getDateDaysAgo(30);
      const expected = new Date();
      expected.setDate(expected.getDate() - 30);
      const expectedStr = expected.toISOString().split('T')[0];

      expect(date).toBe(expectedStr);
    });

    it('should handle different day counts', () => {
      const date1 = observability._getDateDaysAgo(1);
      const date7 = observability._getDateDaysAgo(7);

      expect(date1).not.toBe(date7);

      // Verify format
      expect(date1).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(date7).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // Test 6: Cache management
  describe('clearCache', () => {
    it('should clear the metrics cache', () => {
      // Simulate some cache entries
      observability.metricsCache.set('VALIDATION', { test: 'data' });
      observability.metricsCache.set('TESTING', { test: 'data2' });

      expect(observability.metricsCache.size).toBe(2);

      observability.clearCache();

      expect(observability.metricsCache.size).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      observability.clearCache();
      observability.clearCache();

      expect(observability.metricsCache.size).toBe(0);
    });
  });
});
