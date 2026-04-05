/**
 * Consolidation Health Check — System Count Verification
 * SD: SD-OKR-AUTO-KR-GOV-1-2-001 (US-005)
 *
 * Reports the current state of the event/scheduler consolidation.
 * Verifies the 5-to-2 reduction target by enumerating active subsystems
 * and their routing status (legacy vs unified).
 */

import { getRegistryCounts, listRegisteredTypes } from './event-bus/handler-registry.js';

/**
 * System definitions for consolidation tracking.
 * Each entry represents one of the original 5 systems.
 */
const SYSTEM_DEFINITIONS = [
  {
    id: 'eva-master-scheduler',
    name: 'EVA Master Scheduler',
    originalFile: 'lib/eva/eva-master-scheduler.js',
    consolidatedInto: 'unified-event-system',
    role: 'Venture orchestration polling and dispatch',
  },
  {
    id: 'rounds-scheduler',
    name: 'Rounds Scheduler',
    originalFile: 'lib/eva/rounds-scheduler.js',
    consolidatedInto: 'pipeline-orchestrator',
    role: 'Cadence-based round processing',
  },
  {
    id: 'event-bus-router',
    name: 'Event Bus / Router',
    originalFile: 'lib/eva/event-bus/event-router.js',
    consolidatedInto: 'unified-event-system',
    role: 'Tri-modal event dispatch (core of unified system)',
  },
  {
    id: 'pipeline-scheduler',
    name: 'Pipeline Scheduler',
    originalFile: 'lib/eva/pipeline-runner/pipeline-scheduler.js',
    consolidatedInto: 'pipeline-orchestrator',
    role: 'Synthetic venture batch generation',
  },
  {
    id: 'notification-scheduler',
    name: 'Notification Scheduler',
    originalFile: 'lib/notifications/scheduler.js',
    consolidatedInto: 'unified-event-system',
    role: 'Chairman digest and summary delivery',
  },
];

/**
 * Target consolidated subsystems.
 */
const TARGET_SUBSYSTEMS = [
  {
    id: 'unified-event-system',
    name: 'Unified Event-Driven System',
    description: 'Event Bus/Router as central dispatcher, absorbing venture dispatch and notification delivery',
    absorbs: ['eva-master-scheduler', 'event-bus-router', 'notification-scheduler'],
  },
  {
    id: 'pipeline-orchestrator',
    name: 'Specialized Pipeline Orchestrator',
    description: 'Pipeline Scheduler for batch generation + cadence-based round processing',
    absorbs: ['rounds-scheduler', 'pipeline-scheduler'],
  },
];

/**
 * Run the consolidation health check.
 *
 * @param {object} [options]
 * @param {object} [options.handlerRegistry] - Handler registry to check for registered handlers
 * @param {object} [options.adapterMetrics] - Metrics from scheduler-to-eventbus adapter
 * @returns {object} Health check report
 */
export function runConsolidationHealthCheck(options = {}) {
  const { handlerRegistry, adapterMetrics } = options;

  const notificationHandlersRegistered = handlerRegistry
    ? (handlerRegistry.getHandler('notification.digest.due') !== null
       && handlerRegistry.getHandler('notification.summary.due') !== null)
    : false;

  const ventureHandlerRegistered = handlerRegistry
    ? handlerRegistry.getHandler('scheduler.venture.dispatch') !== null
    : false;

  const systemStatus = SYSTEM_DEFINITIONS.map(sys => {
    let routingStatus = 'legacy';
    if (sys.id === 'event-bus-router') {
      routingStatus = 'active-core';
    } else if (sys.id === 'notification-scheduler' && notificationHandlersRegistered) {
      routingStatus = 'unified';
    } else if (sys.id === 'eva-master-scheduler' && ventureHandlerRegistered) {
      routingStatus = 'unified';
    } else if (sys.id === 'rounds-scheduler') {
      // Already delegates to EvaMasterScheduler
      routingStatus = 'delegated';
    } else if (sys.id === 'pipeline-scheduler') {
      routingStatus = 'active-core';
    }

    return { ...sys, routingStatus };
  });

  const unifiedCount = systemStatus.filter(
    s => s.routingStatus === 'unified' || s.routingStatus === 'active-core'
  ).length;

  const legacyCount = systemStatus.filter(s => s.routingStatus === 'legacy').length;

  const registeredEventTypes = handlerRegistry
    ? handlerRegistry.listRegisteredTypes()
    : [];

  return {
    timestamp: new Date().toISOString(),
    consolidation: {
      originalSystems: 5,
      targetSystems: 2,
      currentUnified: unifiedCount,
      currentLegacy: legacyCount,
      targetMet: legacyCount === 0,
    },
    subsystems: TARGET_SUBSYSTEMS.map(sub => ({
      ...sub,
      components: systemStatus.filter(s => s.consolidatedInto === sub.id),
    })),
    systems: systemStatus,
    eventBus: {
      registeredEventTypes: registeredEventTypes.length,
      notificationHandlers: notificationHandlersRegistered,
      ventureHandler: ventureHandlerRegistered,
    },
    adapter: adapterMetrics || null,
  };
}
