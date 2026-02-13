/**
 * Tests for lib/eva/venture-monitor.js
 * SD: SD-EVA-FEAT-EVENT-MONITOR-001
 *
 * Covers: VentureMonitor class
 * Focus: Realtime event handling, cron scheduling, deduplication,
 *        advisory locks, graceful shutdown, event logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VentureMonitor } from '../../../lib/eva/venture-monitor.js';

function createMockSupabase() {
  const channels = [];
  const insertedEvents = [];

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb) => {
      if (cb) cb('SUBSCRIBED');
      return mockChannel;
    }),
  };

  const supabase = {
    channel: vi.fn(() => {
      channels.push(mockChannel);
      return mockChannel;
    }),
    removeChannel: vi.fn(),
    from: vi.fn((table) => {
      if (table === 'eva_event_log') {
        return {
          insert: vi.fn((data) => {
            insertedEvents.push(data);
            return Promise.resolve({ error: null });
          }),
        };
      }
      // Default: query builder for eva_ventures
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ data: [], error: null }),
            lte: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          gte: vi.fn().mockReturnValue({
            // For chained .gte().lte() etc
            mockResolvedValue: vi.fn(),
          }),
        }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    _channels: channels,
    _insertedEvents: insertedEvents,
    _mockChannel: mockChannel,
  };

  return supabase;
}

describe('VentureMonitor', () => {
  let monitor;
  let mockSupabase;
  let mockProcessStage;
  let mockLogger;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    mockProcessStage = vi.fn().mockResolvedValue({
      ventureId: 'v1',
      stageId: 5,
      status: 'COMPLETED',
    });
    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    monitor = new VentureMonitor({
      supabase: mockSupabase,
      processStage: mockProcessStage,
      config: {
        cronPollIntervalMs: 999_999_999, // Very high so cron never fires during tests
        healthSweepHourUtc: 2,
        opsCycleIntervalHours: 6,
      },
      logger: mockLogger,
    });
  });

  afterEach(async () => {
    if (monitor.running) {
      await monitor.stop();
    }
    vi.restoreAllMocks();
  });

  describe('start and stop', () => {
    it('subscribes to realtime channels on start', async () => {
      await monitor.start();

      expect(mockSupabase.channel).toHaveBeenCalledWith('venture-monitor-decisions');
      expect(mockSupabase.channel).toHaveBeenCalledWith('venture-monitor-artifacts');
      expect(monitor.running).toBe(true);
    });

    it('removes channels and stops cron on stop', async () => {
      await monitor.start();
      await monitor.stop();

      expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(2);
      expect(monitor.running).toBe(false);
    });

    it('is idempotent - multiple starts do not duplicate subscriptions', async () => {
      await monitor.start();
      await monitor.start(); // second call should be no-op

      // Only 2 channels created (decisions + artifacts)
      expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
    });

    it('clears processed events set on stop', async () => {
      await monitor.start();
      monitor.processedEvents.add('test:1');
      expect(monitor.processedEvents.size).toBe(1);

      await monitor.stop();
      expect(monitor.processedEvents.size).toBe(0);
    });
  });

  describe('Realtime: chairman_decisions approval', () => {
    it('calls processStage when decision status changes to approved', async () => {
      await monitor.start();

      // Get the handler registered for chairman_decisions
      const decisionsChannel = mockSupabase._mockChannel;
      const handler = decisionsChannel.on.mock.calls[0][2];

      // Simulate approved decision
      await handler({
        new: { id: 'd1', venture_id: 'v1', status: 'approved' },
        old: { id: 'd1', venture_id: 'v1', status: 'pending' },
      });

      expect(mockProcessStage).toHaveBeenCalledTimes(1);
      expect(mockProcessStage).toHaveBeenCalledWith(
        expect.objectContaining({ ventureId: 'v1' }),
        expect.objectContaining({ supabase: mockSupabase })
      );
    });

    it('logs succeeded event after successful processStage', async () => {
      await monitor.start();
      const handler = mockSupabase._mockChannel.on.mock.calls[0][2];

      await handler({
        new: { id: 'd1', venture_id: 'v1', status: 'approved' },
        old: { id: 'd1', venture_id: 'v1', status: 'pending' },
      });

      // Check event was logged
      const eventInsert = mockSupabase._insertedEvents.find(
        e => e.event_type === 'venture_advancement' && e.status === 'succeeded'
      );
      expect(eventInsert).toBeDefined();
      expect(eventInsert.trigger_source).toBe('realtime');
      expect(eventInsert.venture_id).toBe('v1');
      expect(eventInsert.correlation_id).toBeTruthy();
    });

    it('deduplicates - same decision ID triggers processStage only once', async () => {
      await monitor.start();
      const handler = mockSupabase._mockChannel.on.mock.calls[0][2];

      const payload = {
        new: { id: 'd1', venture_id: 'v1', status: 'approved' },
        old: { id: 'd1', venture_id: 'v1', status: 'pending' },
      };

      await handler(payload);
      await handler(payload); // duplicate

      expect(mockProcessStage).toHaveBeenCalledTimes(1);

      // Second call should log suppressed
      const suppressed = mockSupabase._insertedEvents.find(
        e => e.status === 'suppressed'
      );
      expect(suppressed).toBeDefined();
      expect(suppressed.metadata.reason).toBe('duplicate');
    });

    it('ignores non-approved status changes', async () => {
      await monitor.start();
      const handler = mockSupabase._mockChannel.on.mock.calls[0][2];

      await handler({
        new: { id: 'd2', venture_id: 'v2', status: 'rejected' },
        old: { id: 'd2', venture_id: 'v2', status: 'pending' },
      });

      expect(mockProcessStage).not.toHaveBeenCalled();
    });

    it('ignores already-approved to approved (no-op update)', async () => {
      await monitor.start();
      const handler = mockSupabase._mockChannel.on.mock.calls[0][2];

      await handler({
        new: { id: 'd3', venture_id: 'v3', status: 'approved' },
        old: { id: 'd3', venture_id: 'v3', status: 'approved' },
      });

      expect(mockProcessStage).not.toHaveBeenCalled();
    });

    it('logs failed event when processStage throws', async () => {
      mockProcessStage.mockRejectedValueOnce(new Error('Stage execution failed'));

      await monitor.start();
      const handler = mockSupabase._mockChannel.on.mock.calls[0][2];

      await handler({
        new: { id: 'd4', venture_id: 'v4', status: 'approved' },
        old: { id: 'd4', venture_id: 'v4', status: 'pending' },
      });

      const failed = mockSupabase._insertedEvents.find(
        e => e.event_type === 'venture_advancement' && e.status === 'failed'
      );
      expect(failed).toBeDefined();
      expect(failed.error_message).toBe('Stage execution failed');
    });
  });

  describe('Realtime: venture_artifacts', () => {
    it('logs artifact creation event', async () => {
      await monitor.start();
      // Artifacts handler is the second .on() call
      const handler = mockSupabase._mockChannel.on.mock.calls[1][2];

      await handler({
        new: {
          id: 'a1',
          venture_id: 'v1',
          artifact_type: 'critique_report',
          lifecycle_stage: 3,
          title: 'Critique for Stage 3',
        },
      });

      const logged = mockSupabase._insertedEvents.find(
        e => e.event_type === 'artifact_created'
      );
      expect(logged).toBeDefined();
      expect(logged.status).toBe('succeeded');
      expect(logged.metadata.artifact_type).toBe('critique_report');
    });

    it('handles null payload gracefully', async () => {
      await monitor.start();
      const handler = mockSupabase._mockChannel.on.mock.calls[1][2];

      // Should not throw
      await handler({ new: null });
      expect(mockSupabase._insertedEvents).toHaveLength(0);
    });
  });

  describe('Cron scheduler', () => {
    it('starts cron timer on start', async () => {
      await monitor.start();
      expect(monitor.cronTimer).toBeTruthy();
    });

    it('stops cron timer on stop', async () => {
      await monitor.start();
      await monitor.stop();
      expect(monitor.cronTimer).toBeNull();
    });

    it('acquires advisory lock before running cron job', async () => {
      // Setup: make _isDue return true for opsCycle
      monitor._lastRun.opsCycle = null;

      // Mock eva_ventures query to return empty (so job completes quickly)
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'eva_event_log') {
          return {
            insert: vi.fn((data) => {
              mockSupabase._insertedEvents.push(data);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      });

      await monitor._runCronJob('ops_cycle_check', async () => {});

      // Should have called rpc for advisory lock
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'pg_try_advisory_lock',
        expect.objectContaining({ lock_id: expect.any(Number) })
      );
    });

    it('skips job and logs suppressed when lock not acquired', async () => {
      // Lock acquisition fails
      mockSupabase.rpc.mockResolvedValueOnce({ data: false, error: null });

      await monitor._runCronJob('test_job', async () => {
        throw new Error('Should not run');
      });

      const suppressed = mockSupabase._insertedEvents.find(
        e => e.status === 'suppressed' && e.metadata?.reason === 'lock_contention'
      );
      expect(suppressed).toBeDefined();
      expect(suppressed.job_name).toBe('test_job');
    });

    it('logs failed event when cron job throws', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      await monitor._runCronJob('failing_job', async () => {
        throw new Error('Cron job exploded');
      });

      const failed = mockSupabase._insertedEvents.find(
        e => e.status === 'failed' && e.job_name === 'failing_job'
      );
      expect(failed).toBeDefined();
      expect(failed.error_message).toBe('Cron job exploded');
    });

    it('releases advisory lock after job completion', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null }) // acquire
        .mockResolvedValueOnce({ data: true, error: null }); // release

      await monitor._runCronJob('test_release', async () => {});

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'pg_advisory_unlock',
        expect.objectContaining({ lock_id: expect.any(Number) })
      );
    });

    it('releases advisory lock even if job throws', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null }) // acquire
        .mockResolvedValueOnce({ data: true, error: null }); // release

      await monitor._runCronJob('test_release_on_error', async () => {
        throw new Error('boom');
      });

      // Second rpc call should be unlock
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
      expect(mockSupabase.rpc.mock.calls[1][0]).toBe('pg_advisory_unlock');
    });
  });

  describe('_isDue', () => {
    it('returns true when job has never run', () => {
      expect(monitor._isDue(new Date(), 'healthSweep', 24)).toBe(true);
    });

    it('returns false when job ran recently', () => {
      const now = new Date();
      monitor._lastRun.healthSweep = new Date(now.getTime() - 3600_000); // 1h ago
      expect(monitor._isDue(now, 'healthSweep', 24)).toBe(false);
    });

    it('returns true when enough time has elapsed', () => {
      const now = new Date();
      monitor._lastRun.opsCycle = new Date(now.getTime() - 7 * 3600_000); // 7h ago
      expect(monitor._isDue(now, 'opsCycle', 6)).toBe(true);
    });
  });

  describe('Graceful shutdown', () => {
    it('sets _shutdownRequested to prevent new job starts', async () => {
      await monitor.start();
      expect(monitor._shutdownRequested).toBe(false);

      const stopPromise = monitor.stop();
      expect(monitor._shutdownRequested).toBe(true);
      await stopPromise;
    });

    it('waits for active jobs before completing stop', async () => {
      await monitor.start();

      // Simulate an active job
      monitor._activeJobs = 1;

      const stopPromise = monitor.stop();

      // Job completes after 50ms (well within 30s deadline)
      setTimeout(() => { monitor._activeJobs = 0; }, 50);

      await stopPromise;

      expect(monitor.running).toBe(false);
    });
  });

  describe('Event logging', () => {
    it('inserts event into eva_event_log table', async () => {
      await monitor._logEvent({
        eventType: 'test_event',
        triggerSource: 'manual',
        ventureId: 'v1',
        correlationId: '00000000-0000-0000-0000-000000000001',
        status: 'succeeded',
        metadata: { test: true },
      });

      expect(mockSupabase._insertedEvents).toHaveLength(1);
      const event = mockSupabase._insertedEvents[0];
      expect(event.event_type).toBe('test_event');
      expect(event.trigger_source).toBe('manual');
      expect(event.venture_id).toBe('v1');
      expect(event.status).toBe('succeeded');
    });

    it('handles logging failure gracefully', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'eva_event_log') {
          return {
            insert: vi.fn().mockRejectedValue(new Error('DB down')),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      // Should not throw
      await monitor._logEvent({
        eventType: 'test',
        triggerSource: 'manual',
        correlationId: 'c1',
        status: 'succeeded',
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to log event')
      );
    });

    it('includes optional fields when provided', async () => {
      const scheduledTime = new Date('2026-02-13T02:00:00Z');
      await monitor._logEvent({
        eventType: 'cron_trigger',
        triggerSource: 'cron',
        correlationId: 'c2',
        status: 'succeeded',
        jobName: 'portfolio_health_sweep',
        scheduledTime,
        errorMessage: null,
      });

      const event = mockSupabase._insertedEvents[0];
      expect(event.job_name).toBe('portfolio_health_sweep');
      expect(event.scheduled_time).toBe(scheduledTime.toISOString());
    });
  });

  describe('Helper functions', () => {
    it('_hashJobName returns consistent hash for same input', () => {
      const hash1 = monitor._hashJobName('portfolio_health_sweep');
      const hash2 = monitor._hashJobName('portfolio_health_sweep');
      expect(hash1).toBe(hash2);
    });

    it('_hashJobName returns different hashes for different inputs', () => {
      const hash1 = monitor._hashJobName('portfolio_health_sweep');
      const hash2 = monitor._hashJobName('ops_cycle_check');
      expect(hash1).not.toBe(hash2);
    });

    it('_jobNameToKey maps known job names', () => {
      expect(monitor._jobNameToKey('portfolio_health_sweep')).toBe('healthSweep');
      expect(monitor._jobNameToKey('ops_cycle_check')).toBe('opsCycle');
      expect(monitor._jobNameToKey('release_scheduling')).toBe('releaseScheduling');
      expect(monitor._jobNameToKey('nursery_reevaluation')).toBe('nurseryReeval');
    });

    it('_jobNameToKey returns null for unknown job names', () => {
      expect(monitor._jobNameToKey('unknown_job')).toBeNull();
    });
  });
});
