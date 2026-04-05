/**
 * Scheduler-to-EventBus Adapter
 * SD: SD-OKR-AUTO-KR-GOV-1-2-001 (US-001, US-004)
 *
 * Bridges EVA Master Scheduler venture dispatch to Event Bus/Router.
 * Provides backward-compatible interface while routing through the
 * unified event-driven system.
 *
 * Migration path:
 * 1. Old: EvaMasterScheduler.poll() → direct venture processing
 * 2. New: EvaMasterScheduler.poll() → adapter → Event Bus → handler → venture processing
 *
 * The adapter preserves the existing API surface (start/stop/poll)
 * while delegating dispatch to the Event Bus.
 */

/**
 * Create an adapter that bridges scheduler operations to Event Bus events.
 *
 * @param {object} options
 * @param {Function} options.processEvent - Event Bus processEvent function
 * @param {object} options.handlerRegistry - Handler registry for registering venture handlers
 * @param {object} [options.logger] - Logger instance
 * @returns {object} Adapter with venture dispatch methods
 */
export function createSchedulerAdapter({ processEvent, handlerRegistry, logger = console }) {
  let _dispatchCount = 0;
  let _errorCount = 0;
  const _startedAt = new Date().toISOString();

  return {
    /**
     * Dispatch a venture processing event through the Event Bus.
     * Replaces direct eva-orchestrator calls with event-driven dispatch.
     *
     * @param {object} venture - Venture data from scheduler queue
     * @param {object} deps - Dependencies (supabase, etc.)
     * @returns {Promise<object>} Dispatch result
     */
    async dispatchVenture(venture, deps) {
      try {
        const result = await processEvent('scheduler.venture.dispatch', {
          ventureId: venture.venture_id || venture.id,
          priority: venture.priority || 'normal',
          stageArgs: venture,
          deps,
          source: 'scheduler-adapter',
          dispatchedAt: new Date().toISOString(),
        });
        _dispatchCount++;
        return { status: 'dispatched', ventureId: venture.venture_id || venture.id, result };
      } catch (err) {
        _errorCount++;
        logger.error(`[SchedulerAdapter] Dispatch failed for venture ${venture.venture_id}: ${err.message}`);
        return { status: 'error', ventureId: venture.venture_id || venture.id, error: err.message };
      }
    },

    /**
     * Dispatch a notification event through the Event Bus.
     * Replaces direct notification scheduler interval calls.
     *
     * @param {'digest'|'summary'} type - Notification type
     * @param {object} deps - Dependencies (supabase)
     * @returns {Promise<object>} Dispatch result
     */
    async dispatchNotification(type, deps) {
      const eventType = type === 'digest'
        ? 'notification.digest.due'
        : 'notification.summary.due';

      try {
        const result = await processEvent(eventType, {
          supabase: deps.supabase,
          triggeredAt: new Date().toISOString(),
          source: 'scheduler-adapter',
        });
        return { status: 'dispatched', type, result };
      } catch (err) {
        logger.error(`[SchedulerAdapter] Notification dispatch failed: ${err.message}`);
        return { status: 'error', type, error: err.message };
      }
    },

    /**
     * Get adapter metrics for health reporting.
     * @returns {object} Metrics
     */
    getMetrics() {
      return {
        dispatchCount: _dispatchCount,
        errorCount: _errorCount,
        startedAt: _startedAt,
        uptime: Date.now() - new Date(_startedAt).getTime(),
      };
    },
  };
}
