/**
 * EVA Event Bus (Unified)
 * SD: SD-EHG-ORCH-FOUNDATION-CLEANUP-001-D
 *
 * Central module for unified event bus handler wiring.
 * Registers BOTH EVA handlers (singleton, persisted) and Vision handlers
 * (multi-subscriber, fire-and-forget) in a single registry at startup.
 */

import { registerHandler, getHandler, getHandlers, listRegisteredTypes, getHandlerCount, clearHandlers, getRegistryCounts } from './handler-registry.js';
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
import { registerVisionScoredHandlers } from './handlers/vision-scored.js';
import { registerVisionGapDetectedHandlers } from './handlers/vision-gap-detected.js';
import { registerVisionProcessGapDetectedHandlers } from './handlers/vision-process-gap-detected.js';
import { registerVisionCorrectiveSdCreatedHandlers } from './handlers/vision-corrective-sd-created.js';
import { registerVisionRescoreCompletedHandlers } from './handlers/vision-rescore-completed.js';

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
 * Initialize the unified event bus — EVA + Vision handlers in one registry.
 * Idempotent - safe to call multiple times (hot-reload safe).
 *
 * EVA handlers use singleton: true (one handler per event type, replaces on re-init).
 * Vision handlers use append mode (multiple subscribers per event type).
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

  // --- EVA handlers (singleton: true — one handler per event type, replaces existing) ---
  registerHandler('stage.completed', handleStageCompleted, {
    name: 'StageCompletedHandler',
    retryable: true,
    maxRetries: 3,
    singleton: true,
  });

  registerHandler('decision.submitted', handleDecisionSubmitted, {
    name: 'DecisionSubmittedHandler',
    retryable: true,
    maxRetries: 3,
    singleton: true,
  });

  registerHandler('gate.evaluated', handleGateEvaluated, {
    name: 'GateEvaluatedHandler',
    retryable: true,
    maxRetries: 3,
    singleton: true,
  });

  registerHandler('sd.completed', handleSdCompleted, {
    name: 'SdCompletedHandler',
    retryable: true,
    maxRetries: 3,
    singleton: true,
  });

  registerHandler('venture.created', handleVentureCreated, {
    name: 'VentureCreatedHandler',
    retryable: true,
    maxRetries: 3,
    singleton: true,
  });

  registerHandler('venture.killed', handleVentureKilled, {
    name: 'VentureKilledHandler',
    retryable: true,
    maxRetries: 2,
    singleton: true,
  });

  registerHandler('budget.exceeded', handleBudgetExceeded, {
    name: 'BudgetExceededHandler',
    retryable: true,
    maxRetries: 3,
    singleton: true,
  });

  registerHandler('chairman.override', handleChairmanOverride, {
    name: 'ChairmanOverrideHandler',
    retryable: true,
    maxRetries: 2,
    singleton: true,
  });

  registerHandler('stage.failed', handleStageFailed, {
    name: 'StageFailedHandler',
    retryable: true,
    maxRetries: 3,
    singleton: true,
  });

  // --- Vision handlers (multi-subscriber, fire-and-forget) ---
  // Each registerVision*Handlers() function is internally idempotent.
  registerVisionScoredHandlers();
  registerVisionGapDetectedHandlers();
  registerVisionProcessGapDetectedHandlers();
  registerVisionCorrectiveSdCreatedHandlers();
  registerVisionRescoreCompletedHandlers();

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
  getHandlers,
  listRegisteredTypes,
  getHandlerCount,
  clearHandlers,
  getRegistryCounts,
  processEvent,
  replayDLQEntry,
};

// Vision event pub/sub (backward-compatible API)
export {
  publishVisionEvent,
  subscribeVisionEvent,
  clearVisionSubscribers,
  getSubscriberCount,
  VISION_EVENTS,
} from './vision-events.js';

// Vision handler registration (for callers that register outside initializeEventBus)
export { registerVisionScoredHandlers } from './handlers/vision-scored.js';
export { registerVisionGapDetectedHandlers } from './handlers/vision-gap-detected.js';
export { registerVisionProcessGapDetectedHandlers } from './handlers/vision-process-gap-detected.js';
export { registerVisionCorrectiveSdCreatedHandlers } from './handlers/vision-corrective-sd-created.js';
export { registerVisionRescoreCompletedHandlers } from './handlers/vision-rescore-completed.js';
