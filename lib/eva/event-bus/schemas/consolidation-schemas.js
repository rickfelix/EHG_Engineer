/**
 * Consolidation Event Schemas
 * SD: SD-OKR-AUTO-KR-GOV-1-2-001 (US-001, US-002)
 *
 * Registers event schemas for the unified event-driven system:
 * - scheduler.venture.dispatch: Venture processing via Event Bus
 * - notification.digest.due: Daily digest delivery
 * - notification.summary.due: Weekly summary delivery
 */

import { registerSchema } from '../event-schema-registry.js';

/**
 * Register all consolidation event schemas.
 * Call during system initialization.
 */
export function registerConsolidationSchemas() {
  // US-001: Venture dispatch through Event Bus
  registerSchema('scheduler.venture.dispatch', '1.0.0', {
    required: {
      ventureId: 'string',
      priority: 'string',
    },
    optional: {
      stageArgs: 'object',
      deps: 'object',
      source: 'string',
      dispatchedAt: 'string',
    },
  });

  // US-002: Notification digest delivery
  registerSchema('notification.digest.due', '1.0.0', {
    required: {
      supabase: 'object',
    },
    optional: {
      triggeredAt: 'string',
      source: 'string',
    },
  });

  // US-002: Notification summary delivery
  registerSchema('notification.summary.due', '1.0.0', {
    required: {
      supabase: 'object',
    },
    optional: {
      triggeredAt: 'string',
      source: 'string',
    },
  });
}
