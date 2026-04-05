/**
 * Consolidation Initialization
 * SD: SD-OKR-AUTO-KR-GOV-1-2-001
 *
 * Wires the consolidated event/scheduler systems together during startup.
 * Registers notification handlers and consolidation event schemas
 * into the unified Event Bus.
 *
 * Call initConsolidation() during EVA system startup to activate
 * the unified event-driven architecture.
 */

import { registerHandler } from './event-bus/handler-registry.js';
import { handleDailyDigest, handleWeeklySummary, registerNotificationHandlers } from './event-bus/handlers/notification-handler.js';
import { registerConsolidationSchemas } from './event-bus/schemas/consolidation-schemas.js';

let _initialized = false;

/**
 * Initialize the consolidated event/scheduler system.
 * Idempotent — safe to call multiple times.
 *
 * Registers:
 * - Notification event handlers (digest + summary) in handler registry
 * - Consolidation event schemas (venture dispatch, notifications) in schema registry
 *
 * @param {object} [options]
 * @param {object} [options.handlerRegistry] - Custom registry (defaults to module-level singleton)
 * @param {object} [options.logger] - Logger instance
 */
export function initConsolidation(options = {}) {
  if (_initialized) return;

  const logger = options.logger || console;

  // Register event schemas for new consolidated event types
  registerConsolidationSchemas();
  logger.log('[Consolidation] Event schemas registered (scheduler.venture.dispatch, notification.digest.due, notification.summary.due)');

  // Register notification handlers in the handler registry
  if (options.handlerRegistry) {
    registerNotificationHandlers(options.handlerRegistry);
  } else {
    // Use module-level default handler registry
    registerHandler('notification.digest.due', handleDailyDigest, {
      name: 'notification-daily-digest',
      retryable: true,
      maxRetries: 2,
    });
    registerHandler('notification.summary.due', handleWeeklySummary, {
      name: 'notification-weekly-summary',
      retryable: true,
      maxRetries: 2,
    });
  }
  logger.log('[Consolidation] Notification handlers registered in Event Bus');

  _initialized = true;
  logger.log('[Consolidation] Initialization complete — unified event-driven system active');
}
