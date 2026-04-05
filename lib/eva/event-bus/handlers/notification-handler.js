/**
 * Notification Event Handler — Digest & Summary via Event Bus
 * SD: SD-OKR-AUTO-KR-GOV-1-2-001 (US-002)
 *
 * Converts Notification Scheduler's interval-based triggers into
 * Event Bus subscriptions. Daily digest and weekly summary execute
 * as event handlers rather than standalone scheduler intervals.
 */

import { runDailyDigestScheduler, runWeeklySummaryScheduler } from '../../../notifications/scheduler.js';

/**
 * Handle daily digest delivery via event bus.
 * Triggered by 'notification.digest.due' event.
 *
 * @param {object} payload - { supabase }
 * @param {object} context - Event context from router
 * @returns {Promise<object>} Handler result
 */
export async function handleDailyDigest(payload, context) {
  const { supabase } = payload;
  if (!supabase) {
    return { status: 'error', reason: 'Missing supabase client in payload' };
  }

  const results = await runDailyDigestScheduler(supabase);
  return {
    status: 'success',
    handler: 'notification-daily-digest',
    results,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Handle weekly summary delivery via event bus.
 * Triggered by 'notification.summary.due' event.
 *
 * @param {object} payload - { supabase }
 * @param {object} context - Event context from router
 * @returns {Promise<object>} Handler result
 */
export async function handleWeeklySummary(payload, context) {
  const { supabase } = payload;
  if (!supabase) {
    return { status: 'error', reason: 'Missing supabase client in payload' };
  }

  const results = await runWeeklySummaryScheduler(supabase);
  return {
    status: 'success',
    handler: 'notification-weekly-summary',
    results,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Register notification handlers with a handler registry.
 * Called during system initialization to wire notification delivery
 * into the unified event bus.
 *
 * @param {object} registry - Handler registry instance (from createHandlerRegistry)
 */
export function registerNotificationHandlers(registry) {
  registry.registerHandler('notification.digest.due', handleDailyDigest, {
    name: 'notification-daily-digest',
    retryable: true,
    maxRetries: 2,
  });

  registry.registerHandler('notification.summary.due', handleWeeklySummary, {
    name: 'notification-weekly-summary',
    retryable: true,
    maxRetries: 2,
  });
}
