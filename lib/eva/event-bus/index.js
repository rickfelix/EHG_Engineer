/**
 * EVA Event Bus
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * Central module for event bus handler wiring.
 * Registers handlers at startup and provides event processing API.
 */

import { registerHandler, getHandler, listRegisteredTypes, getHandlerCount, clearHandlers, getRegistryCounts } from './handler-registry.js';
import { processEvent, replayDLQEntry } from './event-router.js';
import { handleStageCompleted } from './handlers/stage-completed.js';
import { handleDecisionSubmitted } from './handlers/decision-submitted.js';
import { handleGateEvaluated } from './handlers/gate-evaluated.js';
import { handleSdCompleted } from './handlers/sd-completed.js';
import { handleVentureCreated } from './handlers/venture-created.js';
import { handleVentureKilled } from './handlers/venture-killed.js';
import { handleBudgetExceeded } from './handlers/budget-exceeded.js';
import { handleChairmanOverride } from './handlers/chairman-override.js';
import { handleStageFailed } from './handlers/stage-failed.js';

let _initialized = false;

/**
 * Check if the event bus feature flag is enabled.
 * Falls back to EVA_EVENT_BUS_ENABLED env var.
 * @param {object} supabase
 * @returns {Promise<boolean>}
 */
async function isEventBusEnabled(supabase) {
  // Check env var first (fastest)
  if (process.env.EVA_EVENT_BUS_ENABLED === 'true') return true;
  if (process.env.EVA_EVENT_BUS_ENABLED === 'false') return false;

  // Check database config
  try {
    const { data } = await supabase
      .from('eva_config')
      .select('value')
      .eq('key', 'event_bus.enabled')
      .single();
    return data?.value === 'true';
  } catch {
    return true;
  }
}

/**
 * Initialize event bus handlers.
 * Idempotent - safe to call multiple times (hot-reload safe).
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ registered: boolean, handlerCount: number, types: string[] }>}
 */
export async function initializeEventBus(supabase) {
  const enabled = await isEventBusEnabled(supabase);

  if (!enabled) {
    // Clear any existing handlers when disabled
    clearHandlers();
    _initialized = false;
    return { registered: false, handlerCount: 0, types: [], reason: 'feature_flag_off' };
  }

  // Register handlers (idempotent - re-registration replaces)
  registerHandler('stage.completed', handleStageCompleted, {
    name: 'StageCompletedHandler',
    retryable: true,
    maxRetries: 3,
  });

  registerHandler('decision.submitted', handleDecisionSubmitted, {
    name: 'DecisionSubmittedHandler',
    retryable: true,
    maxRetries: 3,
  });

  registerHandler('gate.evaluated', handleGateEvaluated, {
    name: 'GateEvaluatedHandler',
    retryable: true,
    maxRetries: 3,
  });

  registerHandler('sd.completed', handleSdCompleted, {
    name: 'SdCompletedHandler',
    retryable: true,
    maxRetries: 3,
  });

  registerHandler('venture.created', handleVentureCreated, {
    name: 'VentureCreatedHandler',
    retryable: true,
    maxRetries: 3,
  });

  registerHandler('venture.killed', handleVentureKilled, {
    name: 'VentureKilledHandler',
    retryable: true,
    maxRetries: 2,
  });

  registerHandler('budget.exceeded', handleBudgetExceeded, {
    name: 'BudgetExceededHandler',
    retryable: true,
    maxRetries: 3,
  });

  registerHandler('chairman.override', handleChairmanOverride, {
    name: 'ChairmanOverrideHandler',
    retryable: true,
    maxRetries: 2,
  });

  registerHandler('stage.failed', handleStageFailed, {
    name: 'StageFailedHandler',
    retryable: true,
    maxRetries: 3,
  });

  _initialized = true;

  const types = listRegisteredTypes();
  return { registered: true, handlerCount: getHandlerCount(), types };
}

/**
 * Check if the event bus has been initialized.
 */
export function isInitialized() {
  return _initialized;
}

// Re-export for direct use
export {
  registerHandler,
  getHandler,
  listRegisteredTypes,
  getHandlerCount,
  clearHandlers,
  getRegistryCounts,
  processEvent,
  replayDLQEntry,
};

// Vision event pub/sub (SD-MAN-INFRA-EVENT-BUS-BACKBONE-001)
export {
  publishVisionEvent,
  subscribeVisionEvent,
  clearVisionSubscribers,
  getSubscriberCount,
  VISION_EVENTS,
} from './vision-events.js';

export { registerVisionScoredHandlers } from './handlers/vision-scored.js';
export { registerVisionGapDetectedHandlers } from './handlers/vision-gap-detected.js';
export { registerVisionProcessGapDetectedHandlers } from './handlers/vision-process-gap-detected.js';
