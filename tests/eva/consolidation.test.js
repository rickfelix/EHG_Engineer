/**
 * Event/Scheduler Consolidation Tests
 * SD: SD-OKR-AUTO-KR-GOV-1-2-001
 *
 * Verifies the 5-to-2 system consolidation:
 * - Notification handlers registered in Event Bus
 * - Scheduler adapter dispatches events
 * - Consolidation health check reports correct counts
 * - Rounds scheduler tracks cadence for Pipeline Orchestrator
 * - Event schemas registered for new event types
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHandlerRegistry } from '../../lib/eva/event-bus/handler-registry.js';
import { registerNotificationHandlers, handleDailyDigest, handleWeeklySummary } from '../../lib/eva/event-bus/handlers/notification-handler.js';
import { createSchedulerAdapter } from '../../lib/eva/adapters/scheduler-to-eventbus-adapter.js';
import { runConsolidationHealthCheck } from '../../lib/eva/consolidation-health-check.js';
import { registerConsolidationSchemas } from '../../lib/eva/event-bus/schemas/consolidation-schemas.js';
import { hasSchema } from '../../lib/eva/event-bus/event-schema-registry.js';

describe('Event/Scheduler Consolidation (5→2)', () => {
  let registry;

  beforeEach(() => {
    registry = createHandlerRegistry();
  });

  describe('US-001: Unified Event Dispatch for Venture Processing', () => {
    it('should dispatch ventures through event bus adapter', async () => {
      let dispatched = null;
      const mockProcessEvent = async (eventType, payload) => {
        dispatched = { eventType, payload };
        return { status: 'ok' };
      };

      const adapter = createSchedulerAdapter({
        processEvent: mockProcessEvent,
        handlerRegistry: registry,
      });

      const result = await adapter.dispatchVenture(
        { venture_id: 'v-123', priority: 'high' },
        { supabase: {} }
      );

      expect(result.status).toBe('dispatched');
      expect(result.ventureId).toBe('v-123');
      expect(dispatched.eventType).toBe('scheduler.venture.dispatch');
      expect(dispatched.payload.ventureId).toBe('v-123');
      expect(dispatched.payload.priority).toBe('high');
    });

    it('should track dispatch metrics', async () => {
      const adapter = createSchedulerAdapter({
        processEvent: async () => ({ status: 'ok' }),
        handlerRegistry: registry,
      });

      await adapter.dispatchVenture({ venture_id: 'v-1' }, {});
      await adapter.dispatchVenture({ venture_id: 'v-2' }, {});

      const metrics = adapter.getMetrics();
      expect(metrics.dispatchCount).toBe(2);
      expect(metrics.errorCount).toBe(0);
    });

    it('should handle dispatch errors gracefully', async () => {
      const adapter = createSchedulerAdapter({
        processEvent: async () => { throw new Error('Bus unavailable'); },
        handlerRegistry: registry,
        logger: { error: () => {} },
      });

      const result = await adapter.dispatchVenture({ venture_id: 'v-fail' }, {});
      expect(result.status).toBe('error');
      expect(result.error).toContain('Bus unavailable');

      const metrics = adapter.getMetrics();
      expect(metrics.errorCount).toBe(1);
    });
  });

  describe('US-002: Notification Delivery as Event Subscription', () => {
    it('should register notification handlers in registry', () => {
      registerNotificationHandlers(registry);

      const digestHandler = registry.getHandler('notification.digest.due');
      const summaryHandler = registry.getHandler('notification.summary.due');

      expect(digestHandler).not.toBeNull();
      expect(summaryHandler).not.toBeNull();
      expect(digestHandler.name).toBe('notification-daily-digest');
      expect(summaryHandler.name).toBe('notification-weekly-summary');
    });

    it('should handle daily digest with supabase client', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [] }),
            }),
          }),
        }),
      };

      const result = await handleDailyDigest({ supabase: mockSupabase }, {});
      expect(result.status).toBe('success');
      expect(result.handler).toBe('notification-daily-digest');
    });

    it('should reject digest without supabase client', async () => {
      const result = await handleDailyDigest({}, {});
      expect(result.status).toBe('error');
      expect(result.reason).toContain('supabase');
    });

    it('should dispatch notification via adapter', async () => {
      let dispatched = null;
      const adapter = createSchedulerAdapter({
        processEvent: async (type, payload) => { dispatched = { type, payload }; return {}; },
        handlerRegistry: registry,
      });

      const result = await adapter.dispatchNotification('digest', { supabase: {} });
      expect(result.status).toBe('dispatched');
      expect(dispatched.type).toBe('notification.digest.due');
    });
  });

  describe('US-003: Rounds Scheduler Cadence Tracking', () => {
    it('should export getCadenceRegistrations', async () => {
      const { getCadenceRegistrations } = await import('../../lib/eva/rounds-scheduler.js');
      expect(typeof getCadenceRegistrations).toBe('function');
      const registrations = getCadenceRegistrations();
      expect(Array.isArray(registrations)).toBe(true);
    });
  });

  describe('US-004: Backward Compatibility Adapter', () => {
    it('should preserve adapter API (dispatchVenture, dispatchNotification, getMetrics)', () => {
      const adapter = createSchedulerAdapter({
        processEvent: async () => ({}),
        handlerRegistry: registry,
      });

      expect(typeof adapter.dispatchVenture).toBe('function');
      expect(typeof adapter.dispatchNotification).toBe('function');
      expect(typeof adapter.getMetrics).toBe('function');
    });
  });

  describe('US-005: System Count Verification and Health Check', () => {
    it('should report 5 original systems', () => {
      const report = runConsolidationHealthCheck();
      expect(report.consolidation.originalSystems).toBe(5);
      expect(report.systems).toHaveLength(5);
    });

    it('should report 2 target subsystems', () => {
      const report = runConsolidationHealthCheck();
      expect(report.consolidation.targetSystems).toBe(2);
      expect(report.subsystems).toHaveLength(2);
    });

    it('should detect notification handlers when registered', () => {
      registerNotificationHandlers(registry);
      const report = runConsolidationHealthCheck({ handlerRegistry: registry });
      expect(report.eventBus.notificationHandlers).toBe(true);
    });

    it('should detect legacy status without handlers', () => {
      const report = runConsolidationHealthCheck({ handlerRegistry: registry });
      expect(report.eventBus.notificationHandlers).toBe(false);
    });

    it('should include adapter metrics when provided', () => {
      const metrics = { dispatchCount: 10, errorCount: 0 };
      const report = runConsolidationHealthCheck({ adapterMetrics: metrics });
      expect(report.adapter).toEqual(metrics);
    });

    it('should track subsystem composition', () => {
      const report = runConsolidationHealthCheck();
      const unified = report.subsystems.find(s => s.id === 'unified-event-system');
      const pipeline = report.subsystems.find(s => s.id === 'pipeline-orchestrator');

      expect(unified.absorbs).toContain('eva-master-scheduler');
      expect(unified.absorbs).toContain('notification-scheduler');
      expect(pipeline.absorbs).toContain('rounds-scheduler');
      expect(pipeline.absorbs).toContain('pipeline-scheduler');
    });
  });

  describe('Event Schema Registration', () => {
    it('should register schemas for consolidation events', () => {
      registerConsolidationSchemas();
      expect(hasSchema('scheduler.venture.dispatch')).toBe(true);
      expect(hasSchema('notification.digest.due')).toBe(true);
      expect(hasSchema('notification.summary.due')).toBe(true);
    });
  });
});
